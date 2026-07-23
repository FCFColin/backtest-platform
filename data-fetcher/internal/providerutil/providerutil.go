// Package providerutil 提供 data-fetcher 各数据源 provider 共享的类型转换工具。
//
// 企业理由：yfinance / twelvedata / akshare 三个 provider 各自维护 strconv
// 转换副本（interface{}→float64/int64、string→float64/int64），行为略有差异
// （akshare 不 TrimSpace、twelvedata 用 ParseFloat→int64 而 akshare 用 ParseInt）。
// 本包收口为单一实现，消除三处副本的行为漂移风险。
package providerutil

import (
	"strconv"
	"strings"
)

// ToFloat64 将 interface{} 转换为 float64，支持 float64 与 string 类型。
// nil 或不可识别类型返回 0。收口自 yfinance.toFloat64。
func ToFloat64(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case string:
		f, _ := strconv.ParseFloat(val, 64)
		return f
	default:
		return 0
	}
}

// ToFloat64Safe 安全地从 interface{} 切片指定索引取 float64。
// 越界或 nil 元素返回 0。收口自 yfinance.toFloat64Safe。
func ToFloat64Safe(arr []interface{}, idx int) float64 {
	if idx >= len(arr) || arr[idx] == nil {
		return 0
	}
	return ToFloat64(arr[idx])
}

// ToInt64Safe 安全地从 interface{} 切片指定索引取 int64。
// 支持 float64（截断）与 string（ParseInt），越界或 nil 返回 0。
// 收口自 yfinance.toInt64Safe。
func ToInt64Safe(arr []interface{}, idx int) int64 {
	if idx >= len(arr) || arr[idx] == nil {
		return 0
	}
	switch val := arr[idx].(type) {
	case float64:
		return int64(val)
	case string:
		n, _ := strconv.ParseInt(val, 10, 64)
		return n
	default:
		return 0
	}
}

// ParseStringFloat 将字符串转换为 float64，先 TrimSpace 再 ParseFloat。
// 空字符串或解析失败返回 0。统一 twelvedata.parseTwelveFloat 与 akshare.parseFloat。
func ParseStringFloat(s string) float64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return f
}

// ParseStringInt 将字符串转换为 int64，先 TrimSpace 再 ParseFloat 截断。
// 空字符串或解析失败返回 0。统一 twelvedata.parseTwelveInt 与 akshare.parseInt64。
func ParseStringInt(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return int64(f)
}
