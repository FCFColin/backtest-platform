package engine

import "engine-go/internal/engineutil"

type DataPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}
type DrawdownPoint struct {
	Date     string  `json:"date"`
	Drawdown float64 `json:"drawdown"`
}
type AnnualReturn struct {
	Year   int     `json:"year"`
	Return float64 `json:"return"`
}
type MonthlyReturn struct {
	Year   int     `json:"year"`
	Month  int     `json:"month"`
	Return float64 `json:"return"`
}
type RollingReturn struct {
	Date   string  `json:"date"`
	Return float64 `json:"return"`
}
type VaRLevels struct {
	One  float64 `json:"1"`
	Five float64 `json:"5"`
	Ten  float64 `json:"10"`
}
type VaRByFrequency struct {
	Daily   VaRLevels `json:"daily"`
	Monthly VaRLevels `json:"monthly"`
	Annual  VaRLevels `json:"annual"`
}
type SkewnessByFrequency struct {
	Daily   float64 `json:"daily"`
	Monthly float64 `json:"monthly"`
	Annual  float64 `json:"annual"`
}
type Statistics struct {
	CAGR                        float64             `json:"cagr"`
	MWRR                        float64             `json:"mwrr"`
	Stdev                       float64             `json:"stdev"`
	Sharpe                      float64             `json:"sharpe"`
	Sortino                     float64             `json:"sortino"`
	MaxDrawdown                 float64             `json:"maxDrawdown"`
	MaxDrawdownDuration         int                 `json:"maxDrawdownDuration"`
	BestYear                    float64             `json:"bestYear"`
	WorstYear                   float64             `json:"worstYear"`
	AvgYear                     float64             `json:"avgYear"`
	TotalReturn                 float64             `json:"totalReturn"`
	MaxMonthlyReturn            float64             `json:"maxMonthlyReturn"`
	MinMonthlyReturn            float64             `json:"minMonthlyReturn"`
	AvgDrawdown                 float64             `json:"avgDrawdown"`
	UlcerIndex                  float64             `json:"ulcerIndex"`
	Calmar                      float64             `json:"calmar"`
	UlcerPerformanceIndex       float64             `json:"ulcerPerformanceIndex"`
	Beta                        float64             `json:"beta"`
	Alpha                       float64             `json:"alpha"`
	RSquared                    float64             `json:"rSquared"`
	TrackingError               float64             `json:"trackingError"`
	InformationRatio            float64             `json:"informationRatio"`
	UpsideCapture               float64             `json:"upsideCapture"`
	DownsideCapture             float64             `json:"downsideCapture"`
	MaxDailyReturn              float64             `json:"maxDailyReturn"`
	MinDailyReturn              float64             `json:"minDailyReturn"`
	PWR                         float64             `json:"pwr"`
	Var                         VaRByFrequency      `json:"var"`
	Cvar                        VaRByFrequency      `json:"cvar"`
	Skewness                    SkewnessByFrequency `json:"skewness"`
	ExcessKurtosis              SkewnessByFrequency `json:"excessKurtosis"`
	WinRate                     SkewnessByFrequency `json:"winRate"`
	PctPositiveDays             float64             `json:"pctPositiveDays"`
	AvgAnnualReturn             float64             `json:"avgAnnualReturn"`
	AvgMonthlyReturn            float64             `json:"avgMonthlyReturn"`
	AvgDailyReturn              float64             `json:"avgDailyReturn"`
	StdevAnnual                 float64             `json:"stdevAnnual"`
	StdevMonthly                float64             `json:"stdevMonthly"`
	StdevMonthlyRaw             float64             `json:"stdevMonthlyRaw"`
	StdevDaily                  float64             `json:"stdevDaily"`
	StdevDailyRaw               float64             `json:"stdevDailyRaw"`
	DownsideDeviation           float64             `json:"downsideDeviation"`
	DownsideDeviationDailyRaw   float64             `json:"downsideDeviationDailyRaw"`
	DownsideDeviationMonthly    float64             `json:"downsideDeviationMonthly"`
	DownsideDeviationMonthlyRaw float64             `json:"downsideDeviationMonthlyRaw"`
	DownsideDeviationAnnual     float64             `json:"downsideDeviationAnnual"`
	DrawdownRecoveryFactor      float64             `json:"drawdownRecoveryFactor"`
	M2                          float64             `json:"m2"`
	Treynor                     float64             `json:"treynor"`
	DiversificationRatio        float64             `json:"diversificationRatio"`
	BenchmarkCorrelation        float64             `json:"benchmarkCorrelation"`
	UpsideCorrelation           float64             `json:"upsideCorrelation"`
	DownsideCorrelation         float64             `json:"downsideCorrelation"`
	UpsideBeta                  float64             `json:"upsideBeta"`
	DownsideBeta                float64             `json:"downsideBeta"`
	AlphaDaily                  float64             `json:"alphaDaily"`
	AlphaAnnualized             float64             `json:"alphaAnnualized"`
	CaptureSpread               float64             `json:"captureSpread"`
	ActiveReturn                float64             `json:"activeReturn"`
	PctPositiveMonths           float64             `json:"pctPositiveMonths"`
	PctPositiveYears            float64             `json:"pctPositiveYears"`
	MaxAnnualReturn             float64             `json:"maxAnnualReturn"`
	MinAnnualReturn             float64             `json:"minAnnualReturn"`
	AvgDailyGain                float64             `json:"avgDailyGain"`
	AvgDailyLoss                float64             `json:"avgDailyLoss"`
	GainLossRatioDaily          float64             `json:"gainLossRatioDaily"`
	AvgMonthlyGain              float64             `json:"avgMonthlyGain"`
	AvgMonthlyLoss              float64             `json:"avgMonthlyLoss"`
	GainLossRatioMonthly        float64             `json:"gainLossRatioMonthly"`
	AvgAnnualGain               float64             `json:"avgAnnualGain"`
	AvgAnnualLoss               float64             `json:"avgAnnualLoss"`
	GainLossRatioAnnual         float64             `json:"gainLossRatioAnnual"`
	SWR                         float64             `json:"swr"`
	SWR10Y                      float64             `json:"swr10y"`
	PWR10Y                      float64             `json:"pwr10y"`
	SWR20Y                      float64             `json:"swr20y"`
	PWR20Y                      float64             `json:"pwr20y"`
	SWR30Y                      float64             `json:"swr30y"`
	PWR30Y                      float64             `json:"pwr30y"`
	SWR40Y                      float64             `json:"swr40y"`
	PWR40Y                      float64             `json:"pwr40y"`
	// H-1 高级指标包
	PSR            float64 `json:"psr"`
	HurstExponent  float64 `json:"hurstExponent"`
	BurkeRatio     float64 `json:"burkeRatio"`
	MartinRatio    float64 `json:"martinRatio"`
	SterlingRatio  float64 `json:"sterlingRatio"`
	BattingAverage float64 `json:"battingAverage"`
}
type PriceDataMap map[string]map[string]float64
type BacktestRequest struct {
	Portfolios    []PortfolioInput   `json:"portfolios"`
	PriceData     PriceDataMap       `json:"priceData"`
	CPIData       map[string]float64 `json:"cpiData"`
	ExchangeRates map[string]float64 `json:"exchangeRates"`
	Params        BacktestParams     `json:"params"`
}
type BacktestParams struct {
	StartDate           string            `json:"startDate"`
	EndDate             string            `json:"endDate"`
	StartingValue       float64           `json:"startingValue"`
	AdjustForInflation  bool              `json:"adjustForInflation"`
	RollingWindowMonths int               `json:"rollingWindowMonths"`
	BenchmarkTicker     string            `json:"benchmarkTicker"`
	CashflowLegs        []CashflowLeg     `json:"cashflowLegs"`
	OneTimeCashflows    []OneTimeCashflow `json:"oneTimeCashflows"`
	// U-2 Phase 2：窗口匹配的年化无风险利率（小数）。nil/缺省 → 回退 legacy 常量 0.02，
	// 保证旧载荷与 golden 字节级零漂移；由 backend 从 FRED DGS3MO 年化后注入。
	RiskFreeRate *float64 `json:"risk_free_rate,omitempty"`
}
type PortfolioInput struct {
	Name               string          `json:"name"`
	Assets             []AssetInput    `json:"assets"`
	RebalanceFrequency string          `json:"rebalanceFrequency"`
	RebalanceThreshold float64         `json:"rebalanceThreshold"`
	RebalanceOffset    int             `json:"rebalanceOffset"`
	Drag               float64         `json:"drag"`
	RebalanceBands     *RebalanceBands `json:"rebalanceBands"`
	GlidepathToWeights []float64       `json:"glidepathToWeights"`
	GlidepathYears     int             `json:"glidepathYears"`
}
type RebalanceBands = engineutil.RebalanceBands
type CashflowLeg struct {
	Amount    float64 `json:"amount"`
	Type      string  `json:"type"`
	Frequency string  `json:"frequency"`
	Until     string  `json:"until"`
}
type OneTimeCashflow struct {
	Amount float64 `json:"amount"`
	Type   string  `json:"type"`
	Date   string  `json:"date"`
}
type AssetInput struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}
type BacktestResult struct {
	Portfolios        []PortfolioResult `json:"portfolios"`
	Correlations      [][]float64       `json:"correlations"`
	BenchmarkGrowth   []DataPoint       `json:"benchmarkGrowth"`
	AssetTickers      []string          `json:"assetTickers"`
	AssetCorrelations [][]float64       `json:"assetCorrelations"`
	// H-2：按自然季度的资产相关矩阵序列（观测 <2 的季度跳过）
	QuarterlyCorrelations []QuarterlyCorrelationMatrix `json:"quarterlyCorrelations,omitempty"`
}

// RebalanceTradeItem H-3 再平衡单资产成交明细（金额口径，+买入/−卖出）。
type RebalanceTradeItem struct {
	Ticker      string  `json:"ticker"`
	BeforeValue float64 `json:"beforeValue"`
	AfterValue  float64 `json:"afterValue"`
	DeltaValue  float64 `json:"deltaValue"`
}

// RebalanceTrade 单次再平衡事件快照。
type RebalanceTrade struct {
	Date   string               `json:"date"`
	Trades []RebalanceTradeItem `json:"trades"`
}
type QuarterlyCorrelationMatrix struct {
	Quarter string      `json:"quarter"`
	Matrix  [][]float64 `json:"matrix"`
	Tickers []string    `json:"tickers"`
}
type PortfolioResult struct {
	Name              string            `json:"name"`
	GrowthCurve       []DataPoint       `json:"growthCurve"`
	DrawdownCurve     []DrawdownPoint   `json:"drawdownCurve"`
	RollingReturns    []RollingReturn   `json:"rollingReturns"`
	AnnualReturns     []AnnualReturn    `json:"annualReturns"`
	MonthlyReturns    []MonthlyReturn   `json:"monthlyReturns"`
	Statistics        Statistics        `json:"statistics"`
	DrawdownEpisodes  []DrawdownEpisode `json:"drawdownEpisodes"`
	AllocationHistory []AllocationPoint `json:"allocationHistory"`
	// H-3：每次再平衡的逐资产买卖金额明细（观察型，不影响任何计算路径）
	RebalanceLog []RebalanceTrade `json:"rebalanceLog,omitempty"`
}
type AllocationPoint struct {
	Date    string    `json:"date"`
	Weights []float64 `json:"weights"`
}
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
