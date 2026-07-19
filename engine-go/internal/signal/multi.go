package signal

import (
	"context"
	"sort"
)

// ===== 多信号聚合 =====

// AnalyzeMultiSignal 执行多信号分析。
func AnalyzeMultiSignal(ctx context.Context, configs []SignalAnalysisRequest, data []PricePoint, aggregationMethod string, weights []float64) MultiSignalResult {
	perSignal := make([]SignalAnalysisResult, len(configs))
	for i, c := range configs {
		perSignal[i] = AnalyzeSignal(c, data)
	}
	dirMaps := make([]map[string]SignalDir, len(perSignal))
	for i, r := range perSignal {
		dirMaps[i] = buildSignalDirMap(r.Signals)
	}

	dateSet := make(map[string]bool)
	for _, m := range dirMaps {
		for d := range m {
			dateSet[d] = true
		}
	}
	allDates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		allDates = append(allDates, d)
	}
	sort.Strings(allDates)

	priceMap := make(map[string]float64)
	for _, d := range data {
		priceMap[d.Date] = d.Price
	}

	// 权重归一化
	rawWeights := make([]float64, len(configs))
	if len(weights) == len(configs) {
		for i, w := range weights {
			if w >= 0 {
				rawWeights[i] = w
			} else {
				rawWeights[i] = 0
			}
		}
	} else {
		each := 1.0 / float64(len(configs))
		for i := range rawWeights {
			rawWeights[i] = each
		}
	}
	wSum := 0.0
	for _, w := range rawWeights {
		wSum += w
	}
	if wSum == 0 {
		wSum = 1
	}

	var aggregatedSignals []SignalPoint

	for _, date := range allDates {
		score := 0.0
		buys := 0
		sells := 0
		var bestRank float64 = -1
		var bestDir *SignalDir

		for i := range configs {
			dir, ok := dirMaps[i][date]
			if !ok {
				continue
			}
			winRate := perSignal[i].Statistics.WinRate
			if dir == SignalBuy {
				score += rawWeights[i] / wSum
				buys++
				if winRate > bestRank {
					bestRank = winRate
					b := SignalBuy
					bestDir = &b
				}
			} else if dir == SignalSell {
				score -= rawWeights[i] / wSum
				sells++
				if winRate > bestRank {
					bestRank = winRate
					b := SignalSell
					bestDir = &b
				}
			}
		}

		var aggDir *SignalDir
		switch aggregationMethod {
		case "weighted":
			if score > 0 {
				b := SignalBuy
				aggDir = &b
			} else if score < 0 {
				s := SignalSell
				aggDir = &s
			}
		case "voting":
			if buys > sells {
				b := SignalBuy
				aggDir = &b
			} else if sells > buys {
				s := SignalSell
				aggDir = &s
			}
		default: // rank
			aggDir = bestDir
		}

		if aggDir != nil {
			if price, ok := priceMap[date]; ok {
				aggregatedSignals = append(aggregatedSignals, SignalPoint{Date: date, Type: *aggDir, Price: price})
			}
		}
	}

	aggStats := calcStatistics(aggregatedSignals)
	equityCurve, maxDD, sharpe := calcEquityCurve(aggregatedSignals, data)
	aggStats.MaxDrawdown = maxDD
	aggStats.Sharpe = sharpe

	contributions := make([]Contribution, len(perSignal))
	for i, r := range perSignal {
		contributions[i] = Contribution{
			Index:        i,
			Indicator:    configs[i].Indicator,
			Contribution: r.Statistics.AvgReturn,
			Statistics:   r.Statistics,
		}
	}

	return MultiSignalResult{
		Aggregated: SignalAnalysisResult{
			Signals:     aggregatedSignals,
			Statistics:  aggStats,
			EquityCurve: equityCurve,
		},
		Contributions: contributions,
	}
}
