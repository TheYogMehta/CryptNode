package main

import (
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

var sessionSecret []byte

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

func GenerateTurnCreds(userId, secret string) (string, string) {
	expiry := time.Now().Add(10 * time.Minute).Unix()
	username := fmt.Sprintf("%d:%s", expiry, userId)
	mac := hmac.New(sha1.New, []byte(secret))
	mac.Write([]byte(username))
	password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	return username, password
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
