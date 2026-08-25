package signal

import (
	"context"
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"math"
	"sort"
)

const (
	initialCapital     = 10000.0
	tradingDaysPerYear = engineutil.TradingDaysPerYear
)

func finalizeResult(signals []SignalPoint, data []PricePoint, riskFreeRate *float64) SignalAnalysisResult {
	stats := calcStatistics(signals)
	var equityCurve []EquityPoint
	equityCurve, stats.MaxDrawdown, stats.Sharpe = calcEquityCurve(signals, data, riskFreeRate)
	return SignalAnalysisResult{Signals: signals, Statistics: stats, EquityCurve: equityCurve}
}
func priceMapFrom(data []PricePoint) map[string]float64 {
	m := make(map[string]float64, len(data))
	for _, d := range data {
		m[d.Date] = d.Price
	}
	return m
}

// pointInTimeWinRates 记录每个信号日期"当日收盘前"的滚动胜率（无交易历史时用 0.5 先验），rank 聚合据此选优避免前视偏差。
func pointInTimeWinRates(signals []SignalPoint) map[string]float64 {
	rates := make(map[string]float64, len(signals))
	wins, trades := 0, 0
	var pendingBuy *float64
	for _, s := range signals {
		rates[s.Date] = 0.5
		if trades > 0 {
			rates[s.Date] = float64(wins) / float64(trades)
		}
		if s.Type == SignalBuy {
			price := s.Price
			pendingBuy = &price
		} else if s.Type == SignalSell && pendingBuy != nil {
			if s.Price > *pendingBuy {
				wins++
			}
			trades++
			pendingBuy = nil
		}
	}
	return rates
}
func AnalyzeSignal(req SignalAnalysisRequest, data []PricePoint) SignalAnalysisResult {
	signals := filterByType(generateRawSignals(req.Indicator, req.Period, req.Threshold, data), req.SignalType)
	return finalizeResult(signals, data, req.RiskFreeRate)
}
func buildSignalDirMap(signals []SignalPoint) map[string]SignalDir {
	m := make(map[string]SignalDir)
	for _, s := range signals {
		m[s.Date] = s.Type
	}
	return m
}
func mergedSignalDates(dirMaps ...map[string]SignalDir) []string {
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
	return allDates
}
func combineDir(s1, s2 *SignalDir, method string) *SignalDir {
	switch method {
	case "and":
		if s1 != nil && s2 != nil && *s1 == *s2 {
			return dirPtr(*s1)
		}
		return nil
	case "or":
		if s1 != nil {
			return s1
		}
		return s2
	case "xor":
		if s1 != nil && s2 == nil {
			return s1
		}
		if s2 != nil && s1 == nil {
			return s2
		}
	}
	return nil
}
func AnalyzeDualSignal(cfg1, cfg2 SignalAnalysisRequest, data1, data2 []PricePoint, combinationMethod string) DualSignalResult {
	result1 := AnalyzeSignal(cfg1, data1)
	result2 := AnalyzeSignal(cfg2, data2)
	map1 := buildSignalDirMap(result1.Signals)
	map2 := buildSignalDirMap(result2.Signals)
	allDates := mergedSignalDates(map1, map2)
	priceMap := priceMapFrom(data1)
	var comparison []ComparisonEntry
	var combinedSignals []SignalPoint
	for _, date := range allDates {
		var s1, s2 *SignalDir
		if v, ok := map1[date]; ok {
			s1 = dirPtr(v)
		}
		if v, ok := map2[date]; ok {
			s2 = dirPtr(v)
		}
		combined := combineDir(s1, s2, combinationMethod)
		comparison = append(comparison, ComparisonEntry{Date: date, Signal1: s1, Signal2: s2, Combined: combined})
		if combined != nil {
			if price, ok := priceMap[date]; ok {
				combinedSignals = append(combinedSignals, SignalPoint{Date: date, Type: *combined, Price: price})
			}
		}
	}
	return DualSignalResult{Signal1: result1, Signal2: result2, Combined: finalizeResult(combinedSignals, data1, cfg1.RiskFreeRate), Comparison: comparison}
}
func AnalyzeMultiSignal(ctx context.Context, configs []SignalAnalysisRequest, data []PricePoint, aggregationMethod string, weights []float64) MultiSignalResult {
	perSignal := make([]SignalAnalysisResult, len(configs))
	contributions := make([]Contribution, len(configs))
	for i, c := range configs {
		r := AnalyzeSignal(c, data)
		perSignal[i] = r
		contributions[i] = Contribution{Index: i, Indicator: c.Indicator, Contribution: r.Statistics.AvgReturn, Statistics: r.Statistics}
	}
	dirMaps := make([]map[string]SignalDir, len(perSignal))
	ptWinRates := make([]map[string]float64, len(perSignal))
	for i, r := range perSignal {
		dirMaps[i] = buildSignalDirMap(r.Signals)
		ptWinRates[i] = pointInTimeWinRates(r.Signals)
	}
	allDates := mergedSignalDates(dirMaps...)
	priceMap := priceMapFrom(data)
	rawWeights := make([]float64, len(configs))
	if len(weights) == len(configs) {
		for i, w := range weights {
			rawWeights[i] = max(0, w)
		}
	} else {
		each := 1.0 / float64(len(configs))
		for i := range rawWeights {
			rawWeights[i] = each
		}
	}
	wSum := mathutil.Sum(rawWeights)
	if wSum == 0 {
		wSum = 1
	}
	var aggregatedSignals []SignalPoint
	for _, date := range allDates {
		score, buys, sells := 0.0, 0, 0
		var bestRank float64 = -1
		var bestDir *SignalDir
		for i := range configs {
			dir, ok := dirMaps[i][date]
			if !ok {
				continue
			}
			winRate := ptWinRates[i][date]
			if dir == SignalBuy || dir == SignalSell {
				sign := 1.0
				if dir == SignalSell {
					sign = -1
					sells++
				} else {
					buys++
				}
				score += sign * rawWeights[i] / wSum
				if winRate > bestRank {
					bestRank = winRate
					bestDir = dirPtr(dir)
				}
			}
		}
		var aggDir *SignalDir
		switch aggregationMethod {
		case "weighted":
			if score > 0 {
				aggDir = dirPtr(SignalBuy)
			} else if score < 0 {
				aggDir = dirPtr(SignalSell)
			}
		case "voting":
			if buys > sells {
				aggDir = dirPtr(SignalBuy)
			} else if sells > buys {
				aggDir = dirPtr(SignalSell)
			}
		default:
			aggDir = bestDir
		}
		if aggDir != nil {
			if price, ok := priceMap[date]; ok {
				aggregatedSignals = append(aggregatedSignals, SignalPoint{Date: date, Type: *aggDir, Price: price})
			}
		}
	}
	var rf *float64
	if len(configs) > 0 {
		rf = configs[0].RiskFreeRate
	}
	return MultiSignalResult{Aggregated: finalizeResult(aggregatedSignals, data, rf), Contributions: contributions}
}

func calcStatistics(signals []SignalPoint) SignalStats {
	totalSignals, wins, completedTrades := len(signals), 0, 0
	returnSum := 0.0
	var pendingBuy *float64
	for _, s := range signals {
		if s.Type == SignalBuy {
			p := s.Price
			pendingBuy = &p
		} else if s.Type == SignalSell && pendingBuy != nil {
			ret := (s.Price - *pendingBuy) / *pendingBuy
			returnSum += ret
			completedTrades++
			if ret > 0 {
				wins++
			}
			pendingBuy = nil
		}
	}
	winRate, avgReturn := 0.0, 0.0
	if completedTrades > 0 {
		winRate = float64(wins) / float64(completedTrades)
		avgReturn = returnSum / float64(completedTrades)
	}
	return SignalStats{TotalSignals: totalSignals, WinRate: winRate, AvgReturn: avgReturn}
}
func calcEquityCurve(signals []SignalPoint, data []PricePoint, riskFreeRate *float64) (equityCurve []EquityPoint, maxDrawdown, sharpe float64) {
	signalMap := buildSignalDirMap(signals)
	capital := initialCapital
	shares := 0.0
	inPosition := false
	var dailyReturns []float64
	prevEquity := initialCapital
	for _, point := range data {
		if sig, ok := signalMap[point.Date]; ok {
			if sig == SignalBuy && !inPosition {
				shares = capital / point.Price
				inPosition = true
			} else if sig == SignalSell && inPosition {
				capital = shares * point.Price
				shares = 0
				inPosition = false
			}
		}
		equity := capital
		if inPosition {
			equity = shares * point.Price
		}
		equityCurve = append(equityCurve, EquityPoint{Date: point.Date, Value: math.Round(equity*100) / 100})
		if prevEquity > 0 {
			dailyReturns = append(dailyReturns, (equity-prevEquity)/prevEquity)
		}
		prevEquity = equity
	}
	values := make([]float64, len(equityCurve))
	for i, p := range equityCurve {
		values[i] = p.Value
	}
	maxDrawdown = engine.CalcMaxDrawdown(values).MaxDrawdown
	stdev := engine.CalcAnnualizedStdev(dailyReturns)
	if len(equityCurve) >= 2 {
		years := float64(len(equityCurve)-1) / tradingDaysPerYear
		cagr := engine.CalcCAGR(equityCurve[0].Value, equityCurve[len(equityCurve)-1].Value, years)
		// U-2 跟进：显式 rf 优先，nil→legacy 常量（golden/存量调用零漂移）
		rf := engineutil.RiskFreeRate
		if riskFreeRate != nil {
			rf = *riskFreeRate
		}
		sharpe = engine.CalcSharpeWithRF(rf, cagr, stdev)
	}
	return
}
