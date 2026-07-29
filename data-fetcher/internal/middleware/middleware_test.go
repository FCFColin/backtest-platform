// Package middleware — middleware_test.go
// D5-004: data-fetcher 覆盖率提升测试
package middleware

import (
	"os"
	"strings"
	"testing"
	"time"
)

func TestBuildCorsConfig_Default(t *testing.T) {
	os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	if len(cfg.AllowOrigins) != 1 {
		t.Fatalf("expected 1 default origin, got %d", len(cfg.AllowOrigins))
	}
	if cfg.AllowOrigins[0] != "http://localhost:5173" {
		t.Errorf("default origin = %s, want http://localhost:5173", cfg.AllowOrigins[0])
	}
}

func TestBuildCorsConfig_SingleOrigin(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "https://example.com")
	defer os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	if len(cfg.AllowOrigins) != 1 {
		t.Fatalf("expected 1 origin, got %d", len(cfg.AllowOrigins))
	}
	if cfg.AllowOrigins[0] != "https://example.com" {
		t.Errorf("origin = %s, want https://example.com", cfg.AllowOrigins[0])
	}
}

func TestBuildCorsConfig_MultipleOrigins(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "https://a.com, https://b.com,https://c.com")
	defer os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	if len(cfg.AllowOrigins) != 3 {
		t.Fatalf("expected 3 origins, got %d: %v", len(cfg.AllowOrigins), cfg.AllowOrigins)
	}
	want := []string{"https://a.com", "https://b.com", "https://c.com"}
	for i, w := range want {
		if cfg.AllowOrigins[i] != w {
			t.Errorf("origin[%d] = %s, want %s", i, cfg.AllowOrigins[i], w)
		}
	}
}

func TestBuildCorsConfig_EmptyString(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "")
	defer os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	if len(cfg.AllowOrigins) != 1 {
		t.Fatalf("expected 1 default origin for empty string, got %d", len(cfg.AllowOrigins))
	}
	if cfg.AllowOrigins[0] != "http://localhost:5173" {
		t.Errorf("default origin = %s, want http://localhost:5173", cfg.AllowOrigins[0])
	}
}

func TestBuildCorsConfig_WhitespaceOnly(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "   ")
	defer os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	if len(cfg.AllowOrigins) != 1 {
		t.Fatalf("expected 1 default origin for whitespace, got %d", len(cfg.AllowOrigins))
	}
}

func TestBuildCorsConfig_TrailingComma(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "https://a.com,")
	defer os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	if len(cfg.AllowOrigins) != 1 {
		t.Fatalf("expected 1 origin (trailing comma ignored), got %d", len(cfg.AllowOrigins))
	}
}

func TestBuildCorsConfig_AllowedMethods(t *testing.T) {
	os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	expectedMethods := []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	if len(cfg.AllowMethods) != len(expectedMethods) {
		t.Fatalf("expected %d methods, got %d", len(expectedMethods), len(cfg.AllowMethods))
	}
	for i, m := range expectedMethods {
		if cfg.AllowMethods[i] != m {
			t.Errorf("method[%d] = %s, want %s", i, cfg.AllowMethods[i], m)
		}
	}
}

func TestBuildCorsConfig_AllowedHeaders(t *testing.T) {
	os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	expectedHeaders := []string{"Origin", "Content-Type", "Accept"}
	if len(cfg.AllowHeaders) != len(expectedHeaders) {
		t.Fatalf("expected %d headers, got %d", len(expectedHeaders), len(cfg.AllowHeaders))
	}
}

func TestBuildCorsConfig_MaxAge(t *testing.T) {
	os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	expectedMaxAge := 12 * time.Hour
	if cfg.MaxAge != expectedMaxAge {
		t.Errorf("MaxAge = %v, want %v", cfg.MaxAge, expectedMaxAge)
	}
}

func TestBuildCorsConfig_AllowCredentials(t *testing.T) {
	os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	if cfg.AllowCredentials != false {
		t.Errorf("AllowCredentials = true, want false")
	}
}

func TestBuildCorsConfig_OriginsTrimmed(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "  https://a.com  ,  https://b.com  ")
	defer os.Unsetenv("CORS_ORIGINS")
	cfg := BuildCorsConfig()
	for _, o := range cfg.AllowOrigins {
		if strings.TrimSpace(o) != o {
			t.Errorf("origin %q has surrounding whitespace", o)
		}
	}
}