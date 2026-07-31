// Package providerutil 提供 data-fetcher 各数据源 provider 共享的类型转换工具。
package providerutil

import (
	"strconv"
	"strings"
	"time"
)

// DateToUnix 将 "2006-01-02" 日期字符串转换为 Unix 秒时间戳。
func DateToUnix(dateStr string) (int64, error) {
	t, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return 0, err
	}
	return t.Unix(), nil
}

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
func ToFloat64Safe(arr []interface{}, idx int) float64 {
	if idx >= len(arr) || arr[idx] == nil {
		return 0
	}
	return ToFloat64(arr[idx])
}
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
