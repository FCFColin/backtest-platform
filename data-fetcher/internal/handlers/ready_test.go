package handlers
import (
    "context"
    "encoding/json"
    "errors"
    "net/http"
    "net/http/httptest"
    "testing"
    "github.com/gin-gonic/gin"
)
type fakePinger struct {
	err error
}
func (f fakePinger) Ping(_ context.Context) error {
	return f.err
}
func TestHandleReadyReturns200WhenDBHealthy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/ready", HandleReady(fakePinger{err: nil}))
	req := httptest.NewRequest("GET", "/api/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusOK { t.Fatalf("expected 200, got %d, body=%s", w.Code, w.Body.String()) }
	var resp map[string]interface{}
if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil { t.Fatalf("failed to parse ready response: %v", err) }
if resp["status"] != "ready" { t.Errorf("ready status = %v, want ready", resp["status"]) }
}
func TestHandleReadyReturns503WhenDBUnhealthy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/ready", HandleReady(fakePinger{err: errors.New("db connection refused")}))
	req := httptest.NewRequest("GET", "/api/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusServiceUnavailable { t.Fatalf("expected 503, got %d, body=%s", w.Code, w.Body.String()) }
	var resp map[string]interface{}
if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil { t.Fatalf("failed to parse ready response: %v", err) }
if resp["status"] != "unavailable" { t.Errorf("ready status = %v, want unavailable", resp["status"]) }
}
