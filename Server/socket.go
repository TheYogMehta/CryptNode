package main

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	_ "github.com/mattn/go-sqlite3"

	crand "crypto/rand"
)

type Frame struct {
	T    string          `json:"t"`
	SID  string          `json:"sid,omitempty"`
	C    bool            `json:"c,omitempty"`
	P    int             `json:"p,omitempty"`
	SH   string          `json:"sh,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

type Client struct {
	id          string
	email       string
	conn        *websocket.Conn
	mu          sync.Mutex
	msgCount    int
	msgWindow   time.Time
	lastConnect time.Time
}

type Session struct {
	id      string
	clients map[string]*Client
	mu      sync.Mutex
}

type RateLimiter struct {
	ipAttempts map[string][]time.Time
	mu         sync.Mutex
}

type Server struct {
	clients         map[string]*Client
	sessions        map[string]*Session
	emailToClientId map[string]string
	mu              sync.Mutex
	logger          *log.Logger
	rateLimiter     *RateLimiter
	db              *sql.DB
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const (
	maxWSFrameBytes       = 1024 * 1024
	maxEncryptedDataBytes = 400 * 1024
	maxSIDLength          = 128
)

var maxMsgsPerSecond = 100

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func emailHash(email string) string {
	sum := sha256.Sum256([]byte(normalizeEmail(email)))
	return hex.EncodeToString(sum[:])
}

func (s *Server) allowMessage(c *Client) bool {
	c.mu.Lock()
	defer c.mu.Unlock()

	now := time.Now()
	if c.msgWindow.IsZero() || now.Sub(c.msgWindow) >= time.Second {
		c.msgWindow = now
		c.msgCount = 0
	}
	c.msgCount++
	return c.msgCount <= maxMsgsPerSecond
}

func (rl *RateLimiter) checkAuthRateLimit(ip string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	attempts, exists := rl.ipAttempts[ip]

	validAttempts := []time.Time{}
	if exists {
		for _, t := range attempts {
			if now.Sub(t) < time.Minute {
				validAttempts = append(validAttempts, t)
			}
		}
	}

	if len(validAttempts) >= 3 {
		rl.ipAttempts[ip] = validAttempts
		return false
	}

	validAttempts = append(validAttempts, now)
	rl.ipAttempts[ip] = validAttempts
	return true
}

func (s *Server) newID() string {
	b := make([]byte, 8)
	crand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
}

func verifyGoogleToken(token string) (string, error) {
	resp, err := http.Get("https://oauth2.googleapis.com/tokeninfo?id_token=" + token)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("invalid token")
	}

	var claims struct {
		Email string `json:"email"`
		Aud   string `json:"aud"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&claims); err != nil {
		return "", err
	}

	validClients := map[string]bool{
		"588653192623-aqs0s01hv62pbp5p7pe3r0h7mce8m10l.apps.googleusercontent.com": true, // Electron
		"588653192623-3lkl6bqaa77lk1g3l89uideuqf083g1o.apps.googleusercontent.com": true, // Android
	}

	if !validClients[claims.Aud] {
		return "", fmt.Errorf("invalid token audience: %s", claims.Aud)
	}

	return claims.Email, nil
}

func (s *Server) send(c *Client, f Frame) error {
	if c == nil {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	return c.conn.WriteJSON(f)
}

func (s *Server) logConnection(initiator, target string) {
	h1 := sha256.Sum256([]byte(initiator))
	iHash := hex.EncodeToString(h1[:])

	h2 := sha256.Sum256([]byte(target))
	tHash := hex.EncodeToString(h2[:])

	s.logger.Printf("CONNECTION: %s requested connection to %s on %s", iHash, tHash, time.Now().Format(time.RFC3339))
}

func GenerateTurnCreds(userId, secret string) (string, string) {
	expiry := time.Now().Add(10 * time.Minute).Unix()
	username := fmt.Sprintf("%d:%s", expiry, userId)
	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(username))
	password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return username, password
}

var sessionSecret []byte

func init() {
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️ No .env file found, relying on environment variables")
	}

	if os.Getenv("TURN_SECRET") == "" {
		log.Fatal("❌ TURN_SECRET is not set")
	}

	seed := strings.TrimSpace(os.Getenv("AUTH_SESSION_SECRET"))
	sum := sha256.Sum256([]byte(seed))
	sessionSecret = sum[:]
}

func generateSessionToken(email string) string {
	exp := time.Now().Add(30 * 24 * time.Hour).Unix()
	data := fmt.Sprintf("sess:%d:%s", exp, email)

	h := hmac.New(sha256.New, sessionSecret)
	h.Write([]byte(data))
	sig := hex.EncodeToString(h.Sum(nil))

	return fmt.Sprintf("%s:%s", data, sig)
}

func verifyAuthToken(token string) (string, string, error) {
	if strings.HasPrefix(token, "sess:") {
		parts := strings.Split(token, ":")
		if len(parts) != 4 {
			return "", "", fmt.Errorf("invalid session format")
		}
		expStr := parts[1]
		email := parts[2]
		sig := parts[3]

		data := fmt.Sprintf("sess:%s:%s", expStr, email)
		h := hmac.New(sha256.New, sessionSecret)
		h.Write([]byte(data))
		expectedSig := hex.EncodeToString(h.Sum(nil))

		if !hmac.Equal([]byte(sig), []byte(expectedSig)) {
			return "", "", fmt.Errorf("invalid signature")
		}

		exp, _ := strconv.ParseInt(expStr, 10, 64)
		if time.Now().Unix() > exp {
			return "", "", fmt.Errorf("token expired")
		}

		return email, token, nil
	}

	email, err := verifyGoogleToken(token)
	if err != nil {
		return "", "", err
	}

	newToken := generateSessionToken(email)
	return email, newToken, nil
}

func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	ws.SetReadLimit(maxWSFrameBytes)

	client := &Client{id: s.newID(), conn: ws}
	s.mu.Lock()
	s.clients[client.id] = client
	s.mu.Unlock()

	// Heartbeat
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			s.mu.Lock()
			_, exists := s.clients[client.id]
			s.mu.Unlock()
			if !exists {
				return
			}
			s.send(client, Frame{T: "PING"})
		}
	}()

	// Client Disconnect
	defer func() {
		s.mu.Lock()
		delete(s.clients, client.id)
		if client.email != "" {
			delete(s.emailToClientId, client.email)
		}
		s.mu.Unlock()

		if client.email != "" {
			s.db.Exec("DELETE FROM sockets WHERE socket_id = ?", client.id)
			// TODO: Notify friends that user is offline?
			// For now, we rely on polling or specific checks, or existing session logic.
		}

		// Clean up legacy sessions (optional, keeping for now to avoid breaking existing calls immediately)
		for _, sess := range s.sessions {
			sess.mu.Lock()
			_, wasMember := sess.clients[client.id]
			if wasMember {
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{
							T:   "PEER_OFFLINE",
							SID: sess.id,
						})
					}
				}
				delete(sess.clients, client.id)
			}
			sess.mu.Unlock()
		}

		ws.Close()
	}()

	for {
		var frame Frame
		if err := ws.ReadJSON(&frame); err != nil {
			break
		}

		switch frame.T {
		case "AUTH":
			var d struct {
				Token     string `json:"token"`
				PublicKey string `json:"publicKey"`
			}
			json.Unmarshal(frame.Data, &d)
			d.Token = strings.TrimSpace(d.Token)

			if !strings.HasPrefix(d.Token, "sess:") {
				ip := strings.Split(r.RemoteAddr, ":")[0]
				if !s.rateLimiter.checkAuthRateLimit(ip) {
					s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Too many login attempts. Try again later."}`)})
					client.conn.Close()
					return
				}
			}

			email, sessionToken, err := verifyAuthToken(d.Token)
			if err != nil {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth failed"}`)})
				continue
			}
			client.mu.Lock()
			client.email = email
			client.mu.Unlock()

			eh := emailHash(email)
			// Upsert user
			s.db.Exec("INSERT OR IGNORE INTO users (email_hash, public_key) VALUES (?, ?)", eh, d.PublicKey)
			if d.PublicKey != "" {
				s.db.Exec("UPDATE users SET public_key = ? WHERE email_hash = ?", d.PublicKey, eh)
			}
			// Register socket
			s.db.Exec("INSERT INTO sockets (email_hash, socket_id) VALUES (?, ?)", eh, client.id)

			s.mu.Lock()
			s.emailToClientId[email] = client.id // Legacy support
			s.mu.Unlock()

			resp := map[string]string{
				"email": email,
				"token": sessionToken,
			}
			respBytes, _ := json.Marshal(resp)
			s.send(client, Frame{T: "AUTH_SUCCESS", Data: json.RawMessage(respBytes)})

			// ---------------------------------------------------------
			// Server-Side Session Hydration
			// ---------------------------------------------------------
			go func() {
				// Query friends with SID
				rows, err := s.db.Query(`
					SELECT sid, user1_hash, user2_hash 
					FROM friends 
					WHERE (user1_hash = ? OR user2_hash = ?) AND sid IS NOT NULL
				`, eh, eh)
				if err != nil {
					log.Printf("Error querying sessions for %s: %v", email, err)
					return
				}
				defer rows.Close()

				var sessions []map[string]any

				for rows.Next() {
					var sid, u1, u2 string
					if err := rows.Scan(&sid, &u1, &u2); err != nil {
						continue
					}

					// Identify peer hash
					peerHash := u1
					if peerHash == eh {
						peerHash = u2
					}

					// Check if peer is online
					isOnline := false
					// Quick check in sockets table or memory
					// In memory is faster:
					s.mu.Lock()
					// But we only have emailToClientId...
					// And we have peerHash.
					// We can check sockets table for peerHash
					// Or maintain hashToClientId map.
					// Let's check DB for sockets for this peerHash
					// (nested query inside loop is meh, but okay for MVP)
					// Better: check if we have any client for this hash.
					// We don't have a direct map from Hash -> Client, but we can query DB or existing sessions?
					// Let's use the DB 'sockets' table which maps hash -> socket_id
					s.mu.Unlock()

					// Check online status
					var onlineCount int
					s.db.QueryRow("SELECT COUNT(*) FROM sockets WHERE email_hash = ?", peerHash).Scan(&onlineCount)
					isOnline = onlineCount > 0

					// Add to session list
					sessions = append(sessions, map[string]any{
						"sid":    sid,
						"online": isOnline,
						"peerHash": peerHash,
					})
					
					// Auto-join server session
					s.mu.Lock()
					sess, ok := s.sessions[sid]
					if !ok {
						sess = &Session{
							id:      sid,
							clients: map[string]*Client{client.id: client},
						}
						s.sessions[sid] = sess
					} else {
						sess.mu.Lock()
						sess.clients[client.id] = client
						sess.mu.Unlock()
					}
					s.mu.Unlock()
				}
				
				if sessions == nil {
					sessions = make([]map[string]any, 0)
				}
				listData, _ := json.Marshal(sessions)
				s.send(client, Frame{T: "SESSION_LIST", Data: json.RawMessage(listData)})
			}()
			// ---------------------------------------------------------

		case "UPDATE_PUBKEY":
			if client.email == "" {
				continue
			}
			var d struct {
				PublicKey string `json:"publicKey"`
			}
			json.Unmarshal(frame.Data, &d)
			if d.PublicKey != "" {
				s.db.Exec("UPDATE users SET public_key = ? WHERE email_hash = ?", d.PublicKey, emailHash(client.email))
			}

		case "GET_PUBLIC_KEY":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
			}
			json.Unmarshal(frame.Data, &d)
			targetEmail := normalizeEmail(d.TargetEmail)
			targetHash := emailHash(targetEmail)

			var pubKey string
			err := s.db.QueryRow("SELECT public_key FROM users WHERE email_hash = ?", targetHash).Scan(&pubKey)
			if err != nil {
				// Not found
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"User not found"}`)})
			} else {
				resp, _ := json.Marshal(map[string]string{
					"targetEmail": targetEmail,
					"targetHash":  targetHash,
					"publicKey":   pubKey,
				})
				s.send(client, Frame{T: "PUBLIC_KEY", Data: json.RawMessage(resp)})
			}

		case "FRIEND_REQUEST":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail     string `json:"targetEmail"`
				EncryptedPacket string `json:"encryptedPacket"`
			}
			json.Unmarshal(frame.Data, &d)
			
			targetEmail := normalizeEmail(d.TargetEmail)
			targetHash := emailHash(targetEmail)
			senderHash := emailHash(client.email)

			// Check Blocked
			var blocked int
			s.db.QueryRow("SELECT COUNT(*) FROM blocked WHERE blocker_hash = ? AND blocked_hash = ?", targetHash, senderHash).Scan(&blocked)
			if blocked > 0 {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"You are blocked by this user"}`)})
				continue
			}

			// Store Request
			_, err := s.db.Exec(`INSERT OR REPLACE INTO requests (sender_hash, target_hash, encrypted_packet, timestamp) 
				VALUES (?, ?, ?, ?)`, senderHash, targetHash, d.EncryptedPacket, time.Now())
			if err != nil {
				s.logger.Printf("Error storing request: %v", err)
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Failed to store request"}`)})
				continue
			}

			// Fetch sender public key
			var senderPub string
			s.db.QueryRow("SELECT public_key FROM users WHERE email_hash = ?", senderHash).Scan(&senderPub)

			// Notify Target if Online
			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			defer rows.Close()
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					reqData, _ := json.Marshal(map[string]string{
						"senderHash": senderHash,
						"encryptedPacket": d.EncryptedPacket,
						"publicKey": senderPub,
					})
					s.send(targetClient, Frame{T: "FRIEND_REQUEST", Data: json.RawMessage(reqData)})
				}
				s.mu.Unlock()
			}
			
			s.send(client, Frame{T: "REQUEST_SENT", Data: json.RawMessage(`{"success":true}`)})

		case "CONNECT_REQ_LEGACY": // Renaming old CONNECT_REQ to avoid conflict if I didn't delete it fully, but I will delete it.

			client.mu.Lock()
			if time.Since(client.lastConnect) < 1*time.Second {
				client.mu.Unlock()
				// Rate limit silent for legacys
			}
			client.mu.Unlock()
			// End Legacy logic placeholder

		case "FRIEND_ACCEPT":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`),})
				continue
			}
			var d struct {
				TargetEmail     string `json:"targetEmail"`
				EncryptedPacket string `json:"encryptedPacket"`
			}
			json.Unmarshal(frame.Data, &d)
			
			targetEmail := normalizeEmail(d.TargetEmail)
			targetHash := emailHash(targetEmail)
			senderHash := emailHash(client.email)

			// Add to friends (lexicographical order)
			u1, u2 := senderHash, targetHash
			if u1 > u2 {
				u1, u2 = u2, u1
			}
			
			// Calculate SID
			e1, e2 := client.email, targetEmail
			if e1 > e2 {
				e1, e2 = e2, e1
			}
			sidSum := sha256.Sum256([]byte(e1 + ":" + e2))
			sid := hex.EncodeToString(sidSum[:])

			_, err = s.db.Exec("INSERT OR IGNORE INTO friends (user1_hash, user2_hash, since, sid) VALUES (?, ?, ?, ?)", u1, u2, time.Now(), sid)
			if err != nil {
				s.logger.Printf("Error adding friend: %v", err)
			}

			// Delete request
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", targetHash, senderHash)

			// Fetch my public key (User B)
			var myPub string
			s.db.QueryRow("SELECT public_key FROM users WHERE email_hash = ?", senderHash).Scan(&myPub)

			// Notify Target
			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					respData, _ := json.Marshal(map[string]string{
						"senderHash": senderHash,
						"encryptedPacket": d.EncryptedPacket,
						"publicKey": myPub,
					})
					s.send(targetClient, Frame{T: "FRIEND_ACCEPTED", Data: json.RawMessage(respData)})
				}
				s.mu.Unlock()
			}
			rows.Close()
			
			// Ack to me
			s.send(client, Frame{T: "FRIEND_ACCEPTED_ACK", Data: json.RawMessage(`{"targetEmail":"`+targetEmail+`"}`)})

		case "FRIEND_DENY":
			if client.email == "" { continue }
			var d struct {
				TargetEmail string `json:"targetEmail"`
			}
			json.Unmarshal(frame.Data, &d)
			targetHash := emailHash(normalizeEmail(d.TargetEmail))
			senderHash := emailHash(client.email)
			
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", targetHash, senderHash)
			// Notify target they were denied? User said "if they get a success or deny they get that message too".
			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
					s.send(targetClient, Frame{T: "FRIEND_DENIED", Data: json.RawMessage(respData)})
				}
				s.mu.Unlock()
			}
			rows.Close()

		case "BLOCK_USER":
			if client.email == "" { continue }
			var d struct {
				TargetEmail string `json:"targetEmail"`
			}
			json.Unmarshal(frame.Data, &d)
			targetHash := emailHash(normalizeEmail(d.TargetEmail))
			senderHash := emailHash(client.email)
			
			s.db.Exec("INSERT OR IGNORE INTO blocked (blocker_hash, blocked_hash) VALUES (?, ?)", senderHash, targetHash)
			// Also remove friend requests?
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", targetHash, senderHash)
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", senderHash, targetHash)
			
			s.send(client, Frame{T: "USER_BLOCKED", Data: json.RawMessage(`{"success":true}`)})

		case "GET_PENDING_REQUESTS":
			if client.email == "" { continue }
			myHash := emailHash(client.email)
			rows, err := s.db.Query(`
				SELECT r.sender_hash, r.encrypted_packet, r.timestamp, u.public_key 
				FROM requests r 
				JOIN users u ON r.sender_hash = u.email_hash 
				WHERE r.target_hash = ?`, myHash)
			if err != nil {
				continue
			}
			var pending []map[string]any
			for rows.Next() {
				var senderHash, packet, pubKey string
				var ts time.Time
				rows.Scan(&senderHash, &packet, &ts, &pubKey)
				pending = append(pending, map[string]any{
					"senderHash": senderHash,
					"encryptedPacket": packet,
					"timestamp": ts,
					"publicKey": pubKey,
				})
			}
			rows.Close()
			respBytes, _ := json.Marshal(pending)
			s.send(client, Frame{T: "PENDING_REQUESTS", Data: json.RawMessage(respBytes)})


		case "JOIN_ACCEPT":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			if sess, ok := s.sessions[frame.SID]; ok {
				sess.mu.Lock()
				sess.clients[client.id] = client
				var req struct {
					PublicKey       string `json:"publicKey"`
					SenderEmail     string `json:"senderEmail"`
					SenderEmailHash string `json:"senderEmailHash"`
					SenderName      string `json:"senderName"`
					SenderAvatar    string `json:"senderAvatar"`
					SenderNameVer   int    `json:"senderNameVer"`
					SenderAvatarVer int    `json:"senderAvatarVer"`
				}
				_ = json.Unmarshal(frame.Data, &req)
				joinData, _ := json.Marshal(map[string]any{
					"publicKey":     req.PublicKey,
					"email":         normalizeEmail(client.email),
					"emailHash":     emailHash(client.email),
					"name":          req.SenderName,
					"avatar":        req.SenderAvatar,
					"nameVersion":   req.SenderNameVer,
					"avatarVersion": req.SenderAvatarVer,
				})
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{
							T:    "JOIN_ACCEPT",
							SID:  frame.SID,
							Data: json.RawMessage(joinData),
						})
					}
				}
				sess.mu.Unlock()
			}
			s.mu.Unlock()

		case "JOIN_DENY":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			if sess, ok := s.sessions[frame.SID]; ok {
				sess.mu.Lock()
				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{T: "JOIN_DENIED", SID: frame.SID})
					}
				}
				sess.mu.Unlock()
			}
			s.mu.Unlock()

		case "DELETE_ACCOUNT":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Authentication required"}`)})
				continue
			}
			eh := emailHash(client.email)

			s.db.Exec("DELETE FROM public_keys WHERE email_hash = ?", eh)
			s.db.Exec("DELETE FROM sockets WHERE email_hash = ?", eh)

			rows, err := s.db.Query("SELECT sid FROM friends WHERE user1_hash = ? OR user2_hash = ?", eh, eh)
			if err == nil {
				var sids []string
				for rows.Next() {
					var sid string
					if err := rows.Scan(&sid); err == nil {
						sids = append(sids, sid)
					}
				}
				rows.Close()

				s.mu.Lock()
				for _, sid := range sids {
					sess, ok := s.sessions[sid]
					if ok {
						sess.mu.Lock()
						for _, c := range sess.clients {
							if c.id != client.id {
								s.send(c, Frame{T: "PEER_OFFLINE", SID: sid})
							}
						}
						sess.mu.Unlock()
					}
				}
				s.mu.Unlock()

				s.db.Exec("DELETE FROM friends WHERE user1_hash = ? OR user2_hash = ?", eh, eh)
			}
			
			log.Printf("[Server] Deleted account for %s", client.email)
			client.conn.Close()

		case "REATTACH":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Authentication required"}`)})
				continue
			}
			s.mu.Lock()

			sess, ok := s.sessions[frame.SID]
			if !ok {
				sess = &Session{
					id:      frame.SID,
					clients: map[string]*Client{client.id: client},
				}
				s.sessions[frame.SID] = sess
			}
			s.mu.Unlock()

			sess.mu.Lock()
			sess.clients[client.id] = client

			for _, c := range sess.clients {
				if c.id != client.id {
					s.send(c, Frame{
						T:   "PEER_ONLINE",
						SID: frame.SID,
					})
					s.send(client, Frame{
						T:   "PEER_ONLINE",
						SID: frame.SID,
					})
				}
			}

			sess.mu.Unlock()

			log.Printf(
				"[Server] Client %s reattached to session %s",
				client.id,
				frame.SID,
			)

		case "MSG":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			if len(frame.SID) == 0 || len(frame.SID) > maxSIDLength {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Invalid session id"}`),
				})
				continue
			}
			if !s.allowMessage(client) {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Rate limit exceeded: Too many messages per second"}`),
				})
				continue
			}
			var msgData struct {
				Payload string `json:"payload"`
			}
			if err := json.Unmarshal(frame.Data, &msgData); err != nil {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Invalid message format"}`),
				})
				continue
			}
			if msgData.Payload == "" || len(msgData.Payload) > maxEncryptedDataBytes {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Message payload too large"}`),
				})
				continue
			}

			// Verify if users are actually connected (friends)
			var friendCount int
			senderHash := emailHash(client.email)
			s.db.QueryRow("SELECT COUNT(*) FROM friends WHERE sid = ? AND (user1_hash = ? OR user2_hash = ?)", frame.SID, senderHash, senderHash).Scan(&friendCount)
			if friendCount == 0 {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"You cannot send messages to this user because you are not connected."}`),
				})
				continue
			}

			delivered := false
			s.mu.Lock()

			sess, ok := s.sessions[frame.SID]
			if !ok {
				sess = &Session{
					id:      frame.SID,
					clients: map[string]*Client{client.id: client},
				}
				s.sessions[frame.SID] = sess
				log.Printf("[Server] Auto-created session %s from MSG", frame.SID)
			}
			s.mu.Unlock()

			sess.mu.Lock()
			if _, exists := sess.clients[client.id]; !exists {
				sess.mu.Unlock()
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Not a member of this session"}`),
				})
				continue
			}

			recipientCount := 0
			relayData, _ := json.Marshal(map[string]string{
				"payload": msgData.Payload,
			})
			relayFrame := Frame{
				T:    "MSG",
				SID:  frame.SID,
				SH:   emailHash(client.email),
				Data: json.RawMessage(relayData),
			}
			for _, c := range sess.clients {
				if c.id != client.id {
					recipientCount++
					if err := s.send(c, relayFrame); err == nil {
						delivered = true
					} else {
						log.Printf("[Error] Failed to send to %s: %v", c.id, err)
					}
				}
			}

			log.Printf("[Server] Relayed MSG in %s to %d recipients (Delivered: %v)", frame.SID, recipientCount, delivered)
			sess.mu.Unlock()

			if frame.C {
				if delivered {
					s.send(client, Frame{T: "DELIVERED", SID: frame.SID})
				} else {
					s.send(client, Frame{T: "DELIVERED_FAILED", SID: frame.SID})
				}
			}

		case "RTC_OFFER":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()

			if sess == nil {
				break
			}

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					s.send(c, frame)
				}
			}
			sess.mu.Unlock()

		case "RTC_ANSWER":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()

			if sess == nil {
				break
			}

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					s.send(c, frame)
				}
			}
			sess.mu.Unlock()

		case "RTC_ICE":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}
			s.mu.Lock()
			sess := s.sessions[frame.SID]
			s.mu.Unlock()

			if sess == nil {
				break
			}

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					s.send(c, frame)
				}
			}
			sess.mu.Unlock()

		case "GET_TURN_CREDS":
			if client.email == "" {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Auth required"}`),
				})
				continue
			}

			username, password := GenerateTurnCreds(client.email, os.Getenv("TURN_SECRET"))
			turnHost := os.Getenv("TURN_HOST")

			resp := map[string]any{
				"urls": []string{
					"turn:" + turnHost + ":3478?transport=udp",
					"turn:" + turnHost + ":3478?transport=tcp",
				},
				"username":   username,
				"credential": password,
				"ttl":        600,
			}

			respBytes, _ := json.Marshal(resp)
			s.send(client, Frame{
				T:    "TURN_CREDS",
				Data: json.RawMessage(respBytes),
			})

		}
	}
}

func htmlUnescape(s string) string {
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&#39;", "'")
	return s
}

func (s *Server) initDB() error {
	var err error
	s.db, err = sql.Open("sqlite3", "./server.db")
	if err != nil {
		return err
	}

	// Create tables
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			email_hash TEXT PRIMARY KEY,
			public_key TEXT
		);`,
		`CREATE TABLE IF NOT EXISTS requests (
			sender_hash TEXT,
			target_hash TEXT,
			encrypted_packet TEXT,
			timestamp DATETIME,
			PRIMARY KEY (sender_hash, target_hash)
		);`,
		`CREATE TABLE IF NOT EXISTS friends (
			user1_hash TEXT,
			user2_hash TEXT,
			since DATETIME,
			sid TEXT,
			PRIMARY KEY (user1_hash, user2_hash)
		);`,
		`CREATE TABLE IF NOT EXISTS blocked (
			blocker_hash TEXT,
			blocked_hash TEXT,
			PRIMARY KEY (blocker_hash, blocked_hash)
		);`,
		`CREATE TABLE IF NOT EXISTS sockets (
			email_hash TEXT,
			socket_id TEXT,
			PRIMARY KEY (email_hash, socket_id)
		);`,
	}

	for _, query := range queries {
		if _, err := s.db.Exec(query); err != nil {
			return fmt.Errorf("error creating table: %v (query: %s)", err, query)
		}
	}

	// Clean up phantom sockets on startup
	_, _ = s.db.Exec("DELETE FROM sockets")

	// Migration: Add sid column if not exists
	var sidColCount int
	s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('friends') WHERE name='sid'").Scan(&sidColCount)
	if sidColCount == 0 {
		s.db.Exec("ALTER TABLE friends ADD COLUMN sid TEXT")
	}

	return nil
}

func main() {
	f, err := os.OpenFile("connections.log", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("error opening file: %v", err)
	}
	defer f.Close()

	s := &Server{
		clients:         make(map[string]*Client),
		sessions:        make(map[string]*Session),
		emailToClientId: make(map[string]string),
		logger:          log.New(f, "", 0),
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}

	if err := s.initDB(); err != nil {
		log.Fatalf("❌ Failed to initialize database: %v", err)
	}
	defer s.db.Close()

	http.HandleFunc("/", s.handle)

	log.Println("✅ Secure E2E Relay Server running on :9000")
	http.ListenAndServe(":9000", nil)
}
