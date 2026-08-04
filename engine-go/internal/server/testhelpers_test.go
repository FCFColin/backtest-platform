package server

import (
	"encoding/json"
	"github.com/gin-gonic/gin"
	"io"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

const testAuthToken = "test-engine-auth-token"

func init() {
	gin.SetMode(gin.TestMode)
}

func newTestRouter() *gin.Engine {
	os.Setenv("ENGINE_AUTH_TOKEN", testAuthToken)
	return SetupRouter(nil)
}

func stringReader(s string) io.Reader {
	return strings.NewReader(s)
}

func doReq(t *testing.T, method, path string, body io.Reader, token string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, body)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if token != "" {
		req.Header.Set("X-Engine-Auth", token)
	}
	w := httptest.NewRecorder()
	newTestRouter().ServeHTTP(w, req)
	return w
}

func wantStatus(t *testing.T, w *httptest.ResponseRecorder, want int) {
	t.Helper()
	if w.Code != want {
		t.Fatalf("expected %d, got %d, body=%s", want, w.Code, w.Body.String())
	}
}

func decodeJSON[T any](t *testing.T, w *httptest.ResponseRecorder) T {
	t.Helper()
	var v T
	if err := json.Unmarshal(w.Body.Bytes(), &v); err != nil {
		t.Fatalf("failed to parse JSON: %v", err)
	}
	return v
}
