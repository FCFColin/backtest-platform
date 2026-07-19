// Package signal 提供信号分析功能（单信号/双信号/多信号）。
// 企业理由：将信号生成逻辑从 TS 端迁移到 Go 引擎，统一计算入口（ADR-031）。
// 算法独立实现于 Go 引擎（ADR-031），JSON 契约与 shared/types/signal.ts 对齐。
package signal

import (
	"math"
	"sort"
)

// ===== 类型定义 =====

// PricePoint 表示价格序列上的一个点。
type PricePoint struct {
	Date  string  `json:"date"`
	Price float64 `json:"price"`
}

// SignalDir 表示信号方向。
type SignalDir string

const (
	SignalBuy  SignalDir = "buy"
	SignalSell SignalDir = "sell"
)

// SignalPoint 表示一个信号点。
type SignalPoint struct {
	Date  string    `json:"date"`
	Type  SignalDir `json:"type"`
	Price float64   `json:"price"`
}

// SignalStats 表示信号统计指标。
type SignalStats struct {
	TotalSignals int     `json:"totalSignals"`
	WinRate      float64 `json:"winRate"`
	AvgReturn    float64 `json:"avgReturn"`
	MaxDrawdown  float64 `json:"maxDrawdown"`
	Sharpe       float64 `json:"sharpe"`
}

// EquityPoint 表示权益曲线上的一个点。
type EquityPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

// SignalAnalysisResult 单信号分析结果。
type SignalAnalysisResult struct {
	Signals     []SignalPoint `json:"signals"`
	Statistics  SignalStats   `json:"statistics"`
	EquityCurve []EquityPoint `json:"equityCurve"`
}

// ===== 请求类型 =====

// SignalAnalysisRequest 单信号分析请求。
type SignalAnalysisRequest struct {
	Ticker     string  `json:"ticker"`
	Indicator  string  `json:"indicator"`
	Period     int     `json:"period"`
	Threshold  float64 `json:"threshold"`
	StartDate  string  `json:"startDate"`
	EndDate    string  `json:"endDate"`
	SignalType string  `json:"signalType"`
}

// DualSignalConfig 双信号配置。
type DualSignalConfig struct {
	Signal1           SignalAnalysisRequest `json:"signal1"`
	Signal2           SignalAnalysisRequest `json:"signal2"`
	CombinationMethod string                `json:"combinationMethod"`
}

// MultiSignalConfig 多信号配置。
type MultiSignalConfig struct {
	Signals           []SignalAnalysisRequest `json:"signals"`
	AggregationMethod string                  `json:"aggregationMethod"`
	Weights           []float64               `json:"weights"`
}

// DualSignalResult 双信号分析结果。
type DualSignalResult struct {
	Signal1    SignalAnalysisResult `json:"signal1"`
	Signal2    SignalAnalysisResult `json:"signal2"`
	Combined   SignalAnalysisResult `json:"combined"`
	Comparison []ComparisonEntry    `json:"comparison"`
}

// ComparisonEntry 双信号对比条目。
type ComparisonEntry struct {
	Date     string     `json:"date"`
	Signal1  *SignalDir `json:"signal1"`
	Signal2  *SignalDir `json:"signal2"`
	Combined *SignalDir `json:"combined"`
}

// MultiSignalResult 多信号分析结果。
type MultiSignalResult struct {
	Aggregated    SignalAnalysisResult `json:"aggregated"`
	Contributions []Contribution       `json:"contributions"`
}

// Contribution 多信号贡献。
type Contribution struct {
	Index        int         `json:"index"`
	Indicator    string      `json:"indicator"`
	Contribution float64     `json:"contribution"`
	Statistics   SignalStats `json:"statistics"`
}

// ToPricePoints 将 {date: price} 映射转为 PricePoint 切片（按日期升序，过滤无效值）。
func ToPricePoints(tickerData map[string]float64) []PricePoint {
	var result []PricePoint
	for date, price := range tickerData {
		if !math.IsNaN(price) && price > 0 {
			result = append(result, PricePoint{Date: date, Price: price})
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Date < result[j].Date
	})
	return result
}
