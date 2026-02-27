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
)

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

			var isMaster int
			err = s.db.QueryRow("SELECT is_master FROM devices WHERE email_hash = ? AND public_key = ?", eh, d.PublicKey).Scan(&isMaster)
			if err != nil {
				var deviceCount int
				s.db.QueryRow("SELECT COUNT(*) FROM devices WHERE email_hash = ? AND last_active >= datetime('now', '-30 days')", eh).Scan(&deviceCount)
				isMaster = 0
				if deviceCount == 0 {
					isMaster = 1
				}
				if d.PublicKey != "" {
					s.db.Exec(`
						INSERT INTO devices (email_hash, public_key, last_active, is_master) 
						VALUES (?, ?, ?, ?)`,
						eh, d.PublicKey, time.Now(), isMaster)
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
						"publicKey":  pk,
						"lastActive": lastActive.Format(time.RFC3339),
						"isMaster":   isMaster == 1,
						"status":     status,
					})
				}
			}
			rows.Close()

			respBytes, _ := json.Marshal(map[string]any{"devices": devicesList})
			s.send(client, Frame{T: "DEVICE_LIST", Data: json.RawMessage(respBytes)})

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
						"senderHash":      senderHash,
						"encryptedPacket": d.EncryptedPacket,
						"publicKeys":      senderPubKeys,
					})
					s.send(targetClient, Frame{T: "FRIEND_REQUEST", Data: json.RawMessage(reqData)})
				}
				s.mu.Unlock()
			}
			rows.Close()

			s.send(client, Frame{T: "REQUEST_SENT", Data: json.RawMessage(`{"success":true}`)})

		case "FRIEND_ACCEPT":
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
						"senderHash":      senderHash,
						"encryptedPacket": d.EncryptedPacket,
						"publicKeys":      myPubKeys,
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
					"senderHash":      senderHash,
					"encryptedPacket": packet,
					"timestamp":       ts,
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
