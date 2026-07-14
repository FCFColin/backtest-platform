package server

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

const testAuthToken = "test-engine-auth-token"

func init() {
	gin.SetMode(gin.TestMode)
}

// stringReader 将字符串转为 io.Reader，用于构造 HTTP 请求体。
func stringReader(s string) io.Reader {
	return strings.NewReader(s)
}

// newTestRouter 构建带认证的测试路由（复用 SetupRouter 但传入 nil metricsHandler）。
func newTestRouter() *gin.Engine {
	os.Setenv("ENGINE_AUTH_TOKEN", testAuthToken)
	return SetupRouter(nil)
}

func TestHandleHealth(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("GET", "/api/engine/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", w.Code, w.Body.String())
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse health response: %v", err)
	}
	if resp["status"] != "ok" {
		t.Errorf("health status = %v, want ok", resp["status"])
	}
	if resp["engine"] != "go" {
		t.Errorf("health engine = %v, want go", resp["engine"])
	}
}

func TestHandleHealthNoAuthRequired(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	// 健康检查无需 X-Engine-Auth 头
	req := httptest.NewRequest("GET", "/api/engine/health", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200 without auth, got %d", w.Code)
	}
}

func TestHandleBacktestEmptyBody(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("POST", "/api/engine/backtest", nil)
	req.Header.Set("X-Engine-Auth", testAuthToken)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty body, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleBacktestEmptyPortfolios(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	body := `{"portfolios":[],"priceData":{}}`
	req := httptest.NewRequest("POST", "/api/engine/backtest", stringReader(body))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty portfolios, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleBacktestNilPriceData(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	body := `{"portfolios":[{"name":"test","assets":[{"ticker":"SPY","weight":100}],"rebalanceFrequency":"quarterly"}]}`
	req := httptest.NewRequest("POST", "/api/engine/backtest", stringReader(body))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for nil priceData, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleAnalysisEmptyTickers(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	body := `{"tickers":[],"priceData":{}}`
	req := httptest.NewRequest("POST", "/api/engine/analysis", stringReader(body))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for empty tickers, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleAnalysisNilPriceData(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	body := `{"tickers":["SPY"]}`
	req := httptest.NewRequest("POST", "/api/engine/analysis", stringReader(body))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for nil priceData, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleAnalysisTickerNotFound(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	body := `{"tickers":["SPY"],"priceData":{"BND":{"2024-01-01":100}}}`
	req := httptest.NewRequest("POST", "/api/engine/analysis", stringReader(body))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for ticker not in priceData, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleAnalysisBadJSON(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("POST", "/api/engine/analysis", stringReader("not-json"))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestAuthMiddlewareBlocksMissingHeader(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("POST", "/api/engine/backtest", nil)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for missing auth header, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestAuthMiddlewareBlocksWrongToken(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("POST", "/api/engine/backtest", nil)
	req.Header.Set("X-Engine-Auth", "wrong-token")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong token, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleOptimizeBadJSON(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("POST", "/api/engine/optimize", stringReader("not-json"))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleMonteCarloBadJSON(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("POST", "/api/engine/monte-carlo", stringReader("not-json"))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestHandleEfficientFrontierBadJSON(t *testing.T) {
	r := newTestRouter()
	defer os.Unsetenv("ENGINE_AUTH_TOKEN")

	req := httptest.NewRequest("POST", "/api/engine/efficient-frontier", stringReader("not-json"))
	req.Header.Set("X-Engine-Auth", testAuthToken)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for bad JSON, got %d, body=%s", w.Code, w.Body.String())
	}
}

func TestProblemFormat(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/", nil)

	newProblem(c, http.StatusBadRequest, "TEST_CODE", "Test Title", "test detail")

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
	var p Problem
	if err := json.Unmarshal(w.Body.Bytes(), &p); err != nil {
		t.Fatalf("failed to parse problem: %v", err)
	}
	if p.Code != "TEST_CODE" {
		t.Errorf("problem code = %s, want TEST_CODE", p.Code)
	}
	if p.Title != "Test Title" {
		t.Errorf("problem title = %s, want Test Title", p.Title)
	}
	if p.Detail != "test detail" {
		t.Errorf("problem detail = %s, want test detail", p.Detail)
	}
	if p.Type != "https://backtest.platform/errors/TEST_CODE" {
		t.Errorf("problem type = %s, want https://backtest.platform/errors/TEST_CODE", p.Type)
	}
}
