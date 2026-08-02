package signal

import (
	"engine-go/internal/indicators"
	"math"
	"strings"
)

func detectCrossSignals(data []PricePoint, prevVals, curVals, prices []float64) []SignalPoint {
	var signals []SignalPoint
	for i := 1; i < len(prices); i++ {
		if math.IsNaN(curVals[i]) || math.IsNaN(prevVals[i]) || math.IsNaN(curVals[i-1]) || math.IsNaN(prevVals[i-1]) {
			continue
		}
		if prevVals[i-1] <= curVals[i-1] && prevVals[i] > curVals[i] {
			signals = append(signals, SignalPoint{Date: data[i].Date, Type: SignalBuy, Price: prices[i]})
		} else if prevVals[i-1] >= curVals[i-1] && prevVals[i] < curVals[i] {
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
