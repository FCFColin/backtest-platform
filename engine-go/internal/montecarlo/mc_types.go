package montecarlo

import (
	"engine-go/internal/engine"
)

// ============================================================
// 请求类型
// ============================================================

// MonteCarloRequest 蒙特卡洛模拟请求
//
// 企业理由：请求结构体与前端 TypeScript 接口一一对应，
// 所有 JSON 字段使用 camelCase，确保前后端数据契约一致。
type MonteCarloRequest struct {
	Portfolio MCPortfolioInput `json:"portfolio"`
	PriceData PriceDataMap     `json:"priceData"`
	Params    MCBacktestParams `json:"params"`
	MCParams  MCSimParams      `json:"mcParams"`
}

// MCPortfolioInput 蒙特卡洛组合输入
type MCPortfolioInput struct {
	Name               string       `json:"name"`
	Assets             []AssetInput `json:"assets"`
	RebalanceFrequency string       `json:"rebalanceFrequency"`
	Drag               float64      `json:"drag"`
	TotalReturn        bool         `json:"totalReturn"`
}

// AssetInput 单个资产输入
type AssetInput struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}

// PriceDataMap 价格数据：ticker -> date -> price（复用 engine 包类型）
type PriceDataMap = engine.PriceDataMap

// MCBacktestParams 蒙特卡洛基础参数
type MCBacktestParams struct {
	StartDate           string  `json:"startDate"`
	EndDate             string  `json:"endDate"`
	StartingValue       float64 `json:"startingValue"`
	AdjustForInflation  bool    `json:"adjustForInflation"`
	RollingWindowMonths int     `json:"rollingWindowMonths"`
	BenchmarkTicker     string  `json:"benchmarkTicker"`
}

// MCSimParams 蒙特卡洛模拟参数
type MCSimParams struct {
	NumSimulations   int     `json:"numSimulations"`
	NumYears         int     `json:"numYears"`
	MinBlockYears    int     `json:"minBlockYears"`
	MaxBlockYears    int     `json:"maxBlockYears"`
	WithReplacement  bool    `json:"withReplacement"`
	BlockSize        int     `json:"blockSize"`
	SuccessThreshold float64 `json:"successThreshold"`
}

// ============================================================
// 响应类型
// ============================================================

// MonteCarloResult 蒙特卡洛模拟结果
type MonteCarloResult struct {
	Percentiles          MCPercentiles          `json:"percentiles"`
	SuccessProbability   []float64              `json:"successProbability"`
	FinalDistribution    []float64              `json:"finalDistribution"`
	Statistics           MCStatistics           `json:"statistics"`
	PerPathMetrics       []PathMetrics          `json:"perPathMetrics"`
	RepresentativePaths  MCRepresentativePaths  `json:"representativePaths"`
	SuccessProbabilities MCSuccessProbabilities `json:"successProbabilities"`
}

// MCPercentiles 各百分位路径
type MCPercentiles struct {
	P5  []float64 `json:"p5"`
	P10 []float64 `json:"p10"`
	P25 []float64 `json:"p25"`
	P50 []float64 `json:"p50"`
	P75 []float64 `json:"p75"`
	P90 []float64 `json:"p90"`
	P95 []float64 `json:"p95"`
}

// MCStatistics 蒙特卡洛统计摘要
type MCStatistics struct {
	MedianFinalValue float64 `json:"medianFinalValue"`
	MeanFinalValue   float64 `json:"meanFinalValue"`
	SuccessRate      float64 `json:"successRate"`
}

// PathMetrics 单条路径的指标
type PathMetrics struct {
	FinalValue  float64 `json:"finalValue"`
	CAGR        float64 `json:"cagr"`
	MaxDrawdown float64 `json:"maxDrawdown"`
	Volatility  float64 `json:"volatility"`
	Sharpe      float64 `json:"sharpe"`
	Sortino     float64 `json:"sortino"`
}

// MCRepresentativePaths 代表性路径
type MCRepresentativePaths struct {
	Best   []float64 `json:"best"`
	P25    []float64 `json:"p25"`
	Median []float64 `json:"median"`
	P75    []float64 `json:"p75"`
	Worst  []float64 `json:"worst"`
}

// MCSuccessProbabilities 三种成功概率
type MCSuccessProbabilities struct {
	Survival            []float64 `json:"survival"`
	CapitalPreservation []float64 `json:"capitalPreservation"`
	Profit              []float64 `json:"profit"`
}
