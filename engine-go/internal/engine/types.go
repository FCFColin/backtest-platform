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
//
// UNIT conventions:
//   - decimal ratio (e.g. 0.05 = 5%): cagr, mwrr, stdev, maxDrawdown, avgDrawdown,
//     bestYear, worstYear, avgYear, totalReturn, maxMonthlyReturn, minMonthlyReturn,
//     maxDailyReturn, minDailyReturn, maxAnnualReturn, minAnnualReturn,
//     alpha, rSquared, trackingError, informationRatio, upsideCapture, downsideCapture,
//     pctPositiveDays, pctPositiveMonths, pctPositiveYears, avgAnnualReturn, avgMonthlyReturn,
//     avgDailyReturn, stdevAnnual, stdevMonthly, stdevMonthlyRaw, stdevDaily, stdevDailyRaw,
//     downsideDeviation*, drawdownRecoveryFactor, m2, treynor,
//     benchmarkCorrelation, upsideCorrelation, downsideCorrelation,
//     alphaDaily, alphaAnnualized, upsideCapture*, downsideCapture*, captureSpread*,
//     activeReturn, var*, cvar*, skewness*, excessKurtosis*, winRate*,
//     avgDailyGain, avgDailyLoss, avgMonthlyGain, avgMonthlyLoss, avgAnnualGain, avgAnnualLoss,
//     swr*, pwr*
//   - dimensionless ratio (no unit): sharpe, sortino, calmar, ulcerPerformanceIndex,
//     ulcerIndex, beta, upsideBeta, downsideBeta, diversificationRatio, gainLossRatio*
//   - days (int): maxDrawdownDuration
type Statistics struct {
	CAGR                  float64             `json:"cagr"`                  // UNIT: decimal ratio (0.05 = 5%)
	MWRR                  float64             `json:"mwrr"`                  // UNIT: decimal ratio (0.05 = 5%)
	Stdev                 float64             `json:"stdev"`                 // UNIT: decimal ratio (0.05 = 5%)
	Sharpe                float64             `json:"sharpe"`                // UNIT: dimensionless
	Sortino               float64             `json:"sortino"`               // UNIT: dimensionless
	MaxDrawdown           float64             `json:"maxDrawdown"`           // UNIT: decimal ratio, negative (e.g. -0.22 = -22%)
	MaxDrawdownDuration   int                 `json:"maxDrawdownDuration"`   // UNIT: days
	BestYear              float64             `json:"bestYear"`              // UNIT: decimal ratio (0.05 = 5%)
	WorstYear             float64             `json:"worstYear"`             // UNIT: decimal ratio (0.05 = 5%)
	AvgYear               float64             `json:"avgYear"`               // UNIT: decimal ratio (0.05 = 5%)
	TotalReturn           float64             `json:"totalReturn"`           // UNIT: decimal ratio (0.05 = 5%)
	MaxMonthlyReturn      float64             `json:"maxMonthlyReturn"`      // UNIT: decimal ratio (0.05 = 5%)
	MinMonthlyReturn      float64             `json:"minMonthlyReturn"`      // UNIT: decimal ratio (0.05 = 5%)
	AvgDrawdown           float64             `json:"avgDrawdown"`           // UNIT: decimal ratio, negative (e.g. -0.10 = -10%)
	UlcerIndex            float64             `json:"ulcerIndex"`            // UNIT: dimensionless
	Calmar                float64             `json:"calmar"`                // UNIT: dimensionless
	UlcerPerformanceIndex float64             `json:"ulcerPerformanceIndex"` // UNIT: dimensionless
	Beta                  float64             `json:"beta"`                  // UNIT: dimensionless
	Alpha                 float64             `json:"alpha"`                 // UNIT: decimal ratio (0.05 = 5%)
	RSquared              float64             `json:"rSquared"`              // UNIT: dimensionless [0, 1]
	TrackingError         float64             `json:"trackingError"`         // UNIT: decimal ratio (0.05 = 5%)
	InformationRatio      float64             `json:"informationRatio"`      // UNIT: dimensionless
	UpsideCapture         float64             `json:"upsideCapture"`         // UNIT: decimal ratio (1.0 = 100%)
	DownsideCapture       float64             `json:"downsideCapture"`       // UNIT: decimal ratio (1.0 = 100%)
	MaxDailyReturn        float64             `json:"maxDailyReturn"`        // UNIT: decimal ratio (0.05 = 5%)
	MinDailyReturn        float64             `json:"minDailyReturn"`        // UNIT: decimal ratio (0.05 = 5%)
	PWR                   float64             `json:"pwr"`                   // UNIT: decimal ratio (0.05 = 5%)
	Var                   VaRByFrequency      `json:"var"`                   // UNIT: decimal ratio (0.05 = 5%)
	Cvar                  VaRByFrequency      `json:"cvar"`                  // UNIT: decimal ratio (0.05 = 5%)
	Skewness              SkewnessByFrequency `json:"skewness"`             // UNIT: dimensionless
	ExcessKurtosis        SkewnessByFrequency `json:"excessKurtosis"`       // UNIT: dimensionless
	WinRate               SkewnessByFrequency `json:"winRate"`              // UNIT: decimal ratio (0.5 = 50%)
	PctPositiveDays       float64             `json:"pctPositiveDays"`       // UNIT: decimal ratio (0.5 = 50%)

	AvgAnnualReturn       float64 `json:"avgAnnualReturn"`       // UNIT: decimal ratio (0.05 = 5%)
	AvgMonthlyReturn      float64 `json:"avgMonthlyReturn"`      // UNIT: decimal ratio (0.05 = 5%)
	AvgDailyReturn        float64 `json:"avgDailyReturn"`        // UNIT: decimal ratio (0.05 = 5%)
	StdevAnnual           float64 `json:"stdevAnnual"`           // UNIT: decimal ratio (0.05 = 5%)
	StdevMonthly          float64 `json:"stdevMonthly"`          // UNIT: decimal ratio (0.05 = 5%)
	StdevMonthlyRaw       float64 `json:"stdevMonthlyRaw"`       // UNIT: decimal ratio (0.05 = 5%)
	StdevDaily            float64 `json:"stdevDaily"`            // UNIT: decimal ratio (0.05 = 5%)
	StdevDailyRaw         float64 `json:"stdevDailyRaw"`         // UNIT: decimal ratio (0.05 = 5%)
	DownsideDeviation     float64 `json:"downsideDeviation"`     // UNIT: decimal ratio (0.05 = 5%)
	DownsideDeviationDailyRaw float64 `json:"downsideDeviationDailyRaw"` // UNIT: decimal ratio (0.05 = 5%)
	DownsideDeviationMonthly float64 `json:"downsideDeviationMonthly"`   // UNIT: decimal ratio (0.05 = 5%)
	DownsideDeviationMonthlyRaw float64 `json:"downsideDeviationMonthlyRaw"` // UNIT: decimal ratio (0.05 = 5%)
	DownsideDeviationAnnual float64 `json:"downsideDeviationAnnual"`     // UNIT: decimal ratio (0.05 = 5%)
	DrawdownRecoveryFactor float64 `json:"drawdownRecoveryFactor"`      // UNIT: dimensionless
	M2                    float64 `json:"m2"`                    // UNIT: decimal ratio (0.05 = 5%)
	Treynor               float64 `json:"treynor"`               // UNIT: decimal ratio (0.05 = 5%)
	DiversificationRatio  float64 `json:"diversificationRatio"`  // UNIT: dimensionless
	BenchmarkCorrelation  float64 `json:"benchmarkCorrelation"`  // UNIT: dimensionless [-1, 1]
	UpsideCorrelation     float64 `json:"upsideCorrelation"`     // UNIT: dimensionless [-1, 1]
	DownsideCorrelation   float64 `json:"downsideCorrelation"`   // UNIT: dimensionless [-1, 1]
	UpsideBeta            float64 `json:"upsideBeta"`            // UNIT: dimensionless
	DownsideBeta          float64 `json:"downsideBeta"`          // UNIT: dimensionless
	AlphaDaily            float64 `json:"alphaDaily"`            // UNIT: decimal ratio (0.05 = 5%)
	AlphaAnnualized       float64 `json:"alphaAnnualized"`       // UNIT: decimal ratio (0.05 = 5%)
	UpsideCaptureDaily    float64 `json:"upsideCaptureDaily"`    // UNIT: decimal ratio (1.0 = 100%)
	DownsideCaptureDaily  float64 `json:"downsideCaptureDaily"`  // UNIT: decimal ratio (1.0 = 100%)
	CaptureSpreadDaily    float64 `json:"captureSpreadDaily"`    // UNIT: decimal ratio (1.0 = 100%)
	UpsideCaptureAnnual   float64 `json:"upsideCaptureAnnual"`   // UNIT: decimal ratio (1.0 = 100%)
	DownsideCaptureAnnual float64 `json:"downsideCaptureAnnual"` // UNIT: decimal ratio (1.0 = 100%)
	CaptureSpreadAnnual   float64 `json:"captureSpreadAnnual"`   // UNIT: decimal ratio (1.0 = 100%)
	CaptureSpread         float64 `json:"captureSpread"`         // UNIT: decimal ratio (1.0 = 100%)
	ActiveReturn          float64 `json:"activeReturn"`          // UNIT: decimal ratio (0.05 = 5%)
	VarDaily1             float64 `json:"varDaily1"`             // UNIT: decimal ratio (0.05 = 5%)
	VarDaily5             float64 `json:"varDaily5"`             // UNIT: decimal ratio (0.05 = 5%)
	VarDaily10            float64 `json:"varDaily10"`            // UNIT: decimal ratio (0.05 = 5%)
	CvarDaily1            float64 `json:"cvarDaily1"`            // UNIT: decimal ratio (0.05 = 5%)
	CvarDaily5            float64 `json:"cvarDaily5"`            // UNIT: decimal ratio (0.05 = 5%)
	CvarDaily10           float64 `json:"cvarDaily10"`           // UNIT: decimal ratio (0.05 = 5%)
	VarMonthly1           float64 `json:"varMonthly1"`           // UNIT: decimal ratio (0.05 = 5%)
	VarMonthly5           float64 `json:"varMonthly5"`           // UNIT: decimal ratio (0.05 = 5%)
	VarMonthly10          float64 `json:"varMonthly10"`          // UNIT: decimal ratio (0.05 = 5%)
	CvarMonthly1          float64 `json:"cvarMonthly1"`          // UNIT: decimal ratio (0.05 = 5%)
	CvarMonthly5          float64 `json:"cvarMonthly5"`          // UNIT: decimal ratio (0.05 = 5%)
	CvarMonthly10         float64 `json:"cvarMonthly10"`         // UNIT: decimal ratio (0.05 = 5%)
	VarAnnual1            float64 `json:"varAnnual1"`            // UNIT: decimal ratio (0.05 = 5%)
	VarAnnual5            float64 `json:"varAnnual5"`            // UNIT: decimal ratio (0.05 = 5%)
	VarAnnual10           float64 `json:"varAnnual10"`           // UNIT: decimal ratio (0.05 = 5%)
	CvarAnnual1           float64 `json:"cvarAnnual1"`           // UNIT: decimal ratio (0.05 = 5%)
	CvarAnnual5           float64 `json:"cvarAnnual5"`           // UNIT: decimal ratio (0.05 = 5%)
	CvarAnnual10          float64 `json:"cvarAnnual10"`          // UNIT: decimal ratio (0.05 = 5%)
	SkewnessDaily         float64 `json:"skewnessDaily"`         // UNIT: dimensionless
	SkewnessMonthly       float64 `json:"skewnessMonthly"`       // UNIT: dimensionless
	SkewnessAnnual        float64 `json:"skewnessAnnual"`        // UNIT: dimensionless
	ExcessKurtosisDaily   float64 `json:"excessKurtosisDaily"`   // UNIT: dimensionless
	ExcessKurtosisMonthly float64 `json:"excessKurtosisMonthly"` // UNIT: dimensionless
	ExcessKurtosisAnnual  float64 `json:"excessKurtosisAnnual"`  // UNIT: dimensionless
	PctPositiveMonths     float64 `json:"pctPositiveMonths"`     // UNIT: decimal ratio (0.5 = 50%)
	PctPositiveYears      float64 `json:"pctPositiveYears"`      // UNIT: decimal ratio (0.5 = 50%)
	MaxAnnualReturn       float64 `json:"maxAnnualReturn"`       // UNIT: decimal ratio (0.05 = 5%)
	MinAnnualReturn       float64 `json:"minAnnualReturn"`       // UNIT: decimal ratio (0.05 = 5%)
	AvgDailyGain          float64 `json:"avgDailyGain"`          // UNIT: decimal ratio (0.05 = 5%)
	AvgDailyLoss          float64 `json:"avgDailyLoss"`          // UNIT: decimal ratio (0.05 = 5%)
	GainLossRatioDaily    float64 `json:"gainLossRatioDaily"`    // UNIT: dimensionless
	AvgMonthlyGain        float64 `json:"avgMonthlyGain"`        // UNIT: decimal ratio (0.05 = 5%)
	AvgMonthlyLoss        float64 `json:"avgMonthlyLoss"`        // UNIT: decimal ratio (0.05 = 5%)
	GainLossRatioMonthly  float64 `json:"gainLossRatioMonthly"`  // UNIT: dimensionless
	AvgAnnualGain         float64 `json:"avgAnnualGain"`         // UNIT: decimal ratio (0.05 = 5%)
	AvgAnnualLoss         float64 `json:"avgAnnualLoss"`         // UNIT: decimal ratio (0.05 = 5%)
	GainLossRatioAnnual   float64 `json:"gainLossRatioAnnual"`   // UNIT: dimensionless
	SWR                   float64 `json:"swr"`                   // UNIT: decimal ratio (0.05 = 5%)
	SWR10Y                float64 `json:"swr10y"`                // UNIT: decimal ratio (0.05 = 5%)
	PWR10Y                float64 `json:"pwr10y"`                // UNIT: decimal ratio (0.05 = 5%)
	SWR20Y                float64 `json:"swr20y"`                // UNIT: decimal ratio (0.05 = 5%)
	PWR20Y                float64 `json:"pwr20y"`                // UNIT: decimal ratio (0.05 = 5%)
	SWR30Y                float64 `json:"swr30y"`                // UNIT: decimal ratio (0.05 = 5%)
	PWR30Y                float64 `json:"pwr30y"`                // UNIT: decimal ratio (0.05 = 5%)
	SWR40Y                float64 `json:"swr40y"`                // UNIT: decimal ratio (0.05 = 5%)
	PWR40Y                float64 `json:"pwr40y"`                // UNIT: decimal ratio (0.05 = 5%)
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
//
// UNIT conventions:
//   - date string (YYYY-MM-DD): peakDate, troughDate, recoveryDate
//   - decimal ratio (negative): depth, returnFromPeakToTrough, returnFromTroughToRecovery,
//     cagrDuring
//   - days (int): timeToTrough, recoveryTime, totalTimeDurationDays
//   - dimensionless: recoveryFactor, ulcerDuring
//
// recoveryDate 为空时表示回测结束时该回撤尚未恢复。
// 字段 totalTimeDurationDays 明确标注单位为天，避免前端误当作年处理。
type DrawdownEpisode struct {
	PeakDate                   string   `json:"peakDate"`
	TroughDate                 string   `json:"troughDate"`
	RecoveryDate               string   `json:"recoveryDate,omitempty"`
	Depth                      float64  `json:"depth"`
	TimeToTrough               int      `json:"timeToTrough,omitempty"`
	RecoveryTime               int      `json:"recoveryTime,omitempty"`
	TotalTimeDurationDays      int      `json:"totalTimeDurationDays"`
	RecoveryFactor             float64  `json:"recoveryFactor,omitempty"`
	CagrDuring                 float64  `json:"cagrDuring,omitempty"`
	UlcerDuring                float64  `json:"ulcerDuring,omitempty"`
	ReturnFromPeakToTrough     float64  `json:"returnFromPeakToTrough,omitempty"`
	ReturnFromTroughToRecovery *float64 `json:"returnFromTroughToRecovery,omitempty"`
}

// tradingDays 年交易日数常量。
const tradingDays = 252
