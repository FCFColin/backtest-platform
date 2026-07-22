package main

import (
	"os"
	"strings"
)

// ============================================================
// 配置
// ============================================================

type Config struct {
	Port        string
	DatabaseURL string
}

func defaultConfig() *Config {
	return &Config{
		Port:        "5003",
		DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")),
	}
}
