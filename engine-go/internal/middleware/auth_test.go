package middleware

import (
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/gin-gonic/gin"
)

const testEngineToken = "test-engine-secret-token"

// newTestRouter 构建测试路由：/health 不需认证，/api/engine/echo 需认证。
func newTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/engine/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})
	authed := r.Group("/")
	authed.Use(EngineAuthMiddleware())
	{
		authed.POST("/api/engine/echo", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"success": true})
		})
	}
	return r
}

// TestAuthPassesWithCorrectToken 正确 token 应通过认证。
func TestAuthPassesWithCorrectToken(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	r := newTestRouter()
	req := httptest.NewRequest("POST", "/api/engine/echo", nil)
	req.Header.Set("X-Engine-Auth", testEngineToken)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 with correct token, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestAuthFailsWithMissingHeader 缺少认证头应返回 401。
func TestAuthFailsWithMissingHeader(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	r := newTestRouter()
	req := httptest.NewRequest("POST", "/api/engine/echo", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 with missing header, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestAuthFailsWithWrongToken 错误 token 应返回 401。
func TestAuthFailsWithWrongToken(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	r := newTestRouter()
	req := httptest.NewRequest("POST", "/api/engine/echo", nil)
	req.Header.Set("X-Engine-Auth", "wrong-token")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 with wrong token, got %d, body=%s", w.Code, w.Body.String())
	}
}

// TestHealthAccessibleWithoutAuth 健康检查端点无需认证即可访问。
func TestHealthAccessibleWithoutAuth(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	r := newTestRouter()
	req := httptest.NewRequest("GET", "/api/engine/health", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 on health without auth, got %d, body=%s", w.Code, w.Body.String())
	}
}
