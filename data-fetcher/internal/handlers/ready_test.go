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

// fakePinger 测试用 Pinger 实现，可控地返回成功或失败。
type fakePinger struct {
	err error
}

func (f fakePinger) Ping(_ context.Context) error {
	return f.err
}

// TestHandleReadyReturns200WhenDBHealthy 验证 DB Ping 成功时返回 200。
// 企业理由（C-008）：readinessProbe 必须独立于 livenessProbe，
// 依赖（DB）故障时从 Service 摘除流量而非重启 Pod。
func TestHandleReadyReturns200WhenDBHealthy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/ready", HandleReady(fakePinger{err: nil}))

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
}

// TestHandleReadyReturns503WhenDBUnhealthy 验证 DB Ping 失败时返回 503，
// 使 K8s 将 Pod 从 Service 端点摘除（而非重启）。
func TestHandleReadyReturns503WhenDBUnhealthy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/ready", HandleReady(fakePinger{err: errors.New("db connection refused")}))

	req := httptest.NewRequest("GET", "/api/ready", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d, body=%s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse ready response: %v", err)
	}
	if resp["status"] != "unavailable" {
		t.Errorf("ready status = %v, want unavailable", resp["status"])
	}
}
