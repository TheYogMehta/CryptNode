package main

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

type FCMPushLimiter struct {
	mu     sync.Mutex
	counts map[string]int
}

var (
	fcmClient     *messaging.Client
	pushLimiter   *FCMPushLimiter
	maxPushesPerMin = 5
)

func InitFCM() {
	pushLimiter = &FCMPushLimiter{
		counts: make(map[string]int),
	}

	// Reset limits every minute
	go func() {
		for {
			time.Sleep(1 * time.Minute)
			pushLimiter.mu.Lock()
			pushLimiter.counts = make(map[string]int)
			pushLimiter.mu.Unlock()
		}
	}()

	creds := os.Getenv("GOOGLE_APPLICATION_CREDENTIALS")
	if creds == "" {
		log.Println("[FCM] GOOGLE_APPLICATION_CREDENTIALS not set. Push notifications disabled.")
		return
	}

	opt := option.WithCredentialsFile(creds)
	app, err := firebase.NewApp(context.Background(), nil, opt)
	if err != nil {
		log.Printf("[FCM] Error initializing app: %v\n", err)
		return
	}

	client, err := app.Messaging(context.Background())
	if err != nil {
		log.Printf("[FCM] Error getting Messaging client: %v\n", err)
		return
	}

	fcmClient = client
	log.Println("[FCM] Firebase Cloud Messaging initialized successfully")
}

func allowPush(emailHash string) bool {
	pushLimiter.mu.Lock()
	defer pushLimiter.mu.Unlock()

	if pushLimiter.counts[emailHash] >= maxPushesPerMin {
		return false
	}
	pushLimiter.counts[emailHash]++
	return true
}

func sendPushNotification(fcmTokens []string, emailHash string, title string, body string) {
	if fcmClient == nil || len(fcmTokens) == 0 {
		return
	}

	if !allowPush(emailHash) {
		log.Printf("[FCM] Rate limit exceeded for user %s, dropping push notification.", emailHash)
		return
	}

	message := &messaging.MulticastMessage{
		Notification: &messaging.Notification{
			Title: title,
			Body:  body,
		},
		Tokens: fcmTokens,
	}

	response, err := fcmClient.SendMulticast(context.Background(), message)
	if err != nil {
		log.Printf("[FCM] Error sending message: %v\n", err)
		return
	}

	if response.FailureCount > 0 {
		log.Printf("[FCM] Sent to %d tokens, %d failed\n", response.SuccessCount, response.FailureCount)
	} else {
		log.Printf("[FCM] Successfully sent push notification to %d devices for %s\n", response.SuccessCount, emailHash)
	}
}
