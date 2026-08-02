package signal

import (
	"context"
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/indicators"
	"engine-go/internal/mathutil"
	"math"
	"sort"
	"strings"
)

func detectCrossSignals(data []PricePoint, prevVals, curVals, prices []float64) []SignalPoint {
	var signals []SignalPoint
	for i := 1; i < len(prices); i++ {
		if math.IsNaN(curVals[i]) || math.IsNaN(prevVals[i]) || math.IsNaN(curVals[i-1]) || math.IsNaN(prevVals[i-1]) {
			continue
		}
		crossedUp := prevVals[i-1] <= curVals[i-1] && prevVals[i] > curVals[i]
		crossedDown := prevVals[i-1] >= curVals[i-1] && prevVals[i] < curVals[i]
		if crossedUp {
			signals = append(signals, SignalPoint{Date: data[i].Date, Type: SignalBuy, Price: prices[i]})
		} else if crossedDown {
			signals = append(signals, SignalPoint{Date: data[i].Date, Type: SignalSell, Price: prices[i]})
		}
	}
	return signals
}
func generateMaSignals(ind string, prices []float64, data []PricePoint, safePeriod int) []SignalPoint {
	var ma []float64
	if ind == "sma" {
		ma = indicators.CalcSMA(prices, safePeriod)
	} else {
		ma = indicators.CalcEMA(prices, safePeriod)
	}
	return detectCrossSignals(data, prices, ma, prices)
}
func generateRsiSignals(prices []float64, data []PricePoint, safePeriod int, threshold float64) []SignalPoint {
	rsi := indicators.CalcRSI(prices, safePeriod)
	oversold := 30.0
	if threshold > 0 {
		oversold = threshold
	}
	overbought := 100 - oversold
	var signals []SignalPoint
	for i := 1; i < len(prices); i++ {
		if math.IsNaN(rsi[i]) || math.IsNaN(rsi[i-1]) {
			continue
		}
		if rsi[i-1] >= oversold && rsi[i] < oversold {
			signals = append(signals, SignalPoint{Date: data[i].Date, Type: SignalBuy, Price: prices[i]})
		} else if rsi[i-1] <= overbought && rsi[i] > overbought {
			signals = append(signals, SignalPoint{Date: data[i].Date, Type: SignalSell, Price: prices[i]})
		}
	}
	return signals
}
func generateMacdSignals(prices []float64, data []PricePoint) []SignalPoint {
	macd, signal, _ := indicators.CalcMACD(prices)
	return detectCrossSignals(data, macd, signal, prices)
}
func generateBollingerSignals(prices []float64, data []PricePoint, safePeriod int, threshold float64) []SignalPoint {
	mult := 2.0
	if threshold > 0 {
		mult = threshold
	}
	upper, _, lower := indicators.CalcBollinger(prices, safePeriod, mult)
	var signals []SignalPoint
	for i := 1; i < len(prices); i++ {
		if math.IsNaN(upper[i]) || math.IsNaN(lower[i]) || math.IsNaN(upper[i-1]) || math.IsNaN(lower[i-1]) {
			continue
		}
		if prices[i-1] >= lower[i-1] && prices[i] < lower[i] {
			signals = append(signals, SignalPoint{Date: data[i].Date, Type: SignalBuy, Price: prices[i]})
		} else if prices[i-1] <= upper[i-1] && prices[i] > upper[i] {
			signals = append(signals, SignalPoint{Date: data[i].Date, Type: SignalSell, Price: prices[i]})
		}
	}
	return signals
}
func generateRawSignals(indicator string, period int, threshold float64, data []PricePoint) []SignalPoint {
	prices := make([]float64, len(data))
	for i, d := range data {
		prices[i] = d.Price
	}
	if len(prices) < 2 {
		return nil
	}
	ind := strings.ToLower(indicator)
	safePeriod := period
	if safePeriod < 2 {
		safePeriod = 2
	}
	switch ind {
	case "sma", "ema":
		return generateMaSignals(ind, prices, data, safePeriod)
	case "rsi":
		return generateRsiSignals(prices, data, safePeriod, threshold)
	case "macd":
		return generateMacdSignals(prices, data)
	case "bollinger":
		return generateBollingerSignals(prices, data, safePeriod, threshold)
	}
	return nil
}
func filterByType(signals []SignalPoint, signalType string) []SignalPoint {
	var want SignalDir
	switch signalType {
	case "entry":
		want = SignalBuy
	case "exit":
		want = SignalSell
	default:
		return signals
	}
	var result []SignalPoint
	for _, s := range signals {
		if s.Type == want {
			result = append(result, s)
		}
	}
	return result
}

func finalizeResult(signals []SignalPoint, data []PricePoint) SignalAnalysisResult {
	stats := calcStatistics(signals)
	var equityCurve []EquityPoint
	equityCurve, stats.MaxDrawdown, stats.Sharpe = calcEquityCurve(signals, data)
	return SignalAnalysisResult{Signals: signals, Statistics: stats, EquityCurve: equityCurve}
}
func priceMapFrom(data []PricePoint) map[string]float64 {
	m := make(map[string]float64, len(data))
	for _, d := range data {
		m[d.Date] = d.Price
	}
	return m
}
func AnalyzeSignal(req SignalAnalysisRequest, data []PricePoint) SignalAnalysisResult {
	signals := filterByType(generateRawSignals(req.Indicator, req.Period, req.Threshold, data), req.SignalType)
	return finalizeResult(signals, data)
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
			r := *s1
			return &r
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
			s1 = &v
		}
		if v, ok := map2[date]; ok {
			s2 = &v
		}
		combined := combineDir(s1, s2, combinationMethod)
		comparison = append(comparison, ComparisonEntry{Date: date, Signal1: s1, Signal2: s2, Combined: combined})
		if combined != nil {
			if price, ok := priceMap[date]; ok {
				combinedSignals = append(combinedSignals, SignalPoint{Date: date, Type: *combined, Price: price})
			}
		}
	}
	return DualSignalResult{Signal1: result1, Signal2: result2, Combined: finalizeResult(combinedSignals, data1), Comparison: comparison}
}
func AnalyzeMultiSignal(ctx context.Context, configs []SignalAnalysisRequest, data []PricePoint, aggregationMethod string, weights []float64) MultiSignalResult {
	perSignal := make([]SignalAnalysisResult, len(configs))
	for i, c := range configs {
		perSignal[i] = AnalyzeSignal(c, data)
	}
	dirMaps := make([]map[string]SignalDir, len(perSignal))
	for i, r := range perSignal {
		dirMaps[i] = buildSignalDirMap(r.Signals)
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
		default:
			aggDir = bestDir
		}
		if aggDir != nil {
			if price, ok := priceMap[date]; ok {
				aggregatedSignals = append(aggregatedSignals, SignalPoint{Date: date, Type: *aggDir, Price: price})
			}
		}
	}
	contributions := make([]Contribution, len(perSignal))
	for i, r := range perSignal {
		contributions[i] = Contribution{Index: i, Indicator: configs[i].Indicator, Contribution: r.Statistics.AvgReturn, Statistics: r.Statistics}
	}
	return MultiSignalResult{Aggregated: finalizeResult(aggregatedSignals, data), Contributions: contributions}
}

const (
	initialCapital     = 10000.0
	tradingDaysPerYear = engineutil.TradingDaysPerYear
)

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
func calcEquityCurve(signals []SignalPoint, data []PricePoint) (equityCurve []EquityPoint, maxDrawdown, sharpe float64) {
	signalMap := make(map[string]SignalDir)
	for _, s := range signals {
		signalMap[s.Date] = s.Type
	}
	capital := initialCapital
	shares := 0.0
	inPosition := false
	var dailyReturns []float64
	prevEquity := initialCapital
	for _, point := range data {
		sig, ok := signalMap[point.Date]
		if ok {
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
		sharpe = engine.CalcSharpe(cagr, stdev)
	}
	return
}

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

func ToPricePoints(tickerData map[string]float64) []PricePoint {
	var result []PricePoint
	for date, price := range tickerData {
		if !math.IsNaN(price) && price > 0 {
			result = append(result, PricePoint{Date: date, Price: price})
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date < result[j].Date })
	return result
}
