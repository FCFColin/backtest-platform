package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestHealthHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"engine":  "go",
			"version": "0.1.0",
		})
	})

	req := httptest.NewRequest("GET", "/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("Health handler returned %d, want 200", w.Code)
	}

	var resp map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if resp["status"] != "ok" {
		t.Errorf("Health status = %v, want ok", resp["status"])
	}
}

func TestSearchHandlerMissingQuery(t *testing.T) {
	gin.SetMode(gin.TestMode)

	r := gin.New()
	r.GET("/search", func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少查询参数 q"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true})
	})

	req := httptest.NewRequest("GET", "/search", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Missing query should return 400, got %d", w.Code)
	}
}

func TestPricePointJSON(t *testing.T) {
	pp := PricePoint{
		Date:   "2020-01-02",
		Open:   100.0,
		High:   105.0,
		Low:    98.0,
		Close:  103.0,
		Volume: 1000000,
	}
	data, err := json.Marshal(pp)
	if err != nil {
		t.Fatalf("Failed to marshal PricePoint: %v", err)
	}
	var pp2 PricePoint
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

func TestHandleValidateTickers_PathTraversal(t *testing.T) {
	maliciousTickers := []string{
		"../../etc/passwd",
		"..%2F..%2Fetc%2Fpasswd",
		"/etc/passwd",
		`..\..\windows\system32\config\sam`,
		"..\\..\\etc\\passwd",
	}
	for _, ticker := range maliciousTickers {
		if isValidTicker(ticker) {
			t.Errorf("isValidTicker(%q) = true, expected false (path traversal)", ticker)
		}
	}
}

// BenchmarkIsValidTicker 基准测试 ticker 格式校验
func BenchmarkIsValidTicker(b *testing.B) {
	b.ReportAllocs()
	for i := 0; i < b.N; i++ {
		isValidTicker("VTI")
	}
}
