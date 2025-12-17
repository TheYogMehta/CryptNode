package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"
	"github.com/gorilla/websocket"
)

type Frame struct {
	T    string          `json:"t"`
	SID  string          `json:"sid,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

type Client struct {
	id   string
	conn *websocket.Conn
	mu   sync.Mutex
}

type Session struct {
	id      string
	hostID  string
	clients map[string]*Client
	invites map[string]string
	mu      sync.Mutex
}

type Server struct {
	clients  map[string]*Client
	sessions map[string]*Session
	mu       sync.Mutex
}

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func (s *Server) newID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

func (s *Server) send(c *Client, f Frame) {
	if c == nil { return }
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.WriteJSON(f)
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil { return }

	client := &Client{id: s.newID(), conn: ws}
	s.mu.Lock()
	s.clients[client.id] = client
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.clients, client.id)
		s.mu.Unlock()
		ws.Close()
	}()

	for {
		var frame Frame
		if err := ws.ReadJSON(&frame); err != nil { break }

		switch frame.T {
		case "CREATE_SESSION":
			sid := s.newID()
			sess := &Session{id: sid, hostID: client.id, clients: map[string]*Client{client.id: client}, invites: make(map[string]string)}
			s.mu.Lock()
			s.sessions[sid] = sess
			s.mu.Unlock()
			s.send(client, Frame{T: "SESSION_CREATED", SID: sid})

		case "REATTACH":
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()
			if sess != nil {
				sess.mu.Lock()
				sess.clients[client.id] = client 
				sess.mu.Unlock()
				log.Printf("[Server] Client reattached to session: %s", frame.SID)
			}

		case "INVITE_CREATE":
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()
			if sess == nil { continue }
			code := s.newID()
			sess.mu.Lock()
			sess.invites[code] = string(frame.Data)
			sess.mu.Unlock()
			s.send(client, Frame{T: "INVITE_CODE", SID: frame.SID, Data: json.RawMessage(fmt.Sprintf(`{"code":"%s"}`, code))})

		case "JOIN":
			var d map[string]string
			json.Unmarshal(frame.Data, &d)
			var target *Session
			var params string
			s.mu.Lock()
			for _, sess := range s.sessions {
				sess.mu.Lock()
				if p, ok := sess.invites[d["code"]]; ok {
					target, params = sess, p
					delete(sess.invites, d["code"])
					sess.mu.Unlock()
					break
				}
				sess.mu.Unlock()
			}
			s.mu.Unlock()

			if target != nil {
				s.send(s.clients[target.hostID], Frame{T: "JOIN_REQUEST", SID: target.id, Data: json.RawMessage(fmt.Sprintf(`{"clientID":"%s","publicKey":"%s"}`, client.id, d["publicKey"]))})
				s.send(client, Frame{T: "DH_PARAMS", SID: target.id, Data: json.RawMessage(params)})
			}

		case "JOIN_ACCEPT":
			var d map[string]string
			json.Unmarshal(frame.Data, &d)
			s.mu.Lock()
			sess, target := s.sessions[frame.SID], s.clients[d["clientID"]]
			s.mu.Unlock()
			if sess != nil && target != nil {
				sess.mu.Lock()
				sess.clients[target.id] = target
				sess.mu.Unlock()
				s.send(target, Frame{T: "JOINED", SID: frame.SID, Data: frame.Data})
			}

		case "MSG":
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()
			if sess != nil {
				sess.mu.Lock()
				for _, c := range sess.clients {
					if c.id != client.id { s.send(c, frame) }
				}
				sess.mu.Unlock()
			}
		}
	}
}

func main() {
	s := &Server{clients: make(map[string]*Client), sessions: make(map[string]*Session)}
	http.HandleFunc("/", s.handle)
	log.Println("✅ E2E Server running on :9000")
	http.ListenAndServe(":9000", nil)
}