// Package tactical 提供战术分配回测和网格搜索功能。
// 企业理由：将 tactical.ts + tacticalGrid.ts 迁移到 Go 引擎，统一计算入口（ADR-031）。
// 在 Go 引擎内部可直接调用 engine.RunBacktest 和 engine.CalculateStatisticsFromRequest，
// 无需 TS 端的 HTTP 自调用。
package tactical

import (
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
)

const tradingDaysPerYear = engineutil.TradingDaysPerYear

// ===== 类型定义 =====

// TechnicalIndicator 技术指标类型。
type TechnicalIndicator string

const (
	IndSMA       TechnicalIndicator = "sma"
	IndEMA       TechnicalIndicator = "ema"
	IndRSI       TechnicalIndicator = "rsi"
	IndMACD      TechnicalIndicator = "macd"
	IndBollinger TechnicalIndicator = "bollinger"
	IndMomentum  TechnicalIndicator = "momentum"
)

// SignalCondition 信号条件。
type SignalCondition struct {
	Indicator TechnicalIndicator `json:"indicator"`
	Period    int               `json:"period"`
	Operator  string            `json:"operator"` // gt, lt, cross_above, cross_below
	Threshold float64           `json:"threshold"`
}

// WeightEntry 权重条目。
type WeightEntry struct {
	Ticker string  `json:"ticker"`
	Weight float64 `json:"weight"`
}

// TradingSignal 交易信号。
type TradingSignal struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	Conditions    []SignalCondition `json:"conditions"`
	TargetWeights []WeightEntry     `json:"targetWeights"`
}

// RankingConfig 排名配置。
type RankingConfig struct {
	Method string `json:"method"` // fixed_share, risk_parity
	TopN   int    `json:"topN"`
}

// TacticalStrategy 战术分配策略。
type TacticalStrategy struct {
	ID                string            `json:"id"`
	Name              string            `json:"name"`
	Signals           []TradingSignal   `json:"signals"`
	AggregationMethod string            `json:"aggregationMethod"` // weighted_average, rank, voting
	RankingConfig     *RankingConfig    `json:"rankingConfig,omitempty"`
}

// SignalHistoryEntry 信号历史条目。
type SignalHistoryEntry struct {
	Date           string        `json:"date"`
	ActiveSignals  []string      `json:"activeSignals"`
	Weights        []WeightEntry `json:"weights"`
}

// TacticalBacktestRequest 战术分配回测请求。
type TacticalBacktestRequest struct {
	Strategy           TacticalStrategy            `json:"strategy"`
	PriceData          map[string]map[string]float64 `json:"priceData"`
	Dates              []string                    `json:"dates"`
	StartingValue      float64                     `json:"startingValue"`
	RebalanceFrequency string                       `json:"rebalanceFrequency"`
}

// TacticalBacktestResult 战术分配回测结果。
type TacticalBacktestResult struct {
	Portfolio     engine.PortfolioResult `json:"portfolio"`
	SignalHistory []SignalHistoryEntry            `json:"signalHistory"`
}

// ===== 网格搜索类型 =====

// ParamRange 参数范围。
type ParamRange struct {
	Min  float64 `json:"min"`
	Max  float64 `json:"max"`
	Step float64 `json:"step"`
}

// GridCombinationMetrics 网格组合指标。
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

// TopCombinationResult Top 组合结果。
type TopCombinationResult struct {
	GridCombinationMetrics
	GrowthCurve []engine.DataPoint `json:"growthCurve"`
}

// HeatmapData 热力图数据。
type HeatmapData struct {
	Param1Label  string       `json:"param1Label"`
	Param2Label  string       `json:"param2Label"`
	Param1Values []float64    `json:"param1Values"`
	Param2Values []float64    `json:"param2Values"`
	Matrix       [][]*float64 `json:"matrix"`
	Objective    string       `json:"objective"`
}

// TacticalGridRequest 网格搜索请求。
type TacticalGridRequest struct {
	Indicator           string         `json:"indicator"`
	Param1              ParamRange     `json:"param1"`
	Param2              ParamRange     `json:"param2"`
	PriceData           map[string]map[string]float64 `json:"priceData"`
	Dates               []string       `json:"dates"`
	Prices              []float64      `json:"prices"`
	TradingTicker       string         `json:"tradingTicker"`
	StartDate           string         `json:"startDate"`
	EndDate             string         `json:"endDate"`
	StartingValue       float64        `json:"startingValue"`
	RebalanceFrequency  string         `json:"rebalanceFrequency"`
	Objective           string         `json:"objective"`
	TopN                *int           `json:"topN,omitempty"`
}

// TacticalGridResponse 网格搜索响应。
type TacticalGridResponse struct {
	TotalCombinations int                    `json:"totalCombinations"`
	AllMetrics         []GridCombinationMetrics `json:"allMetrics"`
	TopResults         []TopCombinationResult   `json:"topResults"`
	Heatmap            HeatmapData             `json:"heatmap"`
	BestCombination    *TopCombinationResult   `json:"bestCombination"`
}
