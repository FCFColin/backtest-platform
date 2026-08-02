package signal

type PricePoint struct {
	Date  string  `json:"date"`
	Price float64 `json:"price"`
}
type SignalDir string

const (
	SignalBuy  SignalDir = "buy"
	SignalSell SignalDir = "sell"
)

type SignalPoint struct {
	Date  string    `json:"date"`
	Type  SignalDir `json:"type"`
	Price float64   `json:"price"`
}
type SignalStats struct {
	TotalSignals int     `json:"totalSignals"`
	WinRate      float64 `json:"winRate"`
	AvgReturn    float64 `json:"avgReturn"`
	MaxDrawdown  float64 `json:"maxDrawdown"`
	Sharpe       float64 `json:"sharpe"`
}
type EquityPoint struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}
type SignalAnalysisResult struct {
	Signals     []SignalPoint `json:"signals"`
	Statistics  SignalStats   `json:"statistics"`
	EquityCurve []EquityPoint `json:"equityCurve"`
}
type SignalAnalysisRequest struct {
	Ticker     string  `json:"ticker"`
	Indicator  string  `json:"indicator"`
	Period     int     `json:"period"`
	Threshold  float64 `json:"threshold"`
	StartDate  string  `json:"startDate"`
	EndDate    string  `json:"endDate"`
	SignalType string  `json:"signalType"`
}
type DualSignalConfig struct {
	Signal1           SignalAnalysisRequest `json:"signal1"`
	Signal2           SignalAnalysisRequest `json:"signal2"`
	CombinationMethod string                `json:"combinationMethod"`
}
type MultiSignalConfig struct {
	Signals           []SignalAnalysisRequest `json:"signals"`
	AggregationMethod string                  `json:"aggregationMethod"`
	Weights           []float64               `json:"weights"`
}
type DualSignalResult struct {
	Signal1    SignalAnalysisResult `json:"signal1"`
	Signal2    SignalAnalysisResult `json:"signal2"`
	Combined   SignalAnalysisResult `json:"combined"`
	Comparison []ComparisonEntry    `json:"comparison"`
}
type ComparisonEntry struct {
	Date     string     `json:"date"`
	Signal1  *SignalDir `json:"signal1"`
	Signal2  *SignalDir `json:"signal2"`
	Combined *SignalDir `json:"combined"`
}
type MultiSignalResult struct {
	Aggregated    SignalAnalysisResult `json:"aggregated"`
	Contributions []Contribution       `json:"contributions"`
}
type Contribution struct {
	Index        int         `json:"index"`
	Indicator    string      `json:"indicator"`
	Contribution float64     `json:"contribution"`
	Statistics   SignalStats `json:"statistics"`
}

func dirPtr(d SignalDir) *SignalDir { return &d }
