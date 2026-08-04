package middleware

import (
	gosharedmw "github.com/backtest/go-shared/middleware"
	"github.com/gin-gonic/gin"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

const testEngineToken = "test-engine-secret-token"

func engineAuthMiddleware() gin.HandlerFunc {
	return gosharedmw.SharedTokenAuthMiddleware(
		"X-Engine-Auth",
		"ENGINE_AUTH_TOKEN",
		"missing X-Engine-Auth header",
		"no ENGINE_AUTH_TOKEN configured",
	)
}
func newTestRouter() *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/engine/health", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"status": "ok"}) })
	authed := r.Group("/")
	authed.Use(engineAuthMiddleware())
	{
		authed.POST("/api/engine/echo", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"success": true}) })
	}
	return r
}
func doReq(t *testing.T, method, path, token string) *httptest.ResponseRecorder {
	t.Helper()
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set("X-Engine-Auth", token)
	}
	w := httptest.NewRecorder()
	newTestRouter().ServeHTTP(w, req)
	return w
}
func TestAuthMiddleware(t *testing.T) {
	cases := []struct {
		name, token string
		want        int
	}{
		{"passes with correct token", testEngineToken, http.StatusOK},
		{"fails with missing header", "", http.StatusUnauthorized},
		{"fails with wrong token", "wrong-token", http.StatusUnauthorized},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := doReq(t, "POST", "/api/engine/echo", c.token)
			if w.Code != c.want {
				t.Errorf("expected %d, got %d, body=%s", c.want, w.Code, w.Body.String())
			}
		})
	}
}
func TestHealthAccessibleWithoutAuth(t *testing.T) {
	w := doReq(t, "GET", "/api/engine/health", "")
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 on health without auth, got %d, body=%s", w.Code, w.Body.String())
	}
}
