package middleware
import (
    "net/http"
    "net/http/httptest"
    "os"
    "testing"
    gosharedmw "github.com/backtest/go-shared/middleware"
    "github.com/gin-gonic/gin"
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
	{ authed.POST("/api/engine/echo", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"success": true}) }) }
	return r
}
func TestAuthPassesWithCorrectToken(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")
	r := newTestRouter()
	req := httptest.NewRequest("POST", "/api/engine/echo", nil)
	req.Header.Set("X-Engine-Auth", testEngineToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusOK { t.Errorf("expected 200 with correct token, got %d, body=%s", w.Code, w.Body.String()) }
}
func TestAuthFailsWithMissingHeader(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")
	r := newTestRouter()
	req := httptest.NewRequest("POST", "/api/engine/echo", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusUnauthorized { t.Errorf("expected 401 with missing header, got %d, body=%s", w.Code, w.Body.String()) }
}
func TestAuthFailsWithWrongToken(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")
	r := newTestRouter()
	req := httptest.NewRequest("POST", "/api/engine/echo", nil)
	req.Header.Set("X-Engine-Auth", "wrong-token")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusUnauthorized { t.Errorf("expected 401 with wrong token, got %d, body=%s", w.Code, w.Body.String()) }
}
func TestHealthAccessibleWithoutAuth(t *testing.T) {
	os.Setenv("ENGINE_AUTH_TOKEN", testEngineToken)
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")
	r := newTestRouter()
	req := httptest.NewRequest("GET", "/api/engine/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusOK { t.Errorf("expected 200 on health without auth, got %d, body=%s", w.Code, w.Body.String()) }
}
