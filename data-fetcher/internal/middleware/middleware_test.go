// Package middleware — middleware_test.go
package middleware

import (
	"os"
	"slices"
	"testing"
	"time"
)

func TestBuildCorsConfig(t *testing.T) {
	tests := []struct {
		name string
		set  bool
		env  string
		want []string
	}{
		{"default when unset", false, "", []string{"http://localhost:5173"}},
		{"default on empty string", true, "", []string{"http://localhost:5173"}},
		{"default on whitespace only", true, "   ", []string{"http://localhost:5173"}},
		{"single origin", true, "https://example.com", []string{"https://example.com"}},
		{"multiple origins trimmed", true, "https://a.com, https://b.com,https://c.com", []string{"https://a.com", "https://b.com", "https://c.com"}},
		{"trailing comma ignored", true, "https://a.com,", []string{"https://a.com"}},
		{"origins trimmed", true, "  https://a.com  ,  https://b.com  ", []string{"https://a.com", "https://b.com"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.set {
				os.Setenv("CORS_ORIGINS", tt.env)
				defer os.Unsetenv("CORS_ORIGINS")
			} else {
				os.Unsetenv("CORS_ORIGINS")
			}
			if got := BuildCorsConfig().AllowOrigins; !slices.Equal(got, tt.want) {
				t.Errorf("AllowOrigins = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestBuildCorsConfig_StaticDefaults(t *testing.T) {
	cfg := BuildCorsConfig()
	if got, want := cfg.AllowMethods, []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}; !slices.Equal(got, want) {
		t.Errorf("AllowMethods = %v, want %v", got, want)
	}
	if got, want := cfg.AllowHeaders, []string{"Origin", "Content-Type", "Accept"}; !slices.Equal(got, want) {
		t.Errorf("AllowHeaders = %v, want %v", got, want)
	}
	if cfg.MaxAge != 12*time.Hour {
		t.Errorf("MaxAge = %v, want %v", cfg.MaxAge, 12*time.Hour)
	}
	if cfg.AllowCredentials {
		t.Error("AllowCredentials = true, want false")
	}
}
