package main

import "os"

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
		DatabaseURL: os.Getenv("DATABASE_URL"),
	}
}
