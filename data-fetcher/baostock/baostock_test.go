package baostock

import (
	"reflect"
	"strconv"
	"strings"
	"testing"
)

func buildResponse(msgType, body string) string {
	header := "00.9.10" + MsgSplit + msgType + MsgSplit + padLeft(strconv.Itoa(len(body)), "0", HeaderBodyLength)
	return header + body
}

func TestPadLeft(t *testing.T) {
	tests := []struct {
		input, pad string
		length     int
		expected   string
	}{
		{"5", "0", 10, "0000000005"},
		{"100", "0", 10, "0000000100"},
		{"10000", "0", 10, "0000010000"},
		{"abc", "0", 5, "00abc"},
	}
	for _, tt := range tests {
		result := padLeft(tt.input, tt.pad, tt.length)
		if result != tt.expected {
			t.Errorf("padLeft(%q, %q, %d) = %q, want %q", tt.input, tt.pad, tt.length, result, tt.expected)
		}
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("abc", 10); got != "abc" {
		t.Errorf("truncate short = %q, want abc", got)
	}
	result := truncate("abcdefghijklmnopqrstuvwxyz", 10)
	if len(result) > 13 {
		t.Errorf("truncate long too long: %q", result)
	}
	if !strings.HasSuffix(result, "...") {
		t.Errorf("truncate should end with ..., got %q", result)
	}
}

func TestZlibDecompress(t *testing.T) {
	if _, err := zlibDecompress([]byte{}); err == nil {
		t.Error("zlib decompress of empty data should fail")
	}
}

func TestNewClientUserID(t *testing.T) {
	if got := NewClient().userID; got != "anonymous" {
		t.Errorf("userID = %q, want anonymous", got)
	}
}

func TestParseKDataResponseDynamic(t *testing.T) {
	tests := []struct {
		name       string
		fields     []string
		resp       string
		wantIsLast bool
		wantErr    bool
		wantCount  int
		wantFirst  map[string]string
	}{
		{"valid", []string{"date", "open", "high", "low", "close", "volume", "amount"},
			buildResponse("01", "0\x01success\x01"+`{"record":[["2024-01-02","10.5","11.0","10.0","10.8","1000","10500"]]}`),
			false, false, 1, map[string]string{"date": "2024-01-02", "close": "10.8"}},
		{"multiple", []string{"date", "close"},
			buildResponse("01", "0\x01success\x01"+`{"record":[["2024-01-02","10.5"],["2024-01-03","11.0"],["2024-01-04","11.5"]]}`),
			false, false, 3, nil},
		{"short_response", []string{"date"}, "short", true, false, 0, nil},
		{"error_code", []string{"date"}, buildResponse("01", "1\x01error message"), true, true, 0, nil},
		{"no_record", []string{"date"}, buildResponse("01", "0\x01success\x01no record here"), true, false, 0, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			data, isLast, err := (&Client{}).parseKDataResponseDynamic(tt.resp, tt.fields)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr = %v", err, tt.wantErr)
			}
			if isLast != tt.wantIsLast {
				t.Errorf("isLast = %v, want %v", isLast, tt.wantIsLast)
			}
			if len(data) != tt.wantCount {
				t.Fatalf("len(data) = %d, want %d", len(data), tt.wantCount)
			}
			for k, v := range tt.wantFirst {
				if data[0][k] != v {
					t.Errorf("data[0][%q] = %q, want %q", k, data[0][k], v)
				}
			}
		})
	}
}

func TestParseAllStockResponse(t *testing.T) {
	tests := []struct {
		name      string
		resp      string
		wantErr   bool
		wantCount int
		wantFirst StockInfo
	}{
		{"valid", buildResponse("01", "0\x01success\x01"+`{"record":[["sh.600000","1","浦发银行"],["sz.000001","1","平安银行"]]}`),
			false, 2, StockInfo{Code: "sh.600000", TradeStatus: "1", CodeName: "浦发银行"}},
		{"short_response", "short", false, 0, StockInfo{}},
		{"error_code", buildResponse("01", "1\x01error"), true, 0, StockInfo{}},
		{"partial_fields", buildResponse("01", "0\x01success\x01"+`{"record":[["sh.600000"]]}`), false, 1, StockInfo{Code: "sh.600000"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stocks, err := (&Client{}).parseAllStockResponse(tt.resp)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr = %v", err, tt.wantErr)
			}
			if len(stocks) != tt.wantCount {
				t.Fatalf("len(stocks) = %d, want %d", len(stocks), tt.wantCount)
			}
			if tt.wantCount > 0 && stocks[0] != tt.wantFirst {
				t.Errorf("stocks[0] = %+v, want %+v", stocks[0], tt.wantFirst)
			}
		})
	}
}

func TestParseTradeDatesResponse(t *testing.T) {
	tests := []struct {
		name      string
		resp      string
		wantErr   bool
		wantDates []string
	}{
		{"valid", buildResponse("01", "0\x01success\x01"+`{"record":[["2024-01-02","1"],["2024-01-03","1"],["2024-01-06","0"],["2024-01-07","1"]]}`),
			false, []string{"2024-01-02", "2024-01-03", "2024-01-07"}},
		{"short_response", "short", false, nil},
		{"error_code", buildResponse("01", "1\x01error"), true, nil},
		{"all_non_trading", buildResponse("01", "0\x01success\x01"+`{"record":[["2024-01-06","0"],["2024-01-07","0"]]}`), false, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			dates, err := (&Client{}).parseTradeDatesResponse(tt.resp)
			if tt.wantErr != (err != nil) {
				t.Fatalf("err = %v, wantErr = %v", err, tt.wantErr)
			}
			if !reflect.DeepEqual(dates, tt.wantDates) {
				t.Errorf("dates = %v, want %v", dates, tt.wantDates)
			}
		})
	}
}
