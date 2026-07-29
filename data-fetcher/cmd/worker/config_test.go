// Package main — config_test.go
// D5-004: cmd/worker defaultWorkerConfig 覆盖率提升测试
package main

import (
	"os"
	"testing"
)

func TestDefaultWorkerConfig_NoEnv(t *testing.T) {
	os.Unsetenv("DATABASE_URL")
	cfg := defaultWorkerConfig()
	if cfg == nil {
		t.Fatal("defaultWorkerConfig returned nil")
	}
	if cfg.DatabaseURL != "" {
		t.Errorf("DatabaseURL = %q, want empty", cfg.DatabaseURL)
	}
}

func TestDefaultWorkerConfig_WithEnv(t *testing.T) {
	os.Setenv("DATABASE_URL", "  postgres://localhost/worker  ")
	defer os.Unsetenv("DATABASE_URL")
	cfg := defaultWorkerConfig()
	if cfg.DatabaseURL != "postgres://localhost/worker" {
		t.Errorf("DatabaseURL = %q, want trimmed URL", cfg.DatabaseURL)
	}
}

func TestWorkerConfig_Fields(t *testing.T) {
	c := &WorkerConfig{DatabaseURL: "postgres://test"}
	if c.DatabaseURL != "postgres://test" {
		t.Errorf("DatabaseURL = %q, want postgres://test", c.DatabaseURL)
	}
}