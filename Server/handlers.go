package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
	"database/sql"
	_ "github.com/mattn/go-sqlite3"
)

func fetchFCMTokens(db *sql.DB, emailHash string) []string {
	var tokens []string
	rows, err := db.Query("SELECT token FROM fcm_tokens WHERE email_hash = ?", emailHash)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var t string
			if err := rows.Scan(&t); err == nil {
				tokens = append(tokens, t)
			}
		}
	}
	return tokens
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
				// Calculate sender's remaining active keys to broadcast on offline
				var senderPubKeys []string
				if client.email != "" {
					eh := emailHash(client.email)
					keyRows, err := s.db.Query("SELECT DISTINCT s.public_key FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND s.public_key IS NOT NULL AND s.public_key != ''", eh)
					if err == nil {
						for keyRows.Next() {
							var pk string
							if err := keyRows.Scan(&pk); err == nil {
								senderPubKeys = append(senderPubKeys, pk)
							}
						}
						keyRows.Close()
					}
				}

				offlineData, _ := json.Marshal(map[string]any{
					"peerPubKeys": senderPubKeys,
				})

				for _, c := range sess.clients {
					if c.id != client.id {
						s.send(c, Frame{
							T:    "PEER_OFFLINE",
							SID:  sess.id,
							Data: json.RawMessage(offlineData),
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

			var deviceExists bool
			err = s.db.QueryRow("SELECT 1 FROM devices WHERE email_hash = ? AND public_key = ?", eh, d.PublicKey).Scan(&deviceExists)
			if err != nil {
				if d.PublicKey != "" {
					s.db.Exec(`
						INSERT INTO devices (email_hash, public_key, last_active) 
						VALUES (?, ?, ?)`,
						eh, d.PublicKey, time.Now())
				}
			} else {
				s.db.Exec("UPDATE devices SET last_active = ? WHERE email_hash = ? AND public_key = ?", time.Now(), eh, d.PublicKey)
			}

			s.db.Exec("INSERT INTO sockets (email_hash, socket_id, public_key) VALUES (?, ?, ?)", eh, client.id, d.PublicKey)

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

			go func() {
				rows, err := s.db.Query(`
					SELECT r.sender_hash, r.encrypted_packet, r.timestamp 
					FROM requests r 
					WHERE r.target_hash = ? AND (r.target_public_key = ? OR r.target_public_key IS NULL OR r.target_public_key = '')`, eh, d.PublicKey)
				if err != nil {
					return
				}
				var pending []map[string]any
				for rows.Next() {
					var senderHash, packet string
					var ts time.Time
					rows.Scan(&senderHash, &packet, &ts)

					var pubKeys []string
					keyRows, err := s.db.Query("SELECT DISTINCT public_key FROM sockets WHERE email_hash = ? AND public_key IS NOT NULL AND public_key != ''", senderHash)
					if err == nil {
						for keyRows.Next() {
							var pk string
							if err := keyRows.Scan(&pk); err == nil {
								pubKeys = append(pubKeys, pk)
							}
						}
						keyRows.Close()
					}
					
					var singlePubKey string
					if len(pubKeys) > 0 {
						singlePubKey = pubKeys[0]
					} else {
						s.db.QueryRow("SELECT public_key FROM devices WHERE email_hash = ? AND is_master = 1 LIMIT 1", senderHash).Scan(&singlePubKey)
						if singlePubKey == "" {
							s.db.QueryRow("SELECT public_key FROM devices WHERE email_hash = ? ORDER BY last_active DESC LIMIT 1", senderHash).Scan(&singlePubKey)
						}
					}
					
					if len(pubKeys) == 0 && singlePubKey != "" {
						pubKeys = []string{singlePubKey}
					}

					pending = append(pending, map[string]any{
						"senderHash":      senderHash,
						"encryptedPacket": packet,
						"timestamp":       ts,
						"publicKey":       singlePubKey,
						"publicKeys":      pubKeys,
					})
				}
				rows.Close()
				
				if len(pending) > 0 {
					s.db.Exec("DELETE FROM requests WHERE target_hash = ? AND (target_public_key = ? OR target_public_key IS NULL OR target_public_key = '')", eh, d.PublicKey)
					respBytes, _ := json.Marshal(pending)
					s.send(client, Frame{T: "PENDING_REQUESTS", Data: json.RawMessage(respBytes)})
				}
			}()

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
					s.db.QueryRow("SELECT COUNT(*) FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ?", peerHash).Scan(&onlineCount)
					isOnline = onlineCount > 0

					var peerPubKeys []string
					if isOnline {
						// Only transmit keys that are actively connected right now
						keyRows, err := s.db.Query("SELECT DISTINCT s.public_key FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND s.public_key IS NOT NULL AND s.public_key != ''", peerHash)
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
					ownKeyRows, err := s.db.Query("SELECT DISTINCT s.public_key FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND s.public_key IS NOT NULL AND s.public_key != ''", eh)
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
								keyRows, err := s.db.Query("SELECT DISTINCT s.public_key FROM sockets s JOIN devices d ON s.public_key = d.public_key WHERE s.email_hash = ? AND s.public_key IS NOT NULL AND s.public_key != ''", eh)
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
									T:    "PEER_ONLINE",
									SID:  sid,
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

		case "REGISTER_FCM_TOKEN":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				Token string `json:"token"`
			}
			json.Unmarshal(frame.Data, &d)
			if d.Token != "" {
				eh := emailHash(client.email)
				// Insert or update token 
				_, err := s.db.Exec(`
					INSERT INTO fcm_tokens (email_hash, token, last_updated) 
					VALUES (?, ?, ?) 
					ON CONFLICT(email_hash, token) 
					DO UPDATE SET last_updated = excluded.last_updated`,
					eh, d.Token, time.Now(),
				)
				if err != nil {
					log.Printf("[FCM] Error saving token for %s: %v", eh, err)
				}
			}

		case "GET_DEVICES":
			eh := emailHash(client.email)
			rows, err := s.db.Query(`
				SELECT d.public_key, d.last_active, d.is_master, 
				       CASE WHEN s.socket_id IS NOT NULL THEN 'online' ELSE 'offline' END as status 
				FROM devices d 
				LEFT JOIN sockets s ON d.public_key = s.public_key AND d.email_hash = s.email_hash 
				WHERE d.email_hash = ? GROUP BY d.public_key`, eh)
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
						"publicKey":  pk,
						"lastActive": lastActive.Format(time.RFC3339),
						"status":     status,
					})
				}
			}
			rows.Close()

			respBytes, _ := json.Marshal(map[string]any{"devices": devicesList})
			s.send(client, Frame{T: "DEVICE_LIST", Data: json.RawMessage(respBytes)})

		case "GET_PUBLIC_KEY":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
			}
			json.Unmarshal(frame.Data, &d)

			targetHash := emailHash(normalizeEmail(d.TargetEmail))
			
			var pubKeys []string
			rows, err := s.db.Query("SELECT DISTINCT public_key FROM devices WHERE email_hash = ? AND public_key IS NOT NULL AND public_key != ''", targetHash)
			if err == nil {
				for rows.Next() {
					var pk string
					if err := rows.Scan(&pk); err == nil {
						pubKeys = append(pubKeys, pk)
					}
				}
				rows.Close()
			}

			if len(pubKeys) > 0 {
				respData, _ := json.Marshal(map[string]any{
					"targetEmail": d.TargetEmail,
					"publicKeys":  pubKeys,
				})
				s.send(client, Frame{T: "PUBLIC_KEY", Data: json.RawMessage(respData)})
			} else {
				// No keys found at all
				respData, _ := json.Marshal(map[string]any{
					"targetEmail": d.TargetEmail,
					"publicKeys":  []string{},
				})
				s.send(client, Frame{T: "PUBLIC_KEY", Data: json.RawMessage(respData)})
			}

		case "FRIEND_REQUEST":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
				Payloads    []struct {
					PublicKey       string `json:"publicKey"`
					EncryptedPacket string `json:"encryptedPacket"`
				} `json:"payloads"`
			}
			json.Unmarshal(frame.Data, &d)

			targetEmail := normalizeEmail(d.TargetEmail)
			targetHash := emailHash(targetEmail)
			senderHash := emailHash(client.email)

			for _, payload := range d.Payloads {
				_, err := s.db.Exec(`INSERT OR REPLACE INTO requests (sender_hash, target_hash, target_public_key, encrypted_packet, timestamp) 
					VALUES (?, ?, ?, ?, ?)`, senderHash, targetHash, payload.PublicKey, payload.EncryptedPacket, time.Now())
				if err != nil {
					s.logger.Printf("Error storing request for key %s: %v", payload.PublicKey, err)
				}
			}
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

			var singlePubKey string
			if len(senderPubKeys) > 0 {
				singlePubKey = senderPubKeys[0]
			} else {
				s.db.QueryRow("SELECT public_key FROM devices WHERE email_hash = ? AND is_master = 1 LIMIT 1", senderHash).Scan(&singlePubKey)
				if singlePubKey == "" {
					s.db.QueryRow("SELECT public_key FROM devices WHERE email_hash = ? ORDER BY last_active DESC LIMIT 1", senderHash).Scan(&singlePubKey)
				}
			}

			if len(senderPubKeys) == 0 && singlePubKey != "" {
				senderPubKeys = []string{singlePubKey}
			}

			rows, _ := s.db.Query("SELECT socket_id, public_key FROM sockets WHERE email_hash = ?", targetHash)
			hasSockets := false
			for rows.Next() {
				hasSockets = true
				var socketID, targetSocketPubKey string
				rows.Scan(&socketID, &targetSocketPubKey)

				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					// Find the specific packet for this active device's public key
					var packetForDevice string
					for _, p := range d.Payloads {
						if p.PublicKey == targetSocketPubKey {
							packetForDevice = p.EncryptedPacket
							break
						}
					}

					// If we don't have a packet specifically for this key, we can't send it to this socket.
					// This shouldn't happen unless the device came online right as we sent the request.
					if packetForDevice != "" {
						reqData, _ := json.Marshal(map[string]any{
							"senderHash":      senderHash,
							"encryptedPacket": packetForDevice,
							"publicKeys":      senderPubKeys,
							"publicKey":       singlePubKey, // Legacy fallback
						})
						s.send(targetClient, Frame{T: "FRIEND_REQUEST", Data: json.RawMessage(reqData)})
					}
				}
				s.mu.Unlock()
			}
			rows.Close()

			if !hasSockets {
				// Send Push Notification since target is completely offline
				tokens := fetchFCMTokens(s.db, targetHash)
				go sendPushNotification(tokens, targetHash, 1)
			}

			s.send(client, Frame{T: "REQUEST_SENT", Data: json.RawMessage(`{"success":true}`)})

		case "FRIEND_ACCEPT":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
				Payloads    []struct {
					PublicKey       string `json:"publicKey"`
					EncryptedPacket string `json:"encryptedPacket"`
				} `json:"payloads"`
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
			s.db.Exec("DELETE FROM requests WHERE sender_hash = ? AND target_hash = ?", senderHash, targetHash)

			var myPubKeys []string
			keyRows, _ := s.db.Query("SELECT DISTINCT public_key FROM devices WHERE email_hash = ? AND public_key IS NOT NULL AND public_key != ''", senderHash)
			for keyRows.Next() {
				var pk string
				if err := keyRows.Scan(&pk); err == nil {
					myPubKeys = append(myPubKeys, pk)
				}
			}
			keyRows.Close()

			rows, _ := s.db.Query("SELECT socket_id, public_key FROM sockets WHERE email_hash = ?", targetHash)
			for rows.Next() {
				var socketID, targetSocketPubKey string
				rows.Scan(&socketID, &targetSocketPubKey)
				s.mu.Lock()
				if targetClient, ok := s.clients[socketID]; ok {
					var packetForDevice string
					for _, p := range d.Payloads {
						if p.PublicKey == targetSocketPubKey {
							packetForDevice = p.EncryptedPacket
							break
						}
					}
					
					if packetForDevice != "" {
						respData, _ := json.Marshal(map[string]any{
							"senderHash":      senderHash,
							"encryptedPacket": packetForDevice,
							"publicKeys":      myPubKeys,
						})
						s.send(targetClient, Frame{T: "FRIEND_ACCEPTED", Data: json.RawMessage(respData)})
					}
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
				TargetHash  string `json:"targetHash"`
			}
			json.Unmarshal(frame.Data, &d)

			var targetHash string
			if d.TargetEmail != "" {
				targetHash = emailHash(normalizeEmail(d.TargetEmail))
			} else {
				targetHash = d.TargetHash
			}

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

			// Broadcast SYNC_DENY to own devices
			s.broadcastToOwnDevices(client.id, senderHash, "SYNC_DENY", map[string]string{"targetHash": targetHash})

		case "BLOCK_USER":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetEmail string `json:"targetEmail"`
				TargetHash  string `json:"targetHash"`
			}
			json.Unmarshal(frame.Data, &d)

			var targetHash string
			if d.TargetEmail != "" {
				targetHash = emailHash(normalizeEmail(d.TargetEmail))
			} else {
				targetHash = d.TargetHash
			}

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

			// Broadcast SYNC_BLOCK to own devices
			s.broadcastToOwnDevices(client.id, senderHash, "SYNC_BLOCK", map[string]string{"targetHash": targetHash})

			s.send(client, Frame{T: "USER_BLOCKED", Data: json.RawMessage(`{"success":true, "targetEmail":"`+d.TargetEmail+`"}`)})

		case "UNFRIEND":
			if client.email == "" {
				s.send(client, Frame{T: "ERROR", Data: json.RawMessage(`{"message":"Auth required"}`)})
				continue
			}
			var d struct {
				TargetHash string `json:"targetHash"`
			}
			json.Unmarshal(frame.Data, &d)

			if d.TargetHash == "" {
				continue
			}

			senderHash := emailHash(client.email)

			// Get the sid before deleting
			var sid string
			s.db.QueryRow("SELECT sid FROM friends WHERE (user1_hash = ? AND user2_hash = ?) OR (user1_hash = ? AND user2_hash = ?)", senderHash, d.TargetHash, d.TargetHash, senderHash).Scan(&sid)

			// Delete from friends table
			s.db.Exec("DELETE FROM friends WHERE (user1_hash = ? AND user2_hash = ?) OR (user1_hash = ? AND user2_hash = ?)", senderHash, d.TargetHash, d.TargetHash, senderHash)

			// Notify target they were unfriended (removes connection logic on their end)
			rows, err := s.db.Query("SELECT socket_id FROM sockets WHERE email_hash = ?", d.TargetHash)
			hasSockets := false
			if err == nil {
				for rows.Next() {
					hasSockets = true
					var socketID string
					rows.Scan(&socketID)
					s.mu.Lock()
					if targetClient, ok := s.clients[socketID]; ok {
						respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
						s.send(targetClient, Frame{T: "UNFRIENDED", Data: json.RawMessage(respData)})
					}
					s.mu.Unlock()
				}
				rows.Close()
			}

			if !hasSockets {
				respData, _ := json.Marshal(map[string]string{"senderHash": senderHash})
				frameEvent, _ := json.Marshal(Frame{T: "UNFRIENDED", Data: json.RawMessage(respData)})
				s.db.Exec("INSERT INTO offline_notifications (email_hash, event_data, timestamp) VALUES (?, ?, ?)", d.TargetHash, string(frameEvent), time.Now())
			}

			// Broadcast SYNC_UNFRIEND to own devices
			if sid != "" {
				s.broadcastToOwnDevices(client.id, senderHash, "SYNC_UNFRIEND", map[string]string{"targetHash": d.TargetHash, "sid": sid})
			}

			s.send(client, Frame{T: "UNFRIEND_SUCCESS", Data: json.RawMessage(`{"success":true, "targetHash":"`+d.TargetHash+`"}`)})

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
						offlineData, _ := json.Marshal(map[string]any{
							"peerPubKeys": []string{},
						})
						for _, c := range sess.clients {
							if c.id != client.id {
								s.send(c, Frame{
									T:    "PEER_OFFLINE",
									SID:  sid,
									Data: json.RawMessage(offlineData),
								})
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
				sess.clients[client.id] = client
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

			if !delivered {
				// Fetch target hashes associated with this session (excluding sender)
				rows, err := s.db.Query("SELECT user1_hash, user2_hash FROM friends WHERE sid = ?", frame.SID)
				if err == nil {
					for rows.Next() {
						var u1, u2 string
						rows.Scan(&u1, &u2)
						targetHash := u1
						if u1 == senderHash {
							targetHash = u2
						}
						
						// Get unread messages count approx (including this one which isn't saved as offline_notifications anymore usually, but they get the MSG frame)
						var unreadCount int
						s.db.QueryRow("SELECT COUNT(*) FROM offline_notifications WHERE email_hash = ?", targetHash).Scan(&unreadCount)
						
						// Fetch tokens & push
						tokens := fetchFCMTokens(s.db, targetHash)
						go sendPushNotification(tokens, targetHash, unreadCount+1)
					}
					rows.Close()
				}
			}

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
