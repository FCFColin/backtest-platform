package montecarlo

import "engine-go/internal/engine"

type MonteCarloRequest struct {
	Portfolio MCPortfolioInput `json:"portfolio"`
	PriceData PriceDataMap     `json:"priceData"`
	Params    MCBacktestParams `json:"params"`
	MCParams  MCSimParams      `json:"mcParams"`
}
type MCPortfolioInput struct {
	Name               string       `json:"name"`
	Assets             []AssetInput `json:"assets"`
	RebalanceFrequency string       `json:"rebalanceFrequency"`
	Drag               float64      `json:"drag"`
	TotalReturn        bool         `json:"totalReturn"`
}
type AssetInput struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}
type PriceDataMap = engine.PriceDataMap
type MCBacktestParams struct {
	StartDate           string  `json:"startDate"`
	EndDate             string  `json:"endDate"`
	StartingValue       float64 `json:"startingValue"`
	AdjustForInflation  bool    `json:"adjustForInflation"`
	RollingWindowMonths int     `json:"rollingWindowMonths"`
	BenchmarkTicker     string  `json:"benchmarkTicker"`
}
type MCSimParams struct {
	NumSimulations   int     `json:"numSimulations"`
	NumYears         int     `json:"numYears"`
	MinBlockYears    int     `json:"minBlockYears"`
	MaxBlockYears    int     `json:"maxBlockYears"`
	SuccessThreshold float64 `json:"successThreshold"`
	Seed             *int64  `json:"seed"` // 固定种子使模拟可复现；nil 时随机
}
type MonteCarloResult struct {
	Percentiles          MCPercentiles          `json:"percentiles"`
	SuccessProbability   []float64              `json:"successProbability"`
	FinalDistribution    []float64              `json:"finalDistribution"`
	Statistics           MCStatistics           `json:"statistics"`
	PerPathMetrics       []PathMetrics          `json:"perPathMetrics"`
	RepresentativePaths  MCRepresentativePaths  `json:"representativePaths"`
	SuccessProbabilities MCSuccessProbabilities `json:"successProbabilities"`
}
type MCPercentiles struct {
	P5  []float64 `json:"p5"`
	P10 []float64 `json:"p10"`
	P25 []float64 `json:"p25"`
	P50 []float64 `json:"p50"`
	P75 []float64 `json:"p75"`
	P90 []float64 `json:"p90"`
	P95 []float64 `json:"p95"`
}
type MCStatistics struct {
	MedianFinalValue float64 `json:"medianFinalValue"`
	MeanFinalValue   float64 `json:"meanFinalValue"`
	SuccessRate      float64 `json:"successRate"`
}
type PathMetrics struct {
	FinalValue  float64 `json:"finalValue"`
	CAGR        float64 `json:"cagr"`
	MaxDrawdown float64 `json:"maxDrawdown"`
	Volatility  float64 `json:"volatility"`
	Sharpe      float64 `json:"sharpe"`
	Sortino     float64 `json:"sortino"`
}
type MCRepresentativePaths struct {
	Best   []float64 `json:"best"`
	P25    []float64 `json:"p25"`
	Median []float64 `json:"median"`
	P75    []float64 `json:"p75"`
	Worst  []float64 `json:"worst"`
}
type MCSuccessProbabilities struct {
	Survival            []float64 `json:"survival"`
	CapitalPreservation []float64 `json:"capitalPreservation"`
	Profit              []float64 `json:"profit"`
}
