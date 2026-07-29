package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

// TestHandleReadyReturns200 验证 /api/ready 端点在进程可响应时返回 200。
// 企业理由（C-008）：readinessProbe 必须使用独立路径，与 livenessProbe 区分，
// 避免依赖故障时 Pod 被重启而非从负载均衡摘除。
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

// TestHandleReadyNoAuthRequired 验证 /api/ready 无需 X-Engine-Auth 头，
// 便于 K8s 探针访问（与 /api/engine/health 一致）。
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
