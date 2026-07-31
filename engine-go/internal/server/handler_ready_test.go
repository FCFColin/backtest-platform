package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestHandleReadyReturns200(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")
	req := httptest.NewRequest("GET", "/api/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse ready response: %v", err)
	}
	if resp["status"] != "ready" {
		t.Errorf("ready status = %v, want ready", resp["status"])
	}
	if resp["engine"] != "go" {
		t.Errorf("ready engine = %v, want go", resp["engine"])
	}
}
func TestHandleReadyNoAuthRequired(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")
	req := httptest.NewRequest("GET", "/api/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Errorf("expected 200 without auth, got %d, body=%s", w.Code, w.Body.String())
	}
}
