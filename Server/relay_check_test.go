package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/gorilla/websocket"
)

func TestRelayWorks(t *testing.T) {
	log.SetOutput(io.Discard)
	maxMsgsPerSecond = 1000000

	s := &Server{
		clients:  make(map[string]*Client),
		sessions: make(map[string]*Session),
		logger:   log.New(io.Discard, "", 0),
		rateLimiter: &RateLimiter{ipAttempts: make(map[string][]time.Time)},
	}
	db, _ := sql.Open("sqlite3", "file:relaytest?mode=memory&cache=private")
	for _, q := range []string{
		`CREATE TABLE IF NOT EXISTS devices (email_hash TEXT, public_key TEXT, last_active DATETIME, is_master BOOLEAN DEFAULT 0, PRIMARY KEY (email_hash, public_key))`,
		`CREATE TABLE IF NOT EXISTS requests (sender_hash TEXT, target_hash TEXT, encrypted_packet TEXT, timestamp DATETIME, PRIMARY KEY (sender_hash, target_hash))`,
		`CREATE TABLE IF NOT EXISTS friends (user1_hash TEXT, user2_hash TEXT, since DATETIME, sid TEXT, PRIMARY KEY (user1_hash, user2_hash))`,
		`CREATE TABLE IF NOT EXISTS sockets (email_hash TEXT, socket_id TEXT, public_key TEXT, PRIMARY KEY (email_hash, socket_id))`,
		`CREATE TABLE IF NOT EXISTS offline_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, email_hash TEXT, event_data TEXT, timestamp DATETIME)`,
	} {
		db.Exec(q)
	}
	s.db = db

	ts := httptest.NewServer(http.HandlerFunc(s.handle))
	defer ts.Close()
	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http")

	dial := func(email string) *websocket.Conn {
		conn, _, _ := websocket.DefaultDialer.Dial(wsURL, nil)
		token := generateSessionToken(email)
		conn.WriteJSON(Frame{T: "AUTH", Data: json.RawMessage(fmt.Sprintf(`{"token":"%s"}`, token))})
		var r Frame
		conn.SetReadDeadline(time.Now().Add(3 * time.Second))
		conn.ReadJSON(&r)
		conn.SetReadDeadline(time.Time{})
		if r.T != "AUTH_SUCCESS" {
			t.Fatalf("auth failed: %v", r)
		}
		return conn
	}

	cA := dial("alice@bench.com")
	defer cA.Close()
	cB := dial("bob@bench.com")
	defer cB.Close()

	time.Sleep(50 * time.Millisecond)

	sid := "testsid123"
	h1, h2 := emailHash("alice@bench.com"), emailHash("bob@bench.com")
	if h1 > h2 {
		h1, h2 = h2, h1
	}
	db.Exec("INSERT OR IGNORE INTO friends (user1_hash, user2_hash, since, sid) VALUES (?,?,?,?)", h1, h2, time.Now(), sid)

	s.mu.Lock()
	var clientA, clientB *Client
	for _, c := range s.clients {
		if c.email == "alice@bench.com" {
			clientA = c
		}
		if c.email == "bob@bench.com" {
			clientB = c
		}
	}
	t.Logf("clientA id=%v, clientB id=%v", clientA.id, clientB.id)
	s.sessions[sid] = &Session{id: sid, clients: map[string]*Client{clientA.id: clientA, clientB.id: clientB}}
	s.mu.Unlock()

	// Drain cA so DELIVERED frames don't block server
	go func() {
		for {
			if _, _, err := cA.ReadMessage(); err != nil {
				return
			}
		}
	}()

	payload := json.RawMessage(`{"payloads":{"k":"v"}}`)
	t.Log("sending MSG from cA...")
	cA.WriteJSON(Frame{T: "MSG", SID: sid, Data: payload})

	t.Log("waiting for MSG on cB...")
	cB.SetReadDeadline(time.Now().Add(3 * time.Second))
	for {
		var got Frame
		if err := cB.ReadJSON(&got); err != nil {
			t.Fatalf("read err: %v", err)
			break
		}
		t.Logf("got frame on cB: %s data=%s", got.T, got.Data)
		if got.T == "MSG" {
			t.Log("SUCCESS: got MSG on cB")
			break
		}
	}
}
