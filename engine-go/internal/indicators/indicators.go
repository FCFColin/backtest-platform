package indicators

import "math"

var nan = math.NaN()

func NanSeries(n int) []float64 {
	result := make([]float64, n)
	for i := range result {
		result[i] = nan
	}
	return result
}

func CalcSMA(prices []float64, period int) []float64 {
	result := NanSeries(len(prices))
	if period <= 0 {
		return result
	}
	sum := 0.0
	for i := 0; i < len(prices); i++ {
		sum += prices[i]
		if i >= period {
			sum -= prices[i-period]
		}
		if i >= period-1 {
			result[i] = sum / float64(period)
		}
	}
	return result
}
func CalcEMA(prices []float64, period int) []float64 {
	result := NanSeries(len(prices))
	if len(prices) < period || period <= 0 {
		return result
	}
	// 以首个 period 的 SMA 为种子预热，避免冷启动偏差（TA-Lib/TradingView 标准做法）。
	seed := 0.0
	for i := 0; i < period; i++ {
		seed += prices[i]
	}
	result[period-1] = seed / float64(period)
	mult := 2.0 / float64(period+1)
	for i := period; i < len(prices); i++ {
		result[i] = prices[i]*mult + result[i-1]*(1-mult)
	}
	return result
}
func rsiValue(avgGain, avgLoss float64) float64 {
	if avgLoss == 0 {
		return 100
	}
	return 100 - 100/(1+avgGain/avgLoss)
}
func CalcRSI(prices []float64, period int) []float64 {
	result := NanSeries(len(prices))
	if len(prices) <= period || period <= 0 {
		return result
	}
	gainSum := 0.0
	lossSum := 0.0
	for i := 1; i <= period; i++ {
		diff := prices[i] - prices[i-1]
		if diff >= 0 {
			gainSum += diff
		} else {
			lossSum -= diff
		}
	}
	avgGain := gainSum / float64(period)
	avgLoss := lossSum / float64(period)
	result[period] = rsiValue(avgGain, avgLoss)
	for i := period + 1; i < len(prices); i++ {
		diff := prices[i] - prices[i-1]
		gain, loss := 0.0, 0.0
		if diff > 0 {
			gain = diff
		} else {
			loss = -diff
		}
		avgGain = (avgGain*float64(period-1) + gain) / float64(period)
		avgLoss = (avgLoss*float64(period-1) + loss) / float64(period)
		result[i] = rsiValue(avgGain, avgLoss)
	}
	return result
}
func CalcMACD(prices []float64) (macd, signal, histogram []float64) {
	emaFast := CalcEMA(prices, 12)
	emaSlow := CalcEMA(prices, 26)
	macd = make([]float64, len(prices))
	for i := range prices {
		macd[i] = emaFast[i] - emaSlow[i]
	}
	signal = CalcEMA(macd, 9)
	histogram = make([]float64, len(prices))
	for i := range prices {
		histogram[i] = macd[i] - signal[i]
	}
	return
}
func CalcMACDHist(prices []float64) []float64 {
	_, _, hist := CalcMACD(prices)
	return hist
}
func CalcBollinger(prices []float64, period int, mult float64) (upper, middle, lower []float64) {
	middle = CalcSMA(prices, period)
	upper = NanSeries(len(prices))
	lower = NanSeries(len(prices))
	for i := period - 1; i < len(prices); i++ {
		if math.IsNaN(middle[i]) {
			continue
		}
		variance := 0.0
		for j := i - period + 1; j <= i; j++ {
			variance += (prices[j] - middle[i]) * (prices[j] - middle[i])
		}
		std := math.Sqrt(variance / float64(period))
		upper[i] = middle[i] + mult*std
		lower[i] = middle[i] - mult*std
	}
	return
}
func CalcBollingerPctB(prices []float64, period int) []float64 {
	sma := CalcSMA(prices, period)
	result := NanSeries(len(prices))
	for i := period - 1; i < len(prices); i++ {
		if math.IsNaN(sma[i]) {
			continue
		}
		variance := 0.0
		for j := i - period + 1; j <= i; j++ {
			d := prices[j] - sma[i]
			variance += d * d
		}
		std := math.Sqrt(variance / float64(period))
		if std > 0 {
			result[i] = (prices[i] - sma[i]) / std
		}
	}
	return result
}
