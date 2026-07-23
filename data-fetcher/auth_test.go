package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"data-fetcher/internal/middleware"

	"github.com/gin-gonic/gin"
)

const testDataServiceToken = "test-data-service-secret-token"

// newAuthTestRouter 构建测试路由：/health 不需认证，/api/data/search 需认证。
func newAuthTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/data/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	authed := r.Group("/")
	authed.Use(middleware.DataServiceAuthMiddleware())
	{
		authed.GET("/api/data/search", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})
	}
	return r
}

// TestDataServiceAuthPassesWithCorrectToken 正确 token 应通过认证。
func TestDataServiceAuthPassesWithCorrectToken(t *testing.T) {
	os.Setenv("DATA_SERVICE_AUTH_TOKEN", testDataServiceToken)
	defer os.Unsetenv("DATA_SERVICE_AUTH_TOKEN")

	r := newAuthTestRouter()
	req := httptest.NewRequest("GET", "/api/data/search", nil)
	req.Header.Set("X-Data-Service-Auth", testDataServiceToken)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with correct token, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestDataServiceAuthFailsWithMissingHeader 缺少认证头应返回 401。
func TestDataServiceAuthFailsWithMissingHeader(t *testing.T) {
	os.Setenv("DATA_SERVICE_AUTH_TOKEN", testDataServiceToken)
	defer os.Unsetenv("DATA_SERVICE_AUTH_TOKEN")

	r := newAuthTestRouter()
	req := httptest.NewRequest("GET", "/api/data/search", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 with missing header, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestDataServiceHealthAccessibleWithoutAuth 健康检查端点无需认证即可访问。
func TestDataServiceHealthAccessibleWithoutAuth(t *testing.T) {
	os.Setenv("DATA_SERVICE_AUTH_TOKEN", testDataServiceToken)
	defer os.Unsetenv("DATA_SERVICE_AUTH_TOKEN")

	r := newAuthTestRouter()
	req := httptest.NewRequest("GET", "/api/data/health", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 on health without auth, got %d, body=%s", w.Code, w.Body.String())
	}
}
