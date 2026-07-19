package tactical

import (
	"context"
	"math"
	"sort"
	"strconv"
	"strings"

	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/indicators"
)

// ===== 网格搜索 =====

// generateRange 生成参数序列。
func generateRange(min, max, step float64) []float64 {
	if step <= 0 {
		return []float64{min}
	}
	var result []float64
	for v := min; v <= max+step/2; v += step {
		rounded := math.Round(v*1000) / 1000
		result = append(result, rounded)
	}
	if len(result) == 0 {
		result = append(result, min)
	}
	return result
}

// generateGridSignals 生成持仓信号序列（网格搜索用）。
func generateGridSignals(indicator string, prices []float64, dates []string, param1, param2 float64, rebalanceFreq string) []bool {
	signals := make([]bool, len(prices))
	inPosition := false
	prevDate := ""

	var ma []float64
	ind := strings.ToLower(indicator)
	if ind == "sma" {
		ma = indicators.CalcSMA(prices, int(param1))
	} else if ind == "ema" {
		ma = indicators.CalcEMA(prices, int(param1))
	}
	threshold := param2 / 100

	for i := 0; i < len(prices); i++ {
		// engineutil.ShouldRebalance 参数顺序为 (frequency, prevDate, currDate, ...)，
		// tactical 此前仅按频率触发，故 threshold/bands 全部传零值以保持等价语义。
		canRebalance := engineutil.ShouldRebalance(rebalanceFreq, prevDate, dates[i], 0, nil, nil, 0, nil)
		if ind == "rsi" {
			rsi := indicators.CalcRSI(prices, int(param1))
			oversold := param2
			overbought := 100 - param2
			if math.IsNaN(rsi[i]) {
				signals[i] = inPosition
				prevDate = dates[i]
				continue
			}
			if canRebalance {
				if !inPosition && rsi[i] < oversold {
					inPosition = true
				} else if inPosition && rsi[i] > overbought {
					inPosition = false
				}
			}
		} else {
			if math.IsNaN(ma[i]) {
				signals[i] = inPosition
				prevDate = dates[i]
				continue
			}
			upperBand := ma[i] * (1 + threshold)
			lowerBand := ma[i] * (1 - threshold)
			if canRebalance {
				if !inPosition && prices[i] > upperBand {
					inPosition = true
				} else if inPosition && prices[i] < lowerBand {
					inPosition = false
				}
			}
		}
		signals[i] = inPosition
		prevDate = dates[i]
	}
	return signals
}

// buildSyntheticPrices 构建合成价格序列。
func buildSyntheticPrices(dates []string, prices []float64, signals []bool) map[string]float64 {
	synthetic := make(map[string]float64)
	if len(dates) == 0 {
		return synthetic
	}
	synthetic[dates[0]] = prices[0]
	prevSynthetic := prices[0]
	for i := 1; i < len(dates); i++ {
		actualReturn := 0.0
		if prices[i-1] > 0 {
			actualReturn = prices[i]/prices[i-1] - 1
		}
		dailyReturn := 0.0
		if signals[i] {
			dailyReturn = actualReturn
		}
		prevSynthetic = prevSynthetic * (1 + dailyReturn)
		synthetic[dates[i]] = prevSynthetic
	}
	return synthetic
}

// getObjectiveValue 根据优化目标获取排序值。
func getObjectiveValue(m GridCombinationMetrics, objective string) float64 {
	switch objective {
	case "maxCAGR":
		return m.CAGR
	case "minDrawdown":
		return -m.MaxDrawdown
	case "maxSharpe":
		return m.Sharpe
	default:
		return m.CAGR
	}
}

// RunGridSearch 执行网格搜索。
func RunGridSearch(ctx context.Context, req TacticalGridRequest) (*TacticalGridResponse, error) {
	param1Values := generateRange(req.Param1.Min, req.Param1.Max, req.Param1.Step)
	param2Values := generateRange(req.Param2.Min, req.Param2.Max, req.Param2.Step)
	totalCombinations := len(param1Values) * len(param2Values)

	var allMetrics []GridCombinationMetrics
	var allResults []TopCombinationResult

	for _, p1 := range param1Values {
		for _, p2 := range param2Values {
			signals := generateGridSignals(req.Indicator, req.Prices, req.Dates, p1, p2, req.RebalanceFrequency)
			syntheticPrices := buildSyntheticPrices(req.Dates, req.Prices, signals)
			syntheticPriceData := map[string]map[string]float64{req.TradingTicker: syntheticPrices}

			// 直接调用 engine.RunBacktest
			btReq := engine.BacktestRequest{
				Portfolios: []engine.PortfolioInput{
					{
						Name:   "grid-" + ftoa(p1) + "-" + ftoa(p2),
						Assets: []engine.AssetInput{{Ticker: req.TradingTicker, Weight: 100}},
						RebalanceFrequency: "none",
					},
				},
				PriceData: syntheticPriceData,
				Params: engine.BacktestParams{
					StartDate:          req.StartDate,
					EndDate:            req.EndDate,
					StartingValue:      req.StartingValue,
					RollingWindowMonths: 12,
				},
			}
			btResult, err := engine.RunBacktest(ctx, btReq)
			if err != nil || len(btResult.Portfolios) == 0 {
				fallback := GridCombinationMetrics{
					Param1: p1, Param2: p2,
				}
				allMetrics = append(allMetrics, fallback)
				allResults = append(allResults, TopCombinationResult{
					GridCombinationMetrics: fallback,
					GrowthCurve:             []engine.DataPoint{},
				})
				continue
			}
			pr := btResult.Portfolios[0]
			metrics := GridCombinationMetrics{
				Param1:      p1,
				Param2:      p2,
				CAGR:        pr.Statistics.CAGR,
				MaxDrawdown: pr.Statistics.MaxDrawdown,
				Sharpe:      pr.Statistics.Sharpe,
				TotalReturn: pr.Statistics.TotalReturn,
				Stdev:       pr.Statistics.Stdev,
				Calmar:      pr.Statistics.Calmar,
			}
			allMetrics = append(allMetrics, metrics)
			allResults = append(allResults, TopCombinationResult{
				GridCombinationMetrics: metrics,
				GrowthCurve:            pr.GrowthCurve,
			})
		}
	}

	sort.Slice(allMetrics, func(i, j int) bool {
		return getObjectiveValue(allMetrics[j], req.Objective) > getObjectiveValue(allMetrics[i], req.Objective)
	})
	sort.Slice(allResults, func(i, j int) bool {
		return getObjectiveValue(allResults[j].GridCombinationMetrics, req.Objective) > getObjectiveValue(allResults[i].GridCombinationMetrics, req.Objective)
	})

	topN := 10
	if req.TopN != nil && *req.TopN > 0 {
		topN = *req.TopN
	}
	if topN > len(allResults) {
		topN = len(allResults)
	}
	topResults := allResults[:topN]

	// 热力图
	param1Label := strings.ToUpper(req.Indicator) + " 周期"
	param2Label := "突破阈值(%)"
	if req.Indicator == "rsi" {
		param1Label = "RSI 周期"
		param2Label = "超卖阈值"
	}

	matrix := make([][]*float64, len(param1Values))
	for i, p1 := range param1Values {
		matrix[i] = make([]*float64, len(param2Values))
		for j, p2 := range param2Values {
			for _, r := range allResults {
				if r.Param1 == p1 && r.Param2 == p2 {
					v := getObjectiveValue(r.GridCombinationMetrics, req.Objective)
					matrix[i][j] = &v
					break
				}
			}
		}
	}

	var best *TopCombinationResult
	if len(topResults) > 0 {
		best = &topResults[0]
	}

	return &TacticalGridResponse{
		TotalCombinations: totalCombinations,
		AllMetrics:        allMetrics,
		TopResults:        topResults,
		Heatmap: HeatmapData{
			Param1Label:  param1Label,
			Param2Label:  param2Label,
			Param1Values: param1Values,
			Param2Values: param2Values,
			Matrix:       matrix,
			Objective:    req.Objective,
		},
		BestCombination: best,
	}, nil
}

// ===== 工具函数 =====

func ftoa(f float64) string {
	s := strconv.FormatFloat(f, 'f', 3, 64)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	return s
}
