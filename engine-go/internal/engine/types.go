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
	CAGR                   float64             `json:"cagr"`
	MWRR                   float64             `json:"mwrr"`
	Stdev                  float64             `json:"stdev"`
	Sharpe                 float64             `json:"sharpe"`
	Sortino                float64             `json:"sortino"`
	MaxDrawdown            float64             `json:"maxDrawdown"`
	MaxDrawdownDuration    int                 `json:"maxDrawdownDuration"`
	BestYear               float64             `json:"bestYear"`
	WorstYear              float64             `json:"worstYear"`
	TotalReturn            float64             `json:"totalReturn"`
	MaxMonthlyReturn       float64             `json:"maxMonthlyReturn"`
	MinMonthlyReturn       float64             `json:"minMonthlyReturn"`
	AvgDrawdown            float64             `json:"avgDrawdown"`
	UlcerIndex             float64             `json:"ulcerIndex"`
	Calmar                 float64             `json:"calmar"`
	UlcerPerformanceIndex  float64             `json:"ulcerPerformanceIndex"`
	Beta                   float64             `json:"beta"`
	Alpha                  float64             `json:"alpha"`
	RSquared               float64             `json:"rSquared"`
	TrackingError          float64             `json:"trackingError"`
	InformationRatio       float64             `json:"informationRatio"`
	UpsideCapture          float64             `json:"upsideCapture"`
	DownsideCapture        float64             `json:"downsideCapture"`
	MaxDailyReturn         float64             `json:"maxDailyReturn"`
	MinDailyReturn         float64             `json:"minDailyReturn"`
	PWR                    float64             `json:"pwr"`
	Var                    VaRByFrequency      `json:"var"`
	Cvar                   VaRByFrequency      `json:"cvar"`
	Skewness               SkewnessByFrequency `json:"skewness"`
	ExcessKurtosis         SkewnessByFrequency `json:"excessKurtosis"`
	WinRate                SkewnessByFrequency `json:"winRate"`
	PctPositiveDays        float64             `json:"pctPositiveDays"`
	AvgAnnualReturn        float64             `json:"avgAnnualReturn"`
	AvgMonthlyReturn       float64             `json:"avgMonthlyReturn"`
	AvgDailyReturn         float64             `json:"avgDailyReturn"`
	StdevDaily             float64             `json:"stdevDaily"`
	DrawdownRecoveryFactor float64             `json:"drawdownRecoveryFactor"`
	DiversificationRatio   float64             `json:"diversificationRatio"`
	BenchmarkCorrelation   float64             `json:"benchmarkCorrelation"`
	UpsideCorrelation      float64             `json:"upsideCorrelation"`
	DownsideCorrelation    float64             `json:"downsideCorrelation"`
	UpsideCaptureAnnual    float64             `json:"upsideCaptureAnnual"`
	DownsideCaptureAnnual  float64             `json:"downsideCaptureAnnual"`
	PctPositiveMonths      float64             `json:"pctPositiveMonths"`
	MaxAnnualReturn        float64             `json:"maxAnnualReturn"`
	MinAnnualReturn        float64             `json:"minAnnualReturn"`
	SWR                    float64             `json:"swr"`
	SWR10Y                 float64             `json:"swr10y"`
	PWR10Y                 float64             `json:"pwr10y"`
	SWR20Y                 float64             `json:"swr20y"`
	PWR20Y                 float64             `json:"pwr20y"`
	SWR30Y                 float64             `json:"swr30y"`
	PWR30Y                 float64             `json:"pwr30y"`
	SWR40Y                 float64             `json:"swr40y"`
	PWR40Y                 float64             `json:"pwr40y"`
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
