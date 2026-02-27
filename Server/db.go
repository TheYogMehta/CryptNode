package main

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

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


	return nil
}

func (s *Server) startMonthlyCleanupWorker() {
	for {
		now := time.Now()
		year, month, _ := now.Date()
		var nextMonth time.Month
		var nextYear int
		if month == time.December {
			nextMonth = time.January
			nextYear = year + 1
		} else {
			nextMonth = month + 1
			nextYear = year
		}
		next := time.Date(nextYear, nextMonth, 1, 0, 0, 0, 0, now.Location())
		duration := next.Sub(now)
		s.logger.Printf("Monthly cleanup worker sleeping for %v until %v", duration, next)
		time.Sleep(duration)
		s.logger.Println("Running monthly database cleanup...")
		thirtyDaysAgo := time.Now().Add(-30 * 24 * time.Hour)
		s.db.Exec("DELETE FROM devices WHERE last_active < ?", thirtyDaysAgo)
		s.db.Exec("DELETE FROM requests WHERE timestamp < ?", thirtyDaysAgo)
		s.db.Exec("DELETE FROM offline_notifications WHERE timestamp < ?", thirtyDaysAgo)
		s.logger.Println("Monthly database cleanup finished.")
	}
}
