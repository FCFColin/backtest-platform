package provider

import (
	"regexp"
)

// exchange 后缀正则：同时支持点号（000001.SZ）与下划线（000001_SZ）两种格式。
// (?i) 使匹配大小写不敏感，与 backend 的 deriveExchangeFromTicker 保持一致（Task 4.5）。
var (
	reSZExchange  = regexp.MustCompile(`(?i)[._]SZ$`)
	reSSEExchange = regexp.MustCompile(`(?i)[._](SS|SH)$`)
)

// DeriveExchange 按 ticker 后缀推导交易所代码。
//
//	_SZ / .SZ  → SZSE（深圳证券交易所）
//	_SS / .SS  → SSE（上海证券交易所）
//	_SH / .SH  → SSE（上海证券交易所）
//	其余无后缀 → US（美国市场；后续可由 Yahoo provider 细化为 NASDAQ/NYSE）
//
// 用于在 data-fetcher 抓取行情时填充 tickers.exchange 列，使按交易所分布统计
// 不再全部显示"未知"。exchange 由 ticker 确定性推导，重复调用幂等。
func DeriveExchange(ticker string) string {
	if reSZExchange.MatchString(ticker) {
		return "SZSE"
	}
	if reSSEExchange.MatchString(ticker) {
		return "SSE"
	}
	return "US"
}
