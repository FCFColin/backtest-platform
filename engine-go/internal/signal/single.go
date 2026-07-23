package signal

import (
	"math"
	"strings"

	"engine-go/internal/indicators"
)

// ===== 信号生成 =====

// detectCrossSignals 检测交叉信号。
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

// generateMaSignals 生成 MA 交叉信号。
func generateMaSignals(ind string, prices []float64, data []PricePoint, safePeriod int) []SignalPoint {
	var ma []float64
	if ind == "sma" {
		ma = indicators.CalcSMA(prices, safePeriod)
	} else {
		ma = indicators.CalcEMA(prices, safePeriod)
	}
	return detectCrossSignals(data, prices, ma, prices)
}

// generateRsiSignals 生成 RSI 超买超卖信号。
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

// generateMacdSignals 生成 MACD 金叉死叉信号。
func generateMacdSignals(prices []float64, data []PricePoint) []SignalPoint {
	macd, signal, _ := indicators.CalcMACD(prices)
	return detectCrossSignals(data, macd, signal, prices)
}

// generateBollingerSignals 生成布林带突破信号。
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

// generateRawSignals 根据技术指标生成原始买卖信号。
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

// filterByType 按 signalType 过滤信号。
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

// ===== 主分析函数 =====

// AnalyzeSignal 执行单信号分析。
func AnalyzeSignal(req SignalAnalysisRequest, data []PricePoint) SignalAnalysisResult {
	rawSignals := generateRawSignals(req.Indicator, req.Period, req.Threshold, data)
	signals := filterByType(rawSignals, req.SignalType)
	stats := calcStatistics(signals)
	equityCurve, maxDD, sharpe := calcEquityCurve(signals, data)
	stats.MaxDrawdown = maxDD
	stats.Sharpe = sharpe
	return SignalAnalysisResult{
		Signals:     signals,
		Statistics:  stats,
		EquityCurve: equityCurve,
	}
}
