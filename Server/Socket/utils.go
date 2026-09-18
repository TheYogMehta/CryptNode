package main

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

func normalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

func emailHash(email string) string {
	email = normalizeEmail(email)
	sum := sha256.Sum256([]byte(email))
	return hex.EncodeToString(sum[:])
}
