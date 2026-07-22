// Package engine 提供回测引擎的共享类型和统计计算函数。
package engine

import "engine-go/internal/engineutil"

// DataPoint 表示时间序列上的一个数据点（日期 + 值）。
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

// VaRLevels 表示不同置信水平（1%/5%/10%）的 VaR 或 CVaR 值。
type VaRLevels struct {
	One  float64 `json:"1"`
	Five float64 `json:"5"`
	Ten  float64 `json:"10"`
}

// VaRByFrequency 表示按频率（日/月/年）分组的 VaR 或 CVaR。
type VaRByFrequency struct {
	Daily   VaRLevels `json:"daily"`
	Monthly VaRLevels `json:"monthly"`
	Annual  VaRLevels `json:"annual"`
}

// SkewnessByFrequency 表示按频率分组的偏度/超额峰度/胜率。
type SkewnessByFrequency struct {
	Daily   float64 `json:"daily"`
	Monthly float64 `json:"monthly"`
	Annual  float64 `json:"annual"`
}

// Statistics 包含资产/组合的统计指标子集。
// 与 packages/shared/types/statistics.ts 的 Statistics interface 保持字段名一致，
// JSON 序列化后可直接被前端消费，字段名无需额外映射层。
// 字段一致性由 types_test.go 的 TestStatisticsJSONTags 守护。
type Statistics struct {
	CAGR                  float64             `json:"cagr"`
	MWRR                  float64             `json:"mwrr"`
	Stdev                 float64             `json:"stdev"`
	Sharpe                float64             `json:"sharpe"`
	Sortino               float64             `json:"sortino"`
	MaxDrawdown           float64             `json:"maxDrawdown"`
	MaxDrawdownDuration   int                 `json:"maxDrawdownDuration"`
	BestYear              float64             `json:"bestYear"`
	WorstYear             float64             `json:"worstYear"`
	AvgYear               float64             `json:"avgYear"`
	TotalReturn           float64             `json:"totalReturn"`
	MaxMonthlyReturn      float64             `json:"maxMonthlyReturn"`
	MinMonthlyReturn      float64             `json:"minMonthlyReturn"`
	AvgDrawdown           float64             `json:"avgDrawdown"`
	UlcerIndex            float64             `json:"ulcerIndex"`
	Calmar                float64             `json:"calmar"`
	UlcerPerformanceIndex float64             `json:"ulcerPerformanceIndex"`
	Beta                  float64             `json:"beta"`
	Alpha                 float64             `json:"alpha"`
	RSquared              float64             `json:"rSquared"`
	TrackingError         float64             `json:"trackingError"`
	InformationRatio      float64             `json:"informationRatio"`
	UpsideCapture         float64             `json:"upsideCapture"`
	DownsideCapture       float64             `json:"downsideCapture"`
	MaxDailyReturn        float64             `json:"maxDailyReturn"`
	MinDailyReturn        float64             `json:"minDailyReturn"`
	PWR                   float64             `json:"pwr"`
	Var                   VaRByFrequency      `json:"var"`
	Cvar                  VaRByFrequency      `json:"cvar"`
	Skewness              SkewnessByFrequency `json:"skewness"`
	ExcessKurtosis        SkewnessByFrequency `json:"excessKurtosis"`
	WinRate               SkewnessByFrequency `json:"winRate"`
	PctPositiveDays       float64             `json:"pctPositiveDays"`

	AvgAnnualReturn       float64 `json:"avgAnnualReturn"`
	AvgMonthlyReturn      float64 `json:"avgMonthlyReturn"`
	AvgDailyReturn        float64 `json:"avgDailyReturn"`
	StdevAnnual           float64 `json:"stdevAnnual"`
	StdevMonthly          float64 `json:"stdevMonthly"`
	StdevMonthlyRaw       float64 `json:"stdevMonthlyRaw"`
	StdevDaily            float64 `json:"stdevDaily"`
	StdevDailyRaw         float64 `json:"stdevDailyRaw"`
	DownsideDeviation     float64 `json:"downsideDeviation"`
	DownsideDeviationDailyRaw float64 `json:"downsideDeviationDailyRaw"`
	DownsideDeviationMonthly float64 `json:"downsideDeviationMonthly"`
	DownsideDeviationMonthlyRaw float64 `json:"downsideDeviationMonthlyRaw"`
	DownsideDeviationAnnual float64 `json:"downsideDeviationAnnual"`
	DrawdownRecoveryFactor float64 `json:"drawdownRecoveryFactor"`
	M2                    float64 `json:"m2"`
	Treynor               float64 `json:"treynor"`
	DiversificationRatio  float64 `json:"diversificationRatio"`
	BenchmarkCorrelation  float64 `json:"benchmarkCorrelation"`
	UpsideCorrelation     float64 `json:"upsideCorrelation"`
	DownsideCorrelation   float64 `json:"downsideCorrelation"`
	UpsideBeta            float64 `json:"upsideBeta"`
	DownsideBeta          float64 `json:"downsideBeta"`
	AlphaDaily            float64 `json:"alphaDaily"`
	AlphaAnnualized       float64 `json:"alphaAnnualized"`
	UpsideCaptureDaily    float64 `json:"upsideCaptureDaily"`
	DownsideCaptureDaily  float64 `json:"downsideCaptureDaily"`
	CaptureSpreadDaily    float64 `json:"captureSpreadDaily"`
	UpsideCaptureAnnual   float64 `json:"upsideCaptureAnnual"`
	DownsideCaptureAnnual float64 `json:"downsideCaptureAnnual"`
	CaptureSpreadAnnual   float64 `json:"captureSpreadAnnual"`
	CaptureSpread         float64 `json:"captureSpread"`
	ActiveReturn          float64 `json:"activeReturn"`
	VarDaily1             float64 `json:"varDaily1"`
	VarDaily5             float64 `json:"varDaily5"`
	VarDaily10            float64 `json:"varDaily10"`
	CvarDaily1            float64 `json:"cvarDaily1"`
	CvarDaily5            float64 `json:"cvarDaily5"`
	CvarDaily10           float64 `json:"cvarDaily10"`
	VarMonthly1           float64 `json:"varMonthly1"`
	VarMonthly5           float64 `json:"varMonthly5"`
	VarMonthly10          float64 `json:"varMonthly10"`
	CvarMonthly1          float64 `json:"cvarMonthly1"`
	CvarMonthly5          float64 `json:"cvarMonthly5"`
	CvarMonthly10         float64 `json:"cvarMonthly10"`
	VarAnnual1            float64 `json:"varAnnual1"`
	VarAnnual5            float64 `json:"varAnnual5"`
	VarAnnual10           float64 `json:"varAnnual10"`
	CvarAnnual1           float64 `json:"cvarAnnual1"`
	CvarAnnual5           float64 `json:"cvarAnnual5"`
	CvarAnnual10          float64 `json:"cvarAnnual10"`
	SkewnessDaily         float64 `json:"skewnessDaily"`
	SkewnessMonthly       float64 `json:"skewnessMonthly"`
	SkewnessAnnual        float64 `json:"skewnessAnnual"`
	ExcessKurtosisDaily   float64 `json:"excessKurtosisDaily"`
	ExcessKurtosisMonthly float64 `json:"excessKurtosisMonthly"`
	ExcessKurtosisAnnual  float64 `json:"excessKurtosisAnnual"`
	PctPositiveMonths     float64 `json:"pctPositiveMonths"`
	PctPositiveYears      float64 `json:"pctPositiveYears"`
	MaxAnnualReturn       float64 `json:"maxAnnualReturn"`
	MinAnnualReturn       float64 `json:"minAnnualReturn"`
	AvgDailyGain          float64 `json:"avgDailyGain"`
	AvgDailyLoss          float64 `json:"avgDailyLoss"`
	GainLossRatioDaily    float64 `json:"gainLossRatioDaily"`
	AvgMonthlyGain        float64 `json:"avgMonthlyGain"`
	AvgMonthlyLoss        float64 `json:"avgMonthlyLoss"`
	GainLossRatioMonthly  float64 `json:"gainLossRatioMonthly"`
	AvgAnnualGain         float64 `json:"avgAnnualGain"`
	AvgAnnualLoss         float64 `json:"avgAnnualLoss"`
	GainLossRatioAnnual   float64 `json:"gainLossRatioAnnual"`
	SWR                   float64 `json:"swr"`
	SWR10Y                float64 `json:"swr10y"`
	PWR10Y                float64 `json:"pwr10y"`
	SWR20Y                float64 `json:"swr20y"`
	PWR20Y                float64 `json:"pwr20y"`
	SWR30Y                float64 `json:"swr30y"`
	PWR30Y                float64 `json:"pwr30y"`
	SWR40Y                float64 `json:"swr40y"`
	PWR40Y                float64 `json:"pwr40y"`
}

// ============================================================
// 回测相关类型（backtest.go 使用）
// ============================================================

// PriceDataMap 价格数据：ticker -> date -> price。
// 企业理由：统一价格数据格式，供 backtest/analysis/montecarlo 复用。
type PriceDataMap map[string]map[string]float64

// BacktestRequest 回测请求。
type BacktestRequest struct {
	Portfolios    []PortfolioInput   `json:"portfolios"`
	PriceData     PriceDataMap       `json:"priceData"`
	CPIData       map[string]float64 `json:"cpiData"`
	ExchangeRates map[string]float64 `json:"exchangeRates"`
	Params        BacktestParams     `json:"params"`
	Fingerprint   bool               `json:"fingerprint"`
}

// BacktestParams 回测参数。
type BacktestParams struct {
	StartDate               string            `json:"startDate"`
	EndDate                 string            `json:"endDate"`
	StartingValue           float64           `json:"startingValue"`
	BaseCurrency            string            `json:"baseCurrency,omitempty"`
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

// RebalanceBands 再平衡偏离带配置，与 packages/shared/types/portfolio.ts 的 RebalanceBands 对齐。
// 类型别名指向 engineutil.RebalanceBands（spec Wave 4 Task 4.1：偏离带判定逻辑
// 已收口到 engineutil 叶子包，避免 engine 与 tactical 各维护副本）。
type RebalanceBands = engineutil.RebalanceBands

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
	Name              string            `json:"name"`
	GrowthCurve       []DataPoint       `json:"growthCurve"`
	DrawdownCurve     []DrawdownPoint   `json:"drawdownCurve"`
	RollingReturns    []DataPoint       `json:"rollingReturns"`
	AnnualReturns     []AnnualReturn    `json:"annualReturns"`
	MonthlyReturns    []MonthlyReturn   `json:"monthlyReturns"`
	Statistics        Statistics        `json:"statistics"`
	DrawdownEpisodes  []DrawdownEpisode `json:"drawdownEpisodes"`
	AllocationHistory []AllocationPoint `json:"allocationHistory"`
}

// AllocationPoint 资产配置记录。
type AllocationPoint struct {
	Date    string    `json:"date"`
	Weights []float64 `json:"weights"`
}

// DrawdownEpisode 回撤事件，与 packages/shared/types/backtest.ts 的 DrawdownEpisode 对齐。
// Go 引擎当前仅计算 depth（回撤深度）与 totalTime（总持续时间，天），
// 其余字段（timeToTrough/recoveryTime/recoveryFactor/cagrDuring/ulcerDuring/
// returnFromPeakToTrough/returnFromTroughToRecovery）暂未实现，以 omitted 形式输出。
type DrawdownEpisode struct {
	PeakDate                   string   `json:"peakDate"`
	TroughDate                 string   `json:"troughDate"`
	RecoveryDate               string   `json:"recoveryDate,omitempty"`
	Depth                      float64  `json:"depth"`
	TimeToTrough               int      `json:"timeToTrough,omitempty"`
	RecoveryTime               int      `json:"recoveryTime,omitempty"`
	TotalTime                  int      `json:"totalTime"`
	RecoveryFactor             float64  `json:"recoveryFactor,omitempty"`
	CagrDuring                 float64  `json:"cagrDuring,omitempty"`
	UlcerDuring                float64  `json:"ulcerDuring,omitempty"`
	ReturnFromPeakToTrough     float64  `json:"returnFromPeakToTrough,omitempty"`
	ReturnFromTroughToRecovery *float64 `json:"returnFromTroughToRecovery,omitempty"`
}

// tradingDays 年交易日数常量。
const tradingDays = 252
