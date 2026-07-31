// Package handlers — data_test.go
package handlers
import (
    "net/http"
    "net/http/httptest"
    "strings"
    "testing"
    "github.com/gin-gonic/gin"
)
func TestIsValidTicker_Valid(t *testing.T) {
	cases := []struct {
		name   string
		ticker string
	}{
		{"uppercase letters", "AAPL"},
		{"alphanumeric", "MSFT"},
		{"with dot", "BRK.B"},
		{"with underscore", "000001_SZ"},
		{"with hyphen", "A-B"},
		{"single char", "A"},
		{"max length 20", "12345678901234567890"},
		{"numbers only", "000001"},
	}
	for _, c := range cases {
if !IsValidTicker(c.ticker) { t.Errorf("IsValidTicker(%q) = false, want true (%s)", c.ticker, c.name) }
	}
}
func TestIsValidTicker_Invalid(t *testing.T) {
	cases := []struct {
		name   string
		ticker string
	}{
		{"empty", ""},
		{"too long", "123456789012345678901"},
		{"path traversal dots", ".."},
		{"path traversal", "../etc/passwd"},
		{"forward slash", "AAPL/MSFT"},
		{"backslash", "AAPL\\MSFT"},
		{"special chars", "AAPL@MSFT"},
		{"spaces", "AAPL MSFT"},
		{"pipe", "AAPL|MSFT"},
		{"semicolon", "AAPL;MSFT"},
		{"lowercase letters", "aapl"},
		{"mixed case", "AaPL"},
	}
	for _, c := range cases {
if IsValidTicker(c.ticker) { t.Errorf("IsValidTicker(%q) = true, want false (%s)", c.ticker, c.name) }
	}
}
func TestIsValidTicker_BoundaryLength(t *testing.T) {
	ticker20 := "ABCDEFGHIJKLMNOPQRST"
if !IsValidTicker(ticker20) { t.Errorf("IsValidTicker(20 chars) = false, want true") }
	ticker21 := "ABCDEFGHIJKLMNOPQRSTU"
if IsValidTicker(ticker21) { t.Errorf("IsValidTicker(21 chars) = true, want false") }
}
func runHandler(method, path string, body string, handler gin.HandlerFunc) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Handle(method, path, handler)
	var req *http.Request
	if body != "" {
		req = httptest.NewRequest(method, path, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	} else {
		req = httptest.NewRequest(method, path, nil)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}
func TestHandleSearch_EmptyQuery(t *testing.T) {
	w := runHandler("GET", "/api/data/search", "", HandleSearch(nil))
if w.Code != http.StatusBadRequest { t.Errorf("HandleSearch empty query = %d, want 400", w.Code) }
}
func TestHandlePriceData_InvalidTicker(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/data/price/:ticker", HandlePriceData(nil))
	req := httptest.NewRequest("GET", "/api/data/price/aapl", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusBadRequest { t.Errorf("HandlePriceData invalid ticker = %d, want 400", w.Code) }
}
func TestHandleValidateTickers_BadJSON(t *testing.T) {
	w := runHandler("POST", "/api/data/validate", "{invalid", HandleValidateTickers(nil))
if w.Code != http.StatusBadRequest { t.Errorf("HandleValidateTickers bad JSON = %d, want 400", w.Code) }
}
func TestHandleValidateTickers_InvalidTicker(t *testing.T) {
	body := `{"tickers":["AAPL","../../etc/passwd"]}`
	w := runHandler("POST", "/api/data/validate", body, HandleValidateTickers(nil))
if w.Code != http.StatusBadRequest { t.Errorf("HandleValidateTickers invalid ticker = %d, want 400", w.Code) }
}
func TestHandleCPI_InvalidCountry(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/data/cpi/:country", HandleCPI(nil))
	req := httptest.NewRequest("GET", "/api/data/cpi/jp", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
if w.Code != http.StatusBadRequest { t.Errorf("HandleCPI invalid country = %d, want 400", w.Code) }
}
func TestHandleBatchPriceData_BadJSON(t *testing.T) {
	w := runHandler("POST", "/api/data/price/batch", "{invalid", HandleBatchPriceData(nil))
if w.Code != http.StatusBadRequest { t.Errorf("HandleBatchPriceData bad JSON = %d, want 400", w.Code) }
}
func TestHandleBatchPriceData_InvalidTicker(t *testing.T) {
	body := `{"tickers":["AAPL","bad/ticker"],"startDate":"2020-01-01","endDate":"2020-12-31"}`
	w := runHandler("POST", "/api/data/price/batch", body, HandleBatchPriceData(nil))
if w.Code != http.StatusBadRequest { t.Errorf("HandleBatchPriceData invalid ticker = %d, want 400", w.Code) }
}
