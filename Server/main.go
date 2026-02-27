package main

import (
	"crypto/sha256"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

const (
	maxWSFrameBytes       = 1024 * 1024
	maxEncryptedDataBytes = 400 * 1024
	maxSIDLength          = 128
)

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

func main() {
	f, err := os.OpenFile("connections.log", os.O_RDWR|os.O_CREATE|os.O_APPEND, 0666)
	if err != nil {
		log.Fatalf("error opening file: %v", err)
	}
	defer f.Close()

	s := &Server{
		clients:  make(map[string]*Client),
		sessions: make(map[string]*Session),
		logger:   log.New(f, "", 0),
		rateLimiter: &RateLimiter{
			ipAttempts: make(map[string][]time.Time),
		},
	}

	if err := s.initDB(); err != nil {
		log.Fatalf("❌ Failed to initialize database: %v", err)
	}
	go s.startMonthlyCleanupWorker()
	defer s.db.Close()

	http.HandleFunc("/", s.handle)

	log.Println("✅ Secure E2E Relay Server running on :9000")
	http.ListenAndServe(":9000", nil)
}
