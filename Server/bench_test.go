package main

import (
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
)

// Mock auth token for testing
const mockAuthToken = "mock_token"

func init() {
	// Suppress global logs from socket.go specific calls (log.Printf)
	log.SetOutput(io.Discard)
	// Increase rate limit for benchmarks
	maxMsgsPerSecond = 1000000
}

// Setup a test server
func setupTestServer() *httptest.Server {
	// Initialize server with mocked components if necessary
	s := &Server{
		clients:         make(map[string]*Client),
		sessions:        make(map[string]*Session),
		// Use a discard logger to avoid cluttering test output
		logger: log.New(io.Discard, "", 0),
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}

	return httptest.NewServer(http.HandlerFunc(s.handle))
}

// Helper to generate a valid session token for testing
func getTestSessionToken(email string) string {
	// Calling the internal function from socket.go since we are in package main
	return generateSessionToken(email)
}

func connectClient(url, email string) (*websocket.Conn, error) {
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return nil, err
	}

	// Authenticate
	token := getTestSessionToken(email)
	authFrame := Frame{
		T:    "AUTH",
		Data: json.RawMessage(fmt.Sprintf(`{"token": "%s"}`, token)),
	}
	if err := conn.WriteJSON(authFrame); err != nil {
		return nil, err
	}

	// Read AUTH_SUCCESS
	var resp Frame
	if err := conn.ReadJSON(&resp); err != nil {
		return nil, err
	}
	if resp.T != "AUTH_SUCCESS" {
		return nil, fmt.Errorf("auth failed: %v", resp)
	}

	return conn, nil
}

// Helper to read MSG frame, skipping PINGs
func readMSG(conn *websocket.Conn) (*Frame, error) {
	for {
		var f Frame
		if err := conn.ReadJSON(&f); err != nil {
			return nil, err
		}
		if f.T == "PING" {
			continue
		}
		return &f, nil
	}
}

// Benchmark: Connection establishment (Handshake) latency
// This measures how fast we can open a websocket and authenticate.
func BenchmarkConnectionHandshake(b *testing.B) {
	// Suppress logs
	s := &Server{
		clients:         make(map[string]*Client),
		sessions:        make(map[string]*Session),
		// Use a dummy logger that writes to nowhere
		logger: log.New(io.Discard, "", 0),
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handle))
	defer ts.Close()
	wsUrl := "ws" + strings.TrimPrefix(ts.URL, "http")

	token := getTestSessionToken("bench_user@example.com")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		conn, _, err := websocket.DefaultDialer.Dial(wsUrl, nil)
		if err != nil {
			b.Fatal(err)
		}

		// Send Auth
		authFrame := Frame{
			T:    "AUTH",
			Data: json.RawMessage(fmt.Sprintf(`{"token": "%s"}`, token)),
		}
		if err := conn.WriteJSON(authFrame); err != nil {
			b.Fatal(err)
		}

		// Read Response
		var resp Frame
		if err := conn.ReadJSON(&resp); err != nil {
			b.Fatal(err)
		}

		conn.Close()
	}
}

// Benchmark: Message Relay Latency (Round Trip)
// Measures time for User A -> Server -> User B
func BenchmarkMessageRelayLatency(b *testing.B) {
	s := &Server{
		clients:         make(map[string]*Client),
		sessions:        make(map[string]*Session),
		logger:          log.New(io.Discard, "", 0),
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}

	ts := httptest.NewServer(http.HandlerFunc(s.handle))
	defer ts.Close()
	wsUrl := "ws" + strings.TrimPrefix(ts.URL, "http")

	// Setup two clients
	clientA, err := connectClient(wsUrl, "alice@example.com")
	if err != nil {
		b.Fatal(err)
	}
	defer clientA.Close()

	clientB, err := connectClient(wsUrl, "bob@example.com")
	if err != nil {
		b.Fatal(err)
	}
	defer clientB.Close()

	// Establish session (simulation without full handshake flow)
	// We just need them to be in a session on the server.
	// We can simulate CONNECT_REQ / JOIN_ACCEPT flow or force it.
	// Let's do the flow.

	// A requests B
	reqData := `{"targetEmail":"bob@example.com","publicKey":"keyA","senderEmail":"alice@example.com"}`
	if err := clientA.WriteJSON(Frame{T: "CONNECT_REQ", Data: json.RawMessage(reqData)}); err != nil {
		b.Fatal(err)
	}

	// B receives JOIN_REQUEST
	var joinReq Frame
	if err := clientB.ReadJSON(&joinReq); err != nil {
		b.Fatal(err)
	}
	sid := joinReq.SID

	// B Accepts
	acceptData := `{"publicKey":"keyB"}`
	if err := clientB.WriteJSON(Frame{T: "JOIN_ACCEPT", SID: sid, Data: json.RawMessage(acceptData)}); err != nil {
		b.Fatal(err)
	}

	// Consume the loopback/ack on A side if any, or B's message to A.
	// In socket.go: JOIN_ACCEPT forwards to requester (A).
	// So A receives JOIN_ACCEPT.
	var joinAccept Frame
	if err := clientA.ReadJSON(&joinAccept); err != nil {
		b.Fatal(err)
	}

	msgPayload := `{"payload":"encrypted_data"}`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		// A sends to B
		if err := clientA.WriteJSON(Frame{T: "MSG", SID: sid, Data: json.RawMessage(msgPayload)}); err != nil {
			b.Fatal(err)
		}

		// B reads
		msg, err := readMSG(clientB)
		if err != nil {
			b.Fatal(err)
		}
		if msg.T != "MSG" {
			b.Fatalf("expected MSG, got %s", msg.T)
		}
	}
}

// Benchmark: Throughput (Messages Per Second)
// We'll use parallel benchmark to simulate load
func BenchmarkMessageThroughput(b *testing.B) {
	s := &Server{
		clients:         make(map[string]*Client),
		sessions:        make(map[string]*Session),
		logger:          log.New(io.Discard, "", 0),
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}
	ts := httptest.NewServer(http.HandlerFunc(s.handle))
	defer ts.Close()
	wsUrl := "ws" + strings.TrimPrefix(ts.URL, "http")

	// We need a shared session for all parallel workers?
	// Or each worker creates its own pair.
	// Creating pairs is better to reduce lock contention on a single session map if we want to test server scalability.

	b.RunParallel(func(pb *testing.PB) {
		// Each worker creates a pair of users
		id := time.Now().UnixNano()
		emailA := fmt.Sprintf("userA_%d@example.com", id)
		emailB := fmt.Sprintf("userB_%d@example.com", id)

		cA, err := connectClient(wsUrl, emailA)
		if err != nil {
			return
		}
		defer cA.Close()
		cB, err := connectClient(wsUrl, emailB)
		if err != nil {
			return
		}
		defer cB.Close()

		// Start a reader for cA to consume PINGs/responses and prevent blocking
		go func() {
			for {
				var f Frame
				if err := cA.ReadJSON(&f); err != nil {
					return
				}
			}
		}()

		// Handshake
		reqData := fmt.Sprintf(`{"targetEmail":"%s","publicKey":"keyA","senderEmail":"%s"}`, emailB, emailA)
		if err := cA.WriteJSON(Frame{T: "CONNECT_REQ", Data: json.RawMessage(reqData)}); err != nil {
			return
		}

		var joinReq Frame
		if err := cB.ReadJSON(&joinReq); err != nil {
			return
		}
		sid := joinReq.SID

		if err := cB.WriteJSON(Frame{T: "JOIN_ACCEPT", SID: sid, Data: json.RawMessage(`{"publicKey":"keyB"}`)}); err != nil {
			return
		}

		// cA logic is handled by reader goroutine above (it consumes JOIN_ACCEPT too)
		// Wait, we need to ensure handshake completed before starting loop?
		// cA reader consumes EVERYTHING. So we can't synchronously check for JOIN_ACCEPT.
		// Benchmark logic assumes handshake works.
		// Alternatively, we read explicitly UNTIL handshake done, THEN start consumer loop.

		// Let's optimize:
		// cA sends CONNECT_REQ.
		// cB receives JOIN_REQ.
		// cB sends JOIN_ACCEPT.
		// cA receives JOIN_ACCEPT.
		// AFTER this, we start the consumer loop for cA.
		var joinAccept Frame
		if err := cA.ReadJSON(&joinAccept); err != nil {
			return
		}

		// Now assume session established. Start drainer.
		go func() {
			for {
				var f Frame
				if err := cA.ReadJSON(&f); err != nil {
					return
				}
			}
		}()

		msgPayload := json.RawMessage(`{"payload":"data"}`)

		for pb.Next() {
			if err := cA.WriteJSON(Frame{T: "MSG", SID: sid, Data: msgPayload}); err != nil {
				return
			}
			if _, err := readMSG(cB); err != nil {
				return
			}
		}
	})
}
