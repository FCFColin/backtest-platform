package tactical

import (
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
)

const tradingDaysPerYear = engineutil.TradingDaysPerYear

type TechnicalIndicator string

const (
	IndSMA       TechnicalIndicator = "sma"
	IndEMA       TechnicalIndicator = "ema"
	IndRSI       TechnicalIndicator = "rsi"
	IndMACD      TechnicalIndicator = "macd"
	IndBollinger TechnicalIndicator = "bollinger"
	IndMomentum  TechnicalIndicator = "momentum"
)

type SignalCondition struct {
	Indicator TechnicalIndicator `json:"indicator"`
	Period    int                `json:"period"`
	Operator  string             `json:"operator"`
	Threshold float64            `json:"threshold"`
}
type WeightEntry struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}
type TradingSignal struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Conditions    []SignalCondition `json:"conditions"`
	TargetWeights []WeightEntry     `json:"targetWeights"`
}
type RankingConfig struct {
	Method string `json:"method"`
	TopN   int    `json:"topN"`
}
type TacticalStrategy struct {
	ID                string          `json:"id"`
	Name              string          `json:"name"`
	Signals           []TradingSignal `json:"signals"`
	AggregationMethod string          `json:"aggregationMethod"`
	RankingConfig     *RankingConfig  `json:"rankingConfig,omitempty"`
}
type SignalHistoryEntry struct {
	Date          string        `json:"date"`
	ActiveSignals []string      `json:"activeSignals"`
	Weights       []WeightEntry `json:"weights"`
}
type TacticalBacktestRequest struct {
	Strategy           TacticalStrategy              `json:"strategy"`
	PriceData          map[string]map[string]float64 `json:"priceData"`
	Dates              []string                      `json:"dates"`
	StartingValue      float64                       `json:"startingValue"`
	RebalanceFrequency string                        `json:"rebalanceFrequency"`
}
type TacticalBacktestResult struct {
	Portfolio     engine.PortfolioResult `json:"portfolio"`
	SignalHistory []SignalHistoryEntry   `json:"signalHistory"`
}
type ParamRange struct {
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
	Step float64 `json:"step"`
}
type GridCombinationMetrics struct {
	Param1      float64 `json:"param1"`
	Param2      float64 `json:"param2"`
	CAGR        float64 `json:"cagr"`
	MaxDrawdown float64 `json:"maxDrawdown"`
	Sharpe      float64 `json:"sharpe"`
	TotalReturn float64 `json:"totalReturn"`
	Stdev       float64 `json:"stdev"`
	Calmar      float64 `json:"calmar"`
}
type TopCombinationResult struct {
	GridCombinationMetrics
	GrowthCurve []engine.DataPoint `json:"growthCurve"`
}
type HeatmapData struct {
	Param1Label  string       `json:"param1Label"`
	Param2Label  string       `json:"param2Label"`
	Param1Values []float64    `json:"param1Values"`
	Param2Values []float64    `json:"param2Values"`
	Matrix       [][]*float64 `json:"matrix"`
	Objective    string       `json:"objective"`
}
type TacticalGridRequest struct {
	Indicator          string                        `json:"indicator"`
	Param1             ParamRange                    `json:"param1"`
	Param2             ParamRange                    `json:"param2"`
	PriceData          map[string]map[string]float64 `json:"priceData"`
	Dates              []string                      `json:"dates"`
	Prices             []float64                     `json:"prices"`
	TradingTicker      string                        `json:"tradingTicker"`
	StartDate          string                        `json:"startDate"`
	EndDate            string                        `json:"endDate"`
	StartingValue      float64                       `json:"startingValue"`
	RebalanceFrequency string                        `json:"rebalanceFrequency"`
	Objective          string                        `json:"objective"`
	TopN               *int                          `json:"topN,omitempty"`
}
type TacticalGridResponse struct {
	TotalCombinations int                      `json:"totalCombinations"`
	AllMetrics        []GridCombinationMetrics `json:"allMetrics"`
	TopResults        []TopCombinationResult   `json:"topResults"`
	Heatmap           HeatmapData              `json:"heatmap"`
	BestCombination   *TopCombinationResult    `json:"bestCombination"`
}
