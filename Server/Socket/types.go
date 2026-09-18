package main

import (
	"database/sql"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
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
	clients     map[string]*Client
	sessions    map[string]*Session
	mu          sync.Mutex
	logger      *log.Logger
	rateLimiter *RateLimiter
	db          *sql.DB
}
