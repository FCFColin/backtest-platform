// Package baostock — parse_test.go
package baostock
import (
    "strconv"
    "testing"
)
func buildResponse(msgType, body string) string {
	header := "00.9.10" + MsgSplit + msgType + MsgSplit + padLeft(strconv.Itoa(len(body)), "0", HeaderBodyLength)
	return header + body
}
func TestParseKDataResponseDynamic_ValidJSON(t *testing.T) {
	jsonRecord := `{"record": [["2024-01-02", "10.5", "11.0", "10.0", "10.8", "1000", "10500"]]}`
	fieldNames := []string{"date", "open", "high", "low", "close", "volume", "amount"}
	body := "0\x01success\x01" + jsonRecord
	resp := buildResponse("01", body)
	client := &Client{}
	data, isLast, err := client.parseKDataResponseDynamic(resp, fieldNames)
if err != nil { t.Fatalf("unexpected error: %v", err) }
if isLast { t.Error("expected isLast=false for valid response with data") }
if len(data) != 1 { t.Fatalf("expected 1 data point, got %d", len(data)) }
if data[0]["date"] != "2024-01-02" { t.Errorf("date = %s, want 2024-01-02", data[0]["date"]) }
}
func TestParseKDataResponseDynamic_ShortResponse(t *testing.T) {
	client := &Client{}
	data, isLast, err := client.parseKDataResponseDynamic("short", []string{"date"})
if err != nil { t.Errorf("expected no error for short response, got: %v", err) }
if !isLast { t.Error("expected isLast=true for short response") }
if data != nil { t.Error("expected nil data for short response") }
}
func TestParseKDataResponseDynamic_ErrorCode(t *testing.T) {
	body := "1\x01error message"
	resp := buildResponse("01", body)
	client := &Client{}
	_, _, err := client.parseKDataResponseDynamic(resp, []string{"date"})
if err == nil { t.Error("expected error for non-zero error code") }
}
func TestParseKDataResponseDynamic_NoRecord(t *testing.T) {
	body := "0\x01success\x01no record here"
	resp := buildResponse("01", body)
	client := &Client{}
	_, isLast, err := client.parseKDataResponseDynamic(resp, []string{"date"})
if err != nil { t.Errorf("unexpected error: %v", err) }
if !isLast { t.Error("expected isLast=true when no record found") }
}
func TestParseKDataResponseDynamic_MultipleRecords(t *testing.T) {
	jsonRecord := `{"record": [["2024-01-02", "10.5"], ["2024-01-03", "11.0"], ["2024-01-04", "11.5"]]}`
	fieldNames := []string{"date", "close"}
	body := "0\x01success\x01" + jsonRecord
	resp := buildResponse("01", body)
	client := &Client{}
	data, _, err := client.parseKDataResponseDynamic(resp, fieldNames)
if err != nil { t.Fatalf("unexpected error: %v", err) }
if len(data) != 3 { t.Fatalf("expected 3 data points, got %d", len(data)) }
}
func TestParseAllStockResponse_ValidJSON(t *testing.T) {
	jsonRecord := `{"record": [["sh.600000", "1", "浦发银行"], ["sz.000001", "1", "平安银行"]]}`
	body := "0\x01success\x01" + jsonRecord
	resp := buildResponse("01", body)
	client := &Client{}
	stocks, err := client.parseAllStockResponse(resp)
if err != nil { t.Fatalf("unexpected error: %v", err) }
if len(stocks) != 2 { t.Fatalf("expected 2 stocks, got %d", len(stocks)) }
if stocks[0].Code != "sh.600000" { t.Errorf("first Code = %s, want sh.600000", stocks[0].Code) }
if stocks[0].CodeName != "浦发银行" { t.Errorf("first CodeName = %s, want 浦发银行", stocks[0].CodeName) }
}
func TestParseAllStockResponse_ShortResponse(t *testing.T) {
	client := &Client{}
	stocks, err := client.parseAllStockResponse("short")
if err != nil { t.Errorf("expected no error for short response, got: %v", err) }
if stocks != nil { t.Error("expected nil stocks for short response") }
}
func TestParseAllStockResponse_ErrorCode(t *testing.T) {
	body := "1\x01error"
	resp := buildResponse("01", body)
	client := &Client{}
	_, err := client.parseAllStockResponse(resp)
if err == nil { t.Error("expected error for non-zero error code") }
}
func TestParseAllStockResponse_PartialFields(t *testing.T) {
	jsonRecord := `{"record": [["sh.600000"]]}`
	body := "0\x01success\x01" + jsonRecord
	resp := buildResponse("01", body)
	client := &Client{}
	stocks, err := client.parseAllStockResponse(resp)
if err != nil { t.Fatalf("unexpected error: %v", err) }
if len(stocks) != 1 { t.Fatalf("expected 1 stock, got %d", len(stocks)) }
if stocks[0].Code != "sh.600000" { t.Errorf("Code = %s, want sh.600000", stocks[0].Code) }
}
func TestParseTradeDatesResponse_ValidJSON(t *testing.T) {
	jsonRecord := `{"record": [["2024-01-02", "1"], ["2024-01-03", "1"], ["2024-01-06", "0"], ["2024-01-07", "1"]]}`
	body := "0\x01success\x01" + jsonRecord
	resp := buildResponse("01", body)
	client := &Client{}
	dates, err := client.parseTradeDatesResponse(resp)
if err != nil { t.Fatalf("unexpected error: %v", err) }
if len(dates) != 3 { t.Fatalf("expected 3 trading dates, got %d", len(dates)) }
if dates[0] != "2024-01-02" { t.Errorf("first date = %s, want 2024-01-02", dates[0]) }
}
func TestParseTradeDatesResponse_ShortResponse(t *testing.T) {
	client := &Client{}
	dates, err := client.parseTradeDatesResponse("short")
if err != nil { t.Errorf("expected no error for short response, got: %v", err) }
if dates != nil { t.Error("expected nil dates for short response") }
}
func TestParseTradeDatesResponse_ErrorCode(t *testing.T) {
	body := "1\x01error"
	resp := buildResponse("01", body)
	client := &Client{}
	_, err := client.parseTradeDatesResponse(resp)
if err == nil { t.Error("expected error for non-zero error code") }
}
func TestParseTradeDatesResponse_AllNonTradingDays(t *testing.T) {
	jsonRecord := `{"record": [["2024-01-06", "0"], ["2024-01-07", "0"]]}`
	body := "0\x01success\x01" + jsonRecord
	resp := buildResponse("01", body)
	client := &Client{}
	dates, err := client.parseTradeDatesResponse(resp)
if err != nil { t.Fatalf("unexpected error: %v", err) }
if len(dates) != 0 { t.Errorf("expected 0 trading dates, got %d", len(dates)) }
}
