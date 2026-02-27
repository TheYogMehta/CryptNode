package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	crand "crypto/rand"
)

var maxMsgsPerSecond = 100

func (s *Server) newID() string {
	b := make([]byte, 8)
	crand.Read(b)
	return fmt.Sprintf("%d_%s", time.Now().UnixMilli(), hex.EncodeToString(b))
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
