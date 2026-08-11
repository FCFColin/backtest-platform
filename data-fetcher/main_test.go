package main

import (
	"data-fetcher/internal/handlers"
	"data-fetcher/internal/store"
	"encoding/json"
	gosharedmw "github.com/backtest/go-shared/middleware"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestPricePointJSON(t *testing.T) {
	pp := store.PricePoint{Date: "2020-01-02", Open: 100.0, High: 105.0, Low: 98.0, Close: 103.0, Volume: 1000000}
	data, err := json.Marshal(pp)
	if err != nil {
		t.Fatalf("Failed to marshal PricePoint: %v", err)
	}
	var pp2 store.PricePoint
	if err := json.Unmarshal(data, &pp2); err != nil {
		t.Fatalf("Failed to unmarshal PricePoint: %v", err)
	}
	if pp2.Date != "2020-01-02" {
		t.Errorf("Date = %q, want 2020-01-02", pp2.Date)
	}
	if pp2.Close != 103.0 {
		t.Errorf("Close = %f, want 103.0", pp2.Close)
	}
}
func TestIsValidTicker_PathTraversal(t *testing.T) {
	maliciousTickers := []string{
		"../../etc/passwd",
		"..%2F..%2Fetc%2Fpasswd",
		"/etc/passwd",
		`..\..\windows\system32\config\sam`,
		"..\\..\\etc\\passwd",
	}
	for _, ticker := range maliciousTickers {
		if handlers.IsValidTicker(ticker) {
			t.Errorf("IsValidTicker(%q) = true, expected false (path traversal)", ticker)
		}
	}
}
func BenchmarkIsValidTicker(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		handlers.IsValidTicker("VTI")
	}
}
func TestNewDefaultConfig_DefaultValues(t *testing.T) {
	os.Unsetenv("DATABASE_URL")
	cfg := newDefaultConfig()
	if cfg.Port != "5003" {
		t.Errorf("default Port = %q, want 5003", cfg.Port)
	}
	if cfg.DatabaseURL != "" {
		t.Errorf("default DatabaseURL = %q, want empty", cfg.DatabaseURL)
	}
}
func TestNewDefaultConfig_WithDatabaseURL(t *testing.T) {
	os.Setenv("DATABASE_URL", "  postgres://localhost/test  ")
	defer os.Unsetenv("DATABASE_URL")
	cfg := newDefaultConfig()
	if cfg.DatabaseURL != "postgres://localhost/test" {
		t.Errorf("DatabaseURL = %q, want trimmed URL", cfg.DatabaseURL)
	}
}
func TestNewRegistry_DefaultPriority(t *testing.T) {
	os.Unsetenv("DATA_PROVIDER_PRIORITY")
	reg := newRegistry()
	if reg == nil {
		t.Fatal("newRegistry returned nil")
	}
	tickers := reg.ForTicker("AAPL")
	if len(tickers) == 0 {
		t.Error("expected at least one provider for AAPL")
	}
	if len(tickers) == 0 || tickers[0] == nil {
		t.Error("first provider should be non-nil")
	}
}
func TestNewRegistry_CustomPriority(t *testing.T) {
	os.Setenv("DATA_PROVIDER_PRIORITY", "yfinance,akshare")
	defer os.Unsetenv("DATA_PROVIDER_PRIORITY")
	reg := newRegistry()
	if reg == nil {
		t.Fatal("newRegistry returned nil")
	}
	if len(reg.ForTicker("VTI")) == 0 {
		t.Error("expected providers for VTI")
	}
}
func TestNewRegistry_EmptyPriority(t *testing.T) {
	os.Setenv("DATA_PROVIDER_PRIORITY", "")
	defer os.Unsetenv("DATA_PROVIDER_PRIORITY")
	reg := newRegistry()
	if reg == nil {
		t.Fatal("newRegistry returned nil with empty priority env")
	}
}

const testDataServiceToken = "test-data-service-secret-token" // #nosec G101 -- 测试夹具假密钥，非真实凭据

func dataServiceAuthMiddleware() gin.HandlerFunc {
	return gosharedmw.SharedTokenAuthMiddleware(
		"X-Data-Service-Auth",
		"DATA_SERVICE_AUTH_TOKEN",
		"missing X-Data-Service-Auth header",
		"no DATA_SERVICE_AUTH_TOKEN configured",
	)
}
func newAuthTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/data/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	authed := r.Group("/")
	authed.Use(dataServiceAuthMiddleware())
	{
		authed.GET("/api/data/search", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"success": true}) })
	}
	return r
}
func TestDataServiceAuth(t *testing.T) {
	os.Setenv("DATA_SERVICE_AUTH_TOKEN", testDataServiceToken)
	defer os.Unsetenv("DATA_SERVICE_AUTH_TOKEN")
	tests := []struct {
		name   string
		path   string
		token  string
		status int
	}{
		{"health accessible without auth", "/api/data/health", "", http.StatusOK},
		{"passes with correct token", "/api/data/search", testDataServiceToken, http.StatusOK},
		{"fails with missing header", "/api/data/search", "", http.StatusUnauthorized},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := newAuthTestRouter()
			req := httptest.NewRequest("GET", tt.path, nil)
			if tt.token != "" {
				req.Header.Set("X-Data-Service-Auth", tt.token)
			}
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)
			if w.Code != tt.status {
				t.Errorf("expected %d, got %d, body=%s", tt.status, w.Code, w.Body.String())
			}
		})
	}
}
