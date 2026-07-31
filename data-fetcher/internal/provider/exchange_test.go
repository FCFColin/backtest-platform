package provider

import "testing"

func TestDeriveExchange(t *testing.T) {
	cases := []struct {
		ticker string
		want   string
	}{
		{"000001_SZ", "SZSE"},
		{"600519_SH", "SSE"},
		{"510050_SS", "SSE"},
		{"000001.SZ", "SZSE"},
		{"600519.SH", "SSE"},
		{"510050.SS", "SSE"},
		{"000001_sz", "SZSE"},
		{"600519.sh", "SSE"},
		{"AAPL", "US"},
		{"SPY", "US"},
		{"VTI", "US"},
		{"_SZ", "SZSE"},
		{".SH", "SSE"},
		{"BRK.B", "US"}, // .B 不是交易所后缀
	}
	for _, c := range cases {
		got := DeriveExchange(c.ticker)
		if got != c.want {
			t.Errorf("DeriveExchange(%q) = %q, want %q", c.ticker, got, c.want)
		}
	}
}
