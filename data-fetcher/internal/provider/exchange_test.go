package provider

import "testing"

func TestDeriveExchange(t *testing.T) {
	cases := []struct {
		ticker string
		want   string
	}{
		// 下划线后缀
		{"000001_SZ", "SZSE"},
		{"600519_SH", "SSE"},
		{"510050_SS", "SSE"},
		// 点号后缀
		{"000001.SZ", "SZSE"},
		{"600519.SH", "SSE"},
		{"510050.SS", "SSE"},
		// 大小写不敏感
		{"000001_sz", "SZSE"},
		{"600519.sh", "SSE"},
		// 美股（无后缀）
		{"AAPL", "US"},
		{"SPY", "US"},
		{"VTI", "US"},
		// 边界：仅后缀无代码
		{"_SZ", "SZSE"},
		{".SH", "SSE"},
		// 边界：含点但非交易所后缀
		{"BRK.B", "US"}, // .B 不是交易所后缀
	}
	for _, c := range cases {
		got := DeriveExchange(c.ticker)
		if got != c.want {
			t.Errorf("DeriveExchange(%q) = %q, want %q", c.ticker, got, c.want)
		}
	}
}
