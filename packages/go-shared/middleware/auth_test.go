package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func performAuthRequest(t *testing.T, header string, env map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	for k, v := range env {
		t.Setenv(k, v)
	}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(SharedTokenAuthMiddleware("X-Test-Auth", "TEST_AUTH_TOKEN", "缺少认证头", "服务未配置 token"))
	r.GET("/ping", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	req := httptest.NewRequest(http.MethodGet, "/ping", nil)
	if header != "" {
		req.Header.Set("X-Test-Auth", header)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestSharedTokenAuthMiddleware_Success(t *testing.T) {
	w := performAuthRequest(t, "secret-token", map[string]string{"TEST_AUTH_TOKEN": "secret-token"})
	if w.Code != http.StatusOK {
		t.Fatalf("期望 200，实际 %d", w.Code)
	}
	if w.Body.String() != "ok" {
		t.Fatalf("响应体异常: %s", w.Body.String())
	}
}

func TestSharedTokenAuthMiddleware_MissingEnvFailsClosed(t *testing.T) {
	w := performAuthRequest(t, "secret-token", map[string]string{})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("期望 401（未配置 token 应 fail-closed），实际 %d", w.Code)
	}
}

func TestSharedTokenAuthMiddleware_MissingHeader(t *testing.T) {
	w := performAuthRequest(t, "", map[string]string{"TEST_AUTH_TOKEN": "secret-token"})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("期望 401，实际 %d", w.Code)
	}
}

func TestSharedTokenAuthMiddleware_WrongToken(t *testing.T) {
	w := performAuthRequest(t, "wrong-token", map[string]string{"TEST_AUTH_TOKEN": "secret-token"})
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("期望 401，实际 %d", w.Code)
	}
}

func TestSharedTokenAuthMiddleware_EnvWhitespaceTrimmed(t *testing.T) {
	w := performAuthRequest(t, "secret-token", map[string]string{"TEST_AUTH_TOKEN": "  secret-token  "})
	if w.Code != http.StatusOK {
		t.Fatalf("期望 200（env 空白应被 TrimSpace），实际 %d", w.Code)
	}
}
