// Package engine 提供回测引擎的共享类型和统计计算函数。
// 企业理由：将类型定义与统计计算集中到 engine 包，供 analysis/backtest 等子包复用，
// 避免各模块重复实现相同的金融计算逻辑，确保指标一致性。
package engine

// DataPoint 表示时间序列上的一个数据点（日期 + 值）。
// 企业理由：净值曲线和滚动收益曲线共用同一结构，减少类型冗余。
type DataPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

// DrawdownPoint 表示回撤曲线上的一个数据点。
type DrawdownPoint struct {
	Date     string  `json:"date"`
	Drawdown float64 `json:"drawdown"`
}

// AnnualReturn 表示年度收益率。
type AnnualReturn struct {
	Year   int     `json:"year"`
	Return float64 `json:"return"`
}

// MonthlyReturn 表示月度收益率。
type MonthlyReturn struct {
	Year   int     `json:"year"`
	Month  int     `json:"month"`
	Return float64 `json:"return"`
}

// RollingReturn 表示滚动窗口收益率。
type RollingReturn struct {
	Date   string  `json:"date"`
	Return float64 `json:"return"`
}

// Statistics 包含资产/组合的全部统计指标。
// 企业理由：与前端 TypeScript 类型 Statistics 保持字段一一对应，
// JSON 序列化后可直接被前端消费，无需额外映射层。
type Statistics struct {
	CAGR                   float64 `json:"cagr"`
	MWRR                   float64 `json:"mwrr"`
	Stdev                  float64 `json:"stdev"`
	Sharpe                 float64 `json:"sharpe"`
	Sortino                float64 `json:"sortino"`
	MaxDrawdown            float64 `json:"maxDrawdown"`
	MaxDrawdownDuration    int     `json:"maxDrawdownDuration"`
	BestYear               float64 `json:"bestYear"`
	WorstYear              float64 `json:"worstYear"`
	AvgYear                float64 `json:"avgYear"`
	TotalReturn            float64 `json:"totalReturn"`
	MaxMonthlyReturn       float64 `json:"maxMonthlyReturn"`
	MinMonthlyReturn       float64 `json:"minMonthlyReturn"`
	AvgDrawdown            float64 `json:"avgDrawdown"`
	UlcerIndex             float64 `json:"ulcerIndex"`
	Calmar                 float64 `json:"calmar"`
	UlcerPerformanceIndex  float64 `json:"ulcerPerformanceIndex"`
	Beta                   float64 `json:"beta"`
	Alpha                  float64 `json:"alpha"`
	RSquared               float64 `json:"rSquared"`
	TrackingError          float64 `json:"trackingError"`
	InformationRatio       float64 `json:"informationRatio"`
	UpsideCapture          float64 `json:"upsideCapture"`
	DownsideCapture        float64 `json:"downsideCapture"`
	VaR5                   float64 `json:"var5"`
	CVaR5                  float64 `json:"cvar5"`
	Skewness               float64 `json:"skewness"`
	ExcessKurtosis         float64 `json:"excessKurtosis"`
	PctPositiveDays        float64 `json:"pctPositiveDays"`
	MaxDailyReturn         float64 `json:"maxDailyReturn"`
	MinDailyReturn         float64 `json:"minDailyReturn"`
	PWR                    float64 `json:"pwr"`
}

// ============================================================
// 回测相关类型（backtest.go 使用）
// ============================================================

// PriceDataMap 价格数据：ticker -> date -> price。
// 企业理由：统一价格数据格式，供 backtest/analysis/montecarlo 复用。
type PriceDataMap map[string]map[string]float64

// BacktestRequest 回测请求。
type BacktestRequest struct {
	Portfolios    []PortfolioInput `json:"portfolios"`
	PriceData     PriceDataMap     `json:"priceData"`
	CPIData       map[string]float64 `json:"cpiData"`
	ExchangeRates map[string]float64 `json:"exchangeRates"`
	Params        BacktestParams   `json:"params"`
	Fingerprint   bool             `json:"fingerprint"`
}

// BacktestParams 回测参数。
type BacktestParams struct {
	StartDate               string            `json:"startDate"`
	EndDate                 string            `json:"endDate"`
	StartingValue           float64           `json:"startingValue"`
	AdjustForInflation      bool              `json:"adjustForInflation"`
	RollingWindowMonths     int               `json:"rollingWindowMonths"`
	BenchmarkTicker         string            `json:"benchmarkTicker"`
	ExtendedWithdrawalStats bool              `json:"extendedWithdrawalStats"`
	CashflowLegs            []CashflowLeg     `json:"cashflowLegs"`
	OneTimeCashflows        []OneTimeCashflow `json:"oneTimeCashflows"`
}

// PortfolioInput 组合输入。
type PortfolioInput struct {
	Name               string          `json:"name"`
	Assets             []AssetInput    `json:"assets"`
	RebalanceFrequency string          `json:"rebalanceFrequency"`
	RebalanceThreshold float64         `json:"rebalanceThreshold"`
	RebalanceOffset    int             `json:"rebalanceOffset"`
	Drag               float64         `json:"drag"`
	TotalReturn        bool            `json:"totalReturn"`
	RebalanceBands     *RebalanceBands `json:"rebalanceBands"`
	GlidepathToWeights []float64       `json:"glidepathToWeights"`
	GlidepathYears     int             `json:"glidepathYears"`
}

// RebalanceBands 再平衡阈值带，支持绝对/相对两种触发方式。
// 企业理由：与 Rust 引擎 RebalanceBands 对齐，确保 Go 主引擎计算结果一致。
type RebalanceBands struct {
	Absolute *float64 `json:"absolute"`
	Relative *float64 `json:"relative"`
}

// CashflowLeg 定期现金流的一条腿（leg）。
// 企业理由：支持定投/定额提取等周期性现金流，是退休提款回测的核心输入。
type CashflowLeg struct {
	Amount    float64 `json:"amount"`
	Type      string  `json:"type"`
	Frequency string  `json:"frequency"`
	Offset    int     `json:"offset"`
	Until     string  `json:"until"`
}

// OneTimeCashflow 一次性现金流，在指定日期发生。
type OneTimeCashflow struct {
	Amount float64 `json:"amount"`
	Type   string  `json:"type"`
	Date   string  `json:"date"`
}

// AssetInput 单个资产输入。
type AssetInput struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}

// BacktestResult 回测结果。
type BacktestResult struct {
	Portfolios        []PortfolioResult `json:"portfolios"`
	Correlations      [][]float64       `json:"correlations"`
	BenchmarkGrowth   []DataPoint       `json:"benchmarkGrowth"`
	AssetTickers      []string          `json:"assetTickers"`
	AssetCorrelations [][]float64       `json:"assetCorrelations"`
	Fingerprint       string            `json:"fingerprint,omitempty"`
}

// PortfolioResult 单个组合的回测结果。
type PortfolioResult struct {
	Name              string          `json:"name"`
	GrowthCurve       []DataPoint     `json:"growthCurve"`
	DrawdownCurve     []DrawdownPoint `json:"drawdownCurve"`
	RollingReturns    []DataPoint     `json:"rollingReturns"`
	AnnualReturns     []AnnualReturn  `json:"annualReturns"`
	MonthlyReturns    []MonthlyReturn `json:"monthlyReturns"`
	Statistics        Statistics      `json:"statistics"`
	DrawdownEpisodes  []DrawdownEpisode `json:"drawdownEpisodes"`
	AllocationHistory []AllocationPoint `json:"allocationHistory"`
}

// AllocationPoint 资产配置记录。
type AllocationPoint struct {
	Date    string    `json:"date"`
	Weights []float64 `json:"weights"`
}

// DrawdownEpisode 回撤事件。
type DrawdownEpisode struct {
	PeakDate     string  `json:"peakDate"`
	TroughDate   string  `json:"troughDate"`
	RecoveryDate string  `json:"recoveryDate"`
	Drawdown     float64 `json:"drawdown"`
	Duration     int     `json:"duration"`
}

// tradingDays 年交易日数常量。
const tradingDays = 252
