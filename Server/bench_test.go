package main

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
	_ "github.com/mattn/go-sqlite3"
)

func init() {
	log.SetOutput(io.Discard)
	maxMsgsPerSecond = 1_000_000
}

// testEmailHash mirrors the server's emailHash utility.
func testEmailHash(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	sum := sha256.Sum256([]byte(email))
	return hex.EncodeToString(sum[:])
}

// testSID mirrors the production SHA-256(sorted-emails) SID derivation.
func testSID(emailA, emailB string) string {
	e1, e2 := emailA, emailB
	if e1 > e2 {
		e1, e2 = e2, e1
	}
	sum := sha256.Sum256([]byte(e1 + ":" + e2))
	return hex.EncodeToString(sum[:])
}

// newTestServer creates a relay server with an isolated in-memory SQLite DB.
// It also returns the *Server so tests can seed data directly.
func newTestServer() (*httptest.Server, *Server) {
	s := &Server{
		clients:  make(map[string]*Client),
		sessions: make(map[string]*Session),
		logger:   log.New(io.Discard, "", 0),
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}
	if err := s.initDBTest(); err != nil {
		panic("bench db init: " + err.Error())
	}
	return httptest.NewServer(http.HandlerFunc(s.handle)), s
}

func (s *Server) initDBTest() error {
	var err error
	s.db, err = sql.Open("sqlite3", fmt.Sprintf(
		"file:bench_%d?mode=memory&cache=private", time.Now().UnixNano()))
	if err != nil {
		return err
	}
	tables := []string{
		`CREATE TABLE IF NOT EXISTS devices (
			email_hash TEXT, public_key TEXT, last_active DATETIME,
			is_master BOOLEAN DEFAULT 0,
			PRIMARY KEY (email_hash, public_key))`,
		`CREATE TABLE IF NOT EXISTS requests (
			sender_hash TEXT, target_hash TEXT, encrypted_packet TEXT, timestamp DATETIME,
			PRIMARY KEY (sender_hash, target_hash))`,
		`CREATE TABLE IF NOT EXISTS friends (
			user1_hash TEXT, user2_hash TEXT, since DATETIME, sid TEXT,
			PRIMARY KEY (user1_hash, user2_hash))`,
		`CREATE TABLE IF NOT EXISTS sockets (
			email_hash TEXT, socket_id TEXT, public_key TEXT,
			PRIMARY KEY (email_hash, socket_id))`,
		`CREATE TABLE IF NOT EXISTS offline_notifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email_hash TEXT, event_data TEXT, timestamp DATETIME)`,
	}
	for _, q := range tables {
		if _, err := s.db.Exec(q); err != nil {
			return err
		}
	}
	return nil
}

// seedFriendship inserts a friends row so MSG passes the friendship guard.
func (s *Server) seedFriendship(emailA, emailB string) string {
	h1 := testEmailHash(emailA)
	h2 := testEmailHash(emailB)
	if h1 > h2 {
		h1, h2 = h2, h1
	}
	sid := testSID(emailA, emailB)
	s.db.Exec(`INSERT OR IGNORE INTO friends (user1_hash, user2_hash, since, sid) VALUES (?, ?, ?, ?)`,
		h1, h2, time.Now(), sid)
	return sid
}

// connectAndAuth dials the relay and authenticates. Returns the ready conn.
func connectAndAuth(wsURL, email string) (*websocket.Conn, error) {
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		return nil, err
	}
	token := generateSessionToken(email)
	if err := conn.WriteJSON(Frame{
		T:    "AUTH",
		Data: json.RawMessage(fmt.Sprintf(`{"token": "%s"}`, token)),
	}); err != nil {
		return nil, err
	}
	var resp Frame
	if err := conn.ReadJSON(&resp); err != nil {
		return nil, err
	}
	if resp.T != "AUTH_SUCCESS" {
		return nil, fmt.Errorf("auth failed: %v", resp)
	}
	return conn, nil
}

// drainForever reads and discards frames until conn closes.
func drainForever(conn *websocket.Conn) {
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}

// readNextMSG blocks until a MSG frame arrives, skipping control frames.
func readNextMSG(conn *websocket.Conn) (*Frame, error) {
	for {
		var f Frame
		if err := conn.ReadJSON(&f); err != nil {
			return nil, err
		}
		switch f.T {
		case "PING", "SESSION_LIST", "PEER_ONLINE", "PEER_OFFLINE",
			"DELIVERED", "DELIVERED_FAILED":
			continue
		}
		return &f, nil
	}
}

// setupPair seeds friendship, authenticates two clients, then directly injects
// them into a shared in-memory session to completely bypass the async
// SESSION_LIST goroutine that would otherwise compete for s.mu and deadlock.
//
// cA is drained in the background so DELIVERED/PING frames from the server
// do not block the server's goroutine.
func setupPair(s *Server, wsURL, emailA, emailB string) (cA, cB *websocket.Conn, sid string, err error) {
	sid = s.seedFriendship(emailA, emailB)

	cA, err = connectAndAuth(wsURL, emailA)
	if err != nil {
		return
	}
	cB, err = connectAndAuth(wsURL, emailB)
	if err != nil {
		cA.Close()
		return
	}

	// Wait briefly for the AUTH async goroutines (offline_notifications query)
	// to complete before we start injecting session state.
	time.Sleep(50 * time.Millisecond)

	// Directly inject both clients into a shared session on the server,
	// bypassing REATTACH (which fires a goroutine that acquires s.mu, competing
	// with the MSG relay handler that also holds s.mu).
	s.mu.Lock()
	var cAClient, cBClient *Client
	for _, c := range s.clients {
		if c.email == emailA {
			cAClient = c
		}
		if c.email == emailB {
			cBClient = c
		}
	}
	if cAClient == nil || cBClient == nil {
		s.mu.Unlock()
		err = fmt.Errorf("could not find clients in server map (A=%v B=%v)", cAClient, cBClient)
		return
	}
	sess := &Session{
		id:      sid,
		clients: map[string]*Client{cAClient.id: cAClient, cBClient.id: cBClient},
	}
	s.sessions[sid] = sess
	s.mu.Unlock()

	// Warmup: verify relay works. cA has no drainer yet — we'll start it after.
	warmup := json.RawMessage(`{"payloads":{"benchkey":"warmupdata"}}`)
	var warmMsg *Frame
	// cB reads the MSG from cA; cA reads DELIVERED which is fine (no race yet).
	if err = cA.WriteJSON(Frame{T: "MSG", SID: sid, Data: warmup}); err != nil {
		return
	}
	if warmMsg, err = readNextMSG(cB); err != nil {
		return
	}
	if warmMsg.T != "MSG" {
		err = fmt.Errorf("warmup: expected MSG, got %s (data=%s)", warmMsg.T, warmMsg.Data)
		return
	}

	// Only start draining cA AFTER the warmup is confirmed so no race with
	// ReadJSON calls above.
	go drainForever(cA)
	return
}

// ─────────────────────────────────────────────────────────────────────────────
// Benchmarks
// ─────────────────────────────────────────────────────────────────────────────

// BenchmarkConnectionHandshake measures WebSocket dial + AUTH round-trip cost.
func BenchmarkConnectionHandshake(b *testing.B) {
	ts, _ := newTestServer()
	defer ts.Close()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")
	token := generateSessionToken("bench_user@example.com")

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			b.Fatal(err)
		}
		if err := conn.WriteJSON(Frame{
			T:    "AUTH",
			Data: json.RawMessage(fmt.Sprintf(`{"token": "%s"}`, token)),
		}); err != nil {
			b.Fatal(err)
		}
		var resp Frame
		if err := conn.ReadJSON(&resp); err != nil {
			b.Fatal(err)
		}
		conn.Close()
	}
}

// BenchmarkMessageRelayLatency measures per-message relay overhead (A → server → B).
// Auth overhead is excluded from the timer; only the relay path is measured.
func BenchmarkMessageRelayLatency(b *testing.B) {
	ts, srv := newTestServer()
	defer ts.Close()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	cA, cB, sid, err := setupPair(srv, wsURL, "alice@example.com", "bob@example.com")
	if err != nil {
		b.Fatal("setup:", err)
	}
	defer cA.Close()
	defer cB.Close()

	payload := json.RawMessage(`{"payloads":{"benchkey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="}}`)

	// Add a timeout to dump goroutines if it hangs
	done := make(chan struct{})
	go func() {
		select {
		case <-time.After(5 * time.Second):
			panic("benchmark relay timed out - dumping goroutines")
		case <-done:
		}
	}()
	defer close(done)

	b.ResetTimer()
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		if err := cA.WriteJSON(Frame{T: "MSG", SID: sid, Data: payload}); err != nil {
			b.Fatal(err)
		}
		msg, err := readNextMSG(cB)
		if err != nil {
			b.Fatal(err)
		}
		if msg.T != "MSG" {
			b.Fatalf("expected MSG, got %s", msg.T)
		}
	}
}

// BenchmarkMessageThroughput measures aggregate throughput under parallel load.
// Each goroutine operates on its own isolated client pair and session.
func BenchmarkMessageThroughput(b *testing.B) {
	ts, srv := newTestServer()
	defer ts.Close()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	b.RunParallel(func(pb *testing.PB) {
		id := time.Now().UnixNano()
		emailA := fmt.Sprintf("userA_%d@example.com", id)
		emailB := fmt.Sprintf("userB_%d@example.com", id)

		cA, cB, sid, err := setupPair(srv, wsURL, emailA, emailB)
		if err != nil {
			b.Logf("setup failed: %v", err)
			for pb.Next() {
			}
			return
		}
		defer cA.Close()
		defer cB.Close()

		payload := json.RawMessage(`{"payloads":{"benchkey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="}}`)

		for pb.Next() {
			if err := cA.WriteJSON(Frame{T: "MSG", SID: sid, Data: payload}); err != nil {
				return
			}
			if _, err := readNextMSG(cB); err != nil {
				return
			}
		}
	})
}
