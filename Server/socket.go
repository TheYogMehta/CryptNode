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
	T            string          `json:"t"`
	SID          string          `json:"sid,omitempty"`
	C            bool            `json:"c,omitempty"`
	P            int             `json:"p,omitempty"`
	SH           string          `json:"sh,omitempty"`
	TargetPubKey string          `json:"targetPubKey,omitempty"`
	Data         json.RawMessage `json:"data,omitempty"`
}

type Client struct {
	id          string
	email       string
	conn        *websocket.Conn
	mu          sync.Mutex
	msgCount    int
	msgWindow   time.Time
	lastConnect time.Time
	approved    bool
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
	email = normalizeEmail(email)
	sum := sha256.Sum256([]byte(email))
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

func (s *Server) broadcastDeviceList(emailHash string) {
	rows, err := s.db.Query("SELECT public_key, last_active, is_master, status FROM devices WHERE email_hash = ?", emailHash)
	if err != nil {
		s.logger.Printf("Failed to get devices for broadcast: %v", err)
		return
	}
	var devicesList []map[string]any
	for rows.Next() {
		var pk, status string
		var lastActive time.Time
		var isMaster int
		if err := rows.Scan(&pk, &lastActive, &isMaster, &status); err == nil {
			devicesList = append(devicesList, map[string]any{
				"publicKey": pk,
				"lastActive": lastActive.Format(time.RFC3339),
				"isMaster": isMaster == 1,
				"status": status,
			})
		}
	}
	rows.Close()

	if len(devicesList) == 0 {
		return
	}

	respBytes, _ := json.Marshal(map[string]any{"devices": devicesList})
	frame := Frame{T: "DEVICE_LIST", Data: json.RawMessage(respBytes)}

	sockRows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", emailHash)
	for sockRows.Next() {
		var socketID string
		sockRows.Scan(&socketID)
		s.mu.Lock()
		if targetClient, ok := s.clients[socketID]; ok {
			s.send(targetClient, frame)
		}
		s.mu.Unlock()
	}
	sockRows.Close()
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
		s.mu.Unlock()

		if client.email != "" {
			s.db.Exec("DELETE FROM sockets WHERE socket_id = ?", client.id)
		}

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

			var deviceCount int
			s.db.QueryRow("SELECT COUNT(*) FROM devices WHERE email_hash = ?", eh).Scan(&deviceCount)

			var deviceStatus string
			var isMaster int

			if deviceCount == 0 {
				deviceStatus = "approved"
				isMaster = 1
				if d.PublicKey != "" {
					s.db.Exec(`
						INSERT INTO devices (email_hash, public_key, last_active, is_master, status) 
						VALUES (?, ?, ?, ?, ?)`,
						eh, d.PublicKey, time.Now(), isMaster, deviceStatus)
				}
			} else {
				err := s.db.QueryRow("SELECT status, is_master FROM devices WHERE email_hash = ? AND public_key = ?", eh, d.PublicKey).Scan(&deviceStatus, &isMaster)
				if err != nil {
					deviceStatus = "pending"
					isMaster = 0
					if d.PublicKey != "" {
						s.db.Exec(`
							INSERT INTO devices (email_hash, public_key, last_active, is_master, status) 
							VALUES (?, ?, ?, ?, ?)`,
							eh, d.PublicKey, time.Now(), isMaster, deviceStatus)
					}
				} else {
					s.db.Exec("UPDATE devices SET last_active = ? WHERE email_hash = ? AND public_key = ?", time.Now(), eh, d.PublicKey)
				}
			}

			s.db.Exec("INSERT INTO sockets (email_hash, socket_id, public_key) VALUES (?, ?, ?)", eh, client.id, d.PublicKey)

			if deviceStatus == "approved" {
				client.mu.Lock()
				client.approved = true
				client.mu.Unlock()

				resp := map[string]string{
					"email": email,
					"token": sessionToken,
				}
				respBytes, _ := json.Marshal(resp)
				s.send(client, Frame{T: "AUTH_SUCCESS", Data: json.RawMessage(respBytes)})

			go func() {
				rows, err := s.db.Query("SELECT id, event_data FROM offline_notifications WHERE email_hash = ?", eh)
				if err == nil {
					var idsToDelete []int
					for rows.Next() {
						var id int
						var data string
						if err := rows.Scan(&id, &data); err == nil {
							var notif Frame
							if json.Unmarshal([]byte(data), &notif) == nil {
								s.send(client, notif)
								idsToDelete = append(idsToDelete, id)
							}
						}
					}
					rows.Close()

					for _, id := range idsToDelete {
						s.db.Exec("DELETE FROM offline_notifications WHERE id = ?", id)
					}
				}
			}()
			
			} else {
				var masterPubKey string
				s.db.QueryRow("SELECT public_key FROM devices WHERE email_hash = ? AND is_master = 1 LIMIT 1", eh).Scan(&masterPubKey)

				resp := map[string]string{
					"masterPubKey": masterPubKey,
					"email":        email,
					"token":        sessionToken,
				}
				respBytes, _ := json.Marshal(resp)
				s.send(client, Frame{T: "AUTH_PENDING", Data: json.RawMessage(respBytes)})
				continue
			}

			go func() {
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

					peerHash := u1
					if peerHash == eh {
						peerHash = u2
					}

					isOnline := false
					var onlineCount int
					s.db.QueryRow("SELECT COUNT(*) FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND d.status = 'approved'", peerHash).Scan(&onlineCount)
					isOnline = onlineCount > 0

					var peerPubKeys []string
					if isOnline {
						// Only transmit keys that are actively connected right now
						keyRows, err := s.db.Query("SELECT DISTINCT s.public_key FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND s.public_key IS NOT NULL AND s.public_key != '' AND d.status = 'approved'", peerHash)
						if err == nil {
							for keyRows.Next() {
								var pk string
								if err := keyRows.Scan(&pk); err == nil {
									peerPubKeys = append(peerPubKeys, pk)
								}
							}
							keyRows.Close()
						}
					}

					var ownPubKeys []string
					ownKeyRows, err := s.db.Query("SELECT DISTINCT s.public_key FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND s.public_key IS NOT NULL AND s.public_key != '' AND d.status = 'approved'", eh)
					if err == nil {
						for ownKeyRows.Next() {
							var pk string
							if err := ownKeyRows.Scan(&pk); err == nil {
								ownPubKeys = append(ownPubKeys, pk)
							}
						}
						ownKeyRows.Close()
					}

					sessions = append(sessions, map[string]any{
						"sid":         sid,
						"online":      isOnline,
						"peerHash":    peerHash,
						"peerPubKeys": peerPubKeys,
						"ownPubKeys":  ownPubKeys,
					})
					
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
						for _, c := range sess.clients {
							if c.id != client.id {
								
								// Calculate sender's current active keys to broadcast to friends
								var senderPubKeys []string
								keyRows, err := s.db.Query("SELECT DISTINCT s.public_key FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND s.public_key IS NOT NULL AND s.public_key != '' AND d.status = 'approved'", eh)
								if err == nil {
									for keyRows.Next() {
										var pk string
										if err := keyRows.Scan(&pk); err == nil {
											senderPubKeys = append(senderPubKeys, pk)
										}
									}
									keyRows.Close()
								}
								
								onlineData, _ := json.Marshal(map[string]any{
									"peerPubKeys": senderPubKeys,
								})

								s.send(c, Frame{
									T:   "PEER_ONLINE",
									SID: sid,
									Data: json.RawMessage(onlineData),
								})
							}
						}
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
	
		case "UPDATE_PUBKEY":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				PublicKey string `json:"publicKey"`
			}
			json.Unmarshal(frame.Data, &d)
			if d.PublicKey != "" {
				s.db.Exec("UPDATE users SET public_key = ? WHERE email_hash = ?", d.PublicKey, emailHash(client.email))
			}


		case "DEVICE_LINK_REQUEST":
			var d struct {
				EncryptedSpecs string `json:"encryptedSpecs"`
				TargetPubKey   string `json:"targetPubKey"`
			}
			json.Unmarshal(frame.Data, &d)

			eh := emailHash(client.email)
			var senderPubKey string
			s.db.QueryRow("SELECT public_key FROM sockets WHERE socket_id = ?", client.id).Scan(&senderPubKey)
			
			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ? AND public_key = ?", eh, d.TargetPubKey)
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					reqData, _ := json.Marshal(map[string]any{
						"encryptedSpecs": d.EncryptedSpecs,
						"senderPubKey": senderPubKey,
					})
					s.send(targetClient, Frame{T: "DEVICE_LINK_REQUEST", Data: json.RawMessage(reqData)})
				}
				s.mu.Unlock()
			}
			rows.Close()

		case "DEVICE_LINK_ACCEPT":
			var d struct {
				TargetPubKey string `json:"targetPubKey"`
			}
			json.Unmarshal(frame.Data, &d)
			eh := emailHash(client.email)
			
			var status string
			s.db.QueryRow("SELECT d.status FROM devices d JOIN sockets s ON d.public_key = s.public_key WHERE s.socket_id = ?", client.id).Scan(&status)
			if status != "approved" {
				continue
			}

			s.db.Exec("UPDATE devices SET status = 'approved' WHERE email_hash = ? AND public_key = ?", eh, d.TargetPubKey)

			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ? AND public_key = ?", eh, d.TargetPubKey)
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					s.send(targetClient, Frame{T: "DEVICE_LINK_ACCEPTED"})
				}
				s.mu.Unlock()
			}
			rows.Close()

			// Broadcast DEVICE_LIST to all approved devices so their settings UI synced
			s.broadcastDeviceList(eh)

		case "DEVICE_LINK_REJECT":
			var d struct {
				TargetPubKey string `json:"targetPubKey"`
			}
			json.Unmarshal(frame.Data, &d)
			eh := emailHash(client.email)
			
			var status string
			s.db.QueryRow("SELECT d.status FROM devices d JOIN sockets s ON d.public_key = s.public_key WHERE s.socket_id = ?", client.id).Scan(&status)
			if status != "approved" {
				continue
			}

			s.db.Exec("DELETE FROM devices WHERE email_hash = ? AND public_key = ?", eh, d.TargetPubKey)
			
			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ? AND public_key = ?", eh, d.TargetPubKey)
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					s.send(targetClient, Frame{T: "DEVICE_LINK_REJECTED"})
					targetClient.conn.Close()
				}
				s.mu.Unlock()
			}
			rows.Close()
			
			s.broadcastDeviceList(eh)

		case "GET_DEVICES":
			eh := emailHash(client.email)
			rows, err := s.db.Query("SELECT public_key, last_active, is_master, status FROM devices WHERE email_hash = ?", eh)
			if err != nil {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Failed to get devices"}`)})
				continue
			}
			
			var devicesList []map[string]any
			for rows.Next() {
				var pk, status string
				var lastActive time.Time
				var isMaster int
				if err := rows.Scan(&pk, &lastActive, &isMaster, &status); err == nil {
					devicesList = append(devicesList, map[string]any{
						"publicKey": pk,
						"lastActive": lastActive.Format(time.RFC3339),
						"isMaster": isMaster == 1,
						"status": status,
					})
				}
			}
			rows.Close()
			
			respBytes, _ := json.Marshal(map[string]any{"devices": devicesList})
			s.send(client, Frame{T: "DEVICE_LIST", Data: json.RawMessage(respBytes)})

		case "FRIEND_REQUEST":
			client.mu.Lock()
			isApproved := client.approved
			client.mu.Unlock()

			if !isApproved {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Device pending approval. Please sync your device in Settings."}`)})
				continue
			}

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

			_, err := s.db.Exec(`INSERT OR REPLACE INTO requests (sender_hash, target_hash, encrypted_packet, timestamp) 
				VALUES (?, ?, ?, ?)`, senderHash, targetHash, d.EncryptedPacket, time.Now())
			if err != nil {
				s.logger.Printf("Error storing request: %v", err)
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Failed to store request"}`)})
				continue
			}

			// We don't send individual public keys via `FRIEND_REQUEST` anymore
			// Instead we can send the sender's current active keys:
			var senderPubKeys []string
			keyRows, err := s.db.Query("SELECT DISTINCT public_key FROM sockets WHERE email_hash = ? AND public_key IS NOT NULL AND public_key != ''", senderHash)
			if err == nil {
				for keyRows.Next() {
					var pk string
					if err := keyRows.Scan(&pk); err == nil {
						senderPubKeys = append(senderPubKeys, pk)
					}
				}
				keyRows.Close()
			}

			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					reqData, _ := json.Marshal(map[string]any{
						"senderHash": senderHash,
						"encryptedPacket": d.EncryptedPacket,
						"publicKeys": senderPubKeys,
					})
					s.send(targetClient, Frame{T: "FRIEND_REQUEST", Data: json.RawMessage(reqData)})
				}
				s.mu.Unlock()
			}
			rows.Close()
			
			s.send(client, Frame{T: "REQUEST_SENT", Data: json.RawMessage(`{"success":true}`)})

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

			u1, u2 := senderHash, targetHash
			if u1 > u2 {
				u1, u2 = u2, u1
			}
			
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

			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", targetHash, senderHash)

			var myPubKeys []string
			keyRows, _ := s.db.Query("SELECT DISTINCT public_key FROM sockets WHERE email_hash = ? AND public_key IS NOT NULL AND public_key != ''", senderHash)
			for keyRows.Next() {
				var pk string
				if err := keyRows.Scan(&pk); err == nil {
					myPubKeys = append(myPubKeys, pk)
				}
			}
			keyRows.Close()

			rows, _ := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			for rows.Next() {
				var socketID string
				rows.Scan(&socketID)
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					respData, _ := json.Marshal(map[string]any{
						"senderHash": senderHash,
						"encryptedPacket": d.EncryptedPacket,
						"publicKeys": myPubKeys,
					})
					s.send(targetClient, Frame{T: "FRIEND_ACCEPTED", Data: json.RawMessage(respData)})
				}
				s.mu.Unlock()
			}
			rows.Close()
			
			s.send(client, Frame{T: "FRIEND_ACCEPTED_ACK", Data: json.RawMessage(`{"targetEmail":"`+targetEmail+`"}`)})

		case "FRIEND_DENY":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
			}
			json.Unmarshal(frame.Data, &d)
			targetHash := emailHash(normalizeEmail(d.TargetEmail))
			senderHash := emailHash(client.email)
			
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", targetHash, senderHash)
			// Notify target they were denied.
			rows, err := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			hasSockets := false
			if err == nil {
				for rows.Next() {
					hasSockets = true
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
			}

			if !hasSockets {
				respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
				frame, _ := json.Marshal(Frame{T: "FRIEND_DENIED", Data: json.RawMessage(respData)})
				s.db.Exec("INSERT INTO offline_notifications (email_hash, event_data, timestamp) VALUES (?, ?, ?)", targetHash, string(frame), time.Now())
			}

		case "BLOCK_USER":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
			}
			json.Unmarshal(frame.Data, &d)
			targetHash := emailHash(normalizeEmail(d.TargetEmail))
			senderHash := emailHash(client.email)
			
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", targetHash, senderHash)
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", senderHash, targetHash)
			
			s.db.Exec("DELETE FROM friends WHERE (user1_hash = ? AND user2_hash = ?) OR (user1_hash = ? AND user2_hash = ?)", senderHash, targetHash, targetHash, senderHash)

			rows, err := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			hasSockets := false
			if err == nil {
				for rows.Next() {
					hasSockets = true
					var socketID string
					rows.Scan(&socketID)
					s.mu.Lock()
					if targetClient, ok := s.clients[socketID]; ok {
						respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
						s.send(targetClient, Frame{T: "USER_BLOCKED_EVENT", Data: json.RawMessage(respData)})
					}
					s.mu.Unlock()
				}
				rows.Close()
			}

			if !hasSockets {
				respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
				frameEvent, _ := json.Marshal(Frame{T: "USER_BLOCKED_EVENT", Data: json.RawMessage(respData)})
				s.db.Exec("INSERT INTO offline_notifications (email_hash, event_data, timestamp) VALUES (?, ?, ?)", targetHash, string(frameEvent), time.Now())
			}

			s.send(client, Frame{T: "USER_BLOCKED", Data: json.RawMessage(`{"success":true, "targetEmail":"`+d.TargetEmail+`"}`)})
			
		case "UNBLOCK_USER":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
			}
			json.Unmarshal(frame.Data, &d)
			targetHash := emailHash(normalizeEmail(d.TargetEmail))
			senderHash := emailHash(client.email)
			
			rows, err := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", targetHash)
			hasSockets := false
			if err == nil {
				for rows.Next() {
					hasSockets = true
					var socketID string
					rows.Scan(&socketID)
					s.mu.Lock()
					if targetClient, ok := s.clients[socketID]; ok {
						respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
						s.send(targetClient, Frame{T: "USER_UNBLOCKED_EVENT", Data: json.RawMessage(respData)})
					}
					s.mu.Unlock()
				}
				rows.Close()
			}

			if !hasSockets {
				respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
				frameEvent, _ := json.Marshal(Frame{T: "USER_UNBLOCKED_EVENT", Data: json.RawMessage(respData)})
				s.db.Exec("INSERT INTO offline_notifications (email_hash, event_data, timestamp) VALUES (?, ?, ?)", targetHash, string(frameEvent), time.Now())
			}

			s.send(client, Frame{T: "USER_UNBLOCKED", Data: json.RawMessage(`{"success":true, "targetEmail":"`+d.TargetEmail+`"}`)})

		case "GET_PENDING_REQUESTS":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			myHash := emailHash(client.email)
			rows, err := s.db.Query(`
				SELECT r.sender_hash, r.encrypted_packet, r.timestamp 
				FROM requests r 
				WHERE r.target_hash = ?`, myHash)
			if err != nil {
				continue
			}
			var pending []map[string]any
			for rows.Next() {
				var senderHash, packet string
				var ts time.Time
				rows.Scan(&senderHash, &packet, &ts)
				pending = append(pending, map[string]any{
					"senderHash": senderHash,
					"encryptedPacket": packet,
					"timestamp": ts,
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
			client.mu.Lock()
			isApproved := client.approved
			client.mu.Unlock()

			if !isApproved {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Device pending approval. Please sync your device in Settings."}`)})
				continue
			}

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
				Payloads map[string]string `json:"payloads"`
			}
			if err := json.Unmarshal(frame.Data, &msgData); err != nil {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Invalid message format"}`),
				})
				continue
			}
			if len(msgData.Payloads) == 0 {
				s.send(client, Frame{
					T:    "ERROR",
					Data: json.RawMessage(`{"message":"Message payloads missing"}`),
				})
				continue
			}

			totalSize := 0
			for _, p := range msgData.Payloads {
				totalSize += len(p)
			}
			if totalSize > maxEncryptedDataBytes {
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
			relayData, _ := json.Marshal(map[string]any{
				"payloads": msgData.Payloads,
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

			var targetSocketIDs []string
			if frame.TargetPubKey != "" {
				rows, err := s.db.Query("SELECT socket_id FROM sockets WHERE public_key = ?", frame.TargetPubKey)
				if err == nil {
					for rows.Next() {
						var sid string
						if err := rows.Scan(&sid); err == nil {
							targetSocketIDs = append(targetSocketIDs, sid)
						}
					}
					rows.Close()
				}
			}

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					isTarget := false
					for _, tsid := range targetSocketIDs {
						if c.id == tsid {
							isTarget = true
							break
						}
					}
					if isTarget {
						s.send(c, frame)
					}
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

			var targetSocketIDs []string
			if frame.TargetPubKey != "" {
				rows, err := s.db.Query("SELECT socket_id FROM sockets WHERE public_key = ?", frame.TargetPubKey)
				if err == nil {
					for rows.Next() {
						var sid string
						if err := rows.Scan(&sid); err == nil {
							targetSocketIDs = append(targetSocketIDs, sid)
						}
					}
					rows.Close()
				}
			}

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					isTarget := false
					for _, tsid := range targetSocketIDs {
						if c.id == tsid {
							isTarget = true
							break
						}
					}
					if isTarget {
						s.send(c, frame)
					}
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

			var targetSocketIDs []string
			if frame.TargetPubKey != "" {
				rows, err := s.db.Query("SELECT socket_id FROM sockets WHERE public_key = ?", frame.TargetPubKey)
				if err == nil {
					for rows.Next() {
						var sid string
						if err := rows.Scan(&sid); err == nil {
							targetSocketIDs = append(targetSocketIDs, sid)
						}
					}
					rows.Close()
				}
			}

			sess.mu.Lock()
			for _, c := range sess.clients {
				if c.id != client.id {
					isTarget := false
					for _, tsid := range targetSocketIDs {
						if c.id == tsid {
							isTarget = true
							break
						}
					}
					if isTarget {
						s.send(c, frame)
					}
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
		`CREATE TABLE IF NOT EXISTS devices (
			email_hash TEXT,
			public_key TEXT,
			last_active DATETIME,
			is_master BOOLEAN DEFAULT 0,
			status TEXT DEFAULT 'pending',
			PRIMARY KEY (email_hash, public_key)
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
		`CREATE TABLE IF NOT EXISTS sockets (
			email_hash TEXT,
			socket_id TEXT,
			public_key TEXT,
			PRIMARY KEY (email_hash, socket_id)
		);`,
		`CREATE TABLE IF NOT EXISTS offline_notifications (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			email_hash TEXT,
			event_data TEXT,
			timestamp DATETIME
		);`,
	}

	for _, query := range queries {
		if _, err := s.db.Exec(query); err != nil {
			return fmt.Errorf("error creating table: %v (query: %s)", err, query)
		}
	}

	thirtyDaysAgo := time.Now().Add(-30 * 24 * time.Hour)
	s.db.Exec("DELETE FROM devices WHERE last_active < ?", thirtyDaysAgo)
	s.db.Exec("DELETE FROM requests WHERE timestamp < ?", thirtyDaysAgo)
	s.db.Exec("DELETE FROM offline_notifications WHERE timestamp < ?", thirtyDaysAgo)

	_, _ = s.db.Exec("DELETE FROM sockets")
	var sidColCount int
	s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('friends') WHERE name='sid'").Scan(&sidColCount)
	if sidColCount == 0 {
		s.db.Exec("ALTER TABLE friends ADD COLUMN sid TEXT")
	}

	var pubKeyColCount int
	s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('sockets') WHERE name='public_key'").Scan(&pubKeyColCount)
	if pubKeyColCount == 0 {
		s.db.Exec("ALTER TABLE sockets ADD COLUMN public_key TEXT")
	}

	var isMasterColCount int
	s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('devices') WHERE name='is_master'").Scan(&isMasterColCount)
	if isMasterColCount == 0 {
		s.db.Exec("ALTER TABLE devices ADD COLUMN is_master BOOLEAN DEFAULT 0")
	}

	var statusColCount int
	s.db.QueryRow("SELECT COUNT(*) FROM pragma_table_info('devices') WHERE name='status'").Scan(&statusColCount)
	if statusColCount == 0 {
		s.db.Exec("ALTER TABLE devices ADD COLUMN status TEXT DEFAULT 'pending'")
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
		clients:     make(map[string]*Client),
		sessions:    make(map[string]*Session),
		logger:      log.New(f, "", 0),
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
