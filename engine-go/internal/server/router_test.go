package server

import (
	sharedhttp "github.com/backtest/go-shared/http"
	"github.com/gin-gonic/gin"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEngineBadRequestScenarios(t *testing.T) {
	cases := []struct {
		name, method, path, token string
		body                      io.Reader
	}{
		{"backtest empty body", "POST", "/api/engine/backtest", testAuthToken, nil},
		{"backtest empty portfolios", "POST", "/api/engine/backtest", testAuthToken, stringReader(`{"portfolios":[],"priceData":{}}`)},
		{"backtest nil priceData", "POST", "/api/engine/backtest", testAuthToken, stringReader(`{"portfolios":[{"name":"test","assets":[{"ticker":"SPY","weight":100}],"rebalanceFrequency":"quarterly"}]}`)},
		{"analysis empty tickers", "POST", "/api/engine/analysis", testAuthToken, stringReader(`{"tickers":[],"priceData":{}}`)},
		{"analysis nil priceData", "POST", "/api/engine/analysis", testAuthToken, stringReader(`{"tickers":["SPY"]}`)},
		{"analysis ticker not in priceData", "POST", "/api/engine/analysis", testAuthToken, stringReader(`{"tickers":["SPY"],"priceData":{"BND":{"2024-01-01":100}}}`)},
		{"analysis bad JSON", "POST", "/api/engine/analysis", testAuthToken, stringReader("not-json")},
		{"optimize bad JSON", "POST", "/api/engine/optimize", testAuthToken, stringReader("not-json")},
		{"monte-carlo bad JSON", "POST", "/api/engine/monte-carlo", testAuthToken, stringReader("not-json")},
		{"efficient-frontier bad JSON", "POST", "/api/engine/efficient-frontier", testAuthToken, stringReader("not-json")},
		{"backtest date range with no trading data", "POST", "/api/engine/backtest", testAuthToken, stringReader(`{"portfolios":[{"name":"test","assets":[{"ticker":"SPY","weight":100}],"rebalanceFrequency":"quarterly"}],"priceData":{"SPY":{"2024-01-02":100,"2024-01-03":101}},"params":{"startDate":"2025-01-01","endDate":"2025-12-31"}}`)},
		{"monte-carlo insufficient history", "POST", "/api/engine/monte-carlo", testAuthToken, stringReader(`{"portfolio":{"name":"test","assets":[{"ticker":"SPY","weight":100}]},"priceData":{"SPY":{"2024-01-02":100,"2024-01-03":101}},"params":{"startDate":"2024-01-01","endDate":"2024-12-31"}}`)},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			wantStatus(t, doReq(t, c.method, c.path, c.body, c.token), http.StatusBadRequest)
		})
	}
}

func TestAuthMiddlewareRejects(t *testing.T) {
	cases := []struct{ name, token string }{
		{"missing header", ""},
		{"wrong token", "wrong-token"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			wantStatus(t, doReq(t, "POST", "/api/engine/backtest", nil, c.token), http.StatusUnauthorized)
		})
	}
}

func TestHealthAndReady(t *testing.T) {
	cases := []struct{ name, path, status string }{
		{"health no auth required", "/api/engine/health", "ok"},
		{"ready no auth required", "/api/ready", "ready"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := doReq(t, "GET", c.path, nil, "")
			wantStatus(t, w, http.StatusOK)
			resp := decodeJSON[map[string]interface{}](t, w)
			if resp["status"] != c.status {
				t.Errorf("status = %v, want %s", resp["status"], c.status)
			}
			if resp["engine"] != "go" {
				t.Errorf("engine = %v, want go", resp["engine"])
			}
		})
	}
}

func TestProblemFormat(t *testing.T) {
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest("GET", "/", nil)
	sharedhttp.NewProblem(c, http.StatusBadRequest, "TEST_CODE", "Test Title", "test detail")
	wantStatus(t, w, http.StatusBadRequest)
	p := decodeJSON[sharedhttp.Problem](t, w)
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
