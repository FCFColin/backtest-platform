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
	UpsideCaptureDaily          float64             `json:"upsideCaptureDaily"`
	DownsideCaptureDaily        float64             `json:"downsideCaptureDaily"`
	CaptureSpreadDaily          float64             `json:"captureSpreadDaily"`
	UpsideCaptureAnnual         float64             `json:"upsideCaptureAnnual"`
	DownsideCaptureAnnual       float64             `json:"downsideCaptureAnnual"`
	CaptureSpreadAnnual         float64             `json:"captureSpreadAnnual"`
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
}
type PriceDataMap map[string]map[string]float64
type BacktestRequest struct {
	Portfolios    []PortfolioInput   `json:"portfolios"`
	PriceData     PriceDataMap       `json:"priceData"`
	CPIData       map[string]float64 `json:"cpiData"`
	ExchangeRates map[string]float64 `json:"exchangeRates"`
	Params        BacktestParams     `json:"params"`
	Fingerprint   bool               `json:"fingerprint"`
}
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
type RebalanceBands = engineutil.RebalanceBands
type CashflowLeg struct {
	Amount    float64 `json:"amount"`
	Type      string  `json:"type"`
	Frequency string  `json:"frequency"`
	Offset    int     `json:"offset"`
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
	Fingerprint       string            `json:"fingerprint,omitempty"`
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
