// Package indicators 提供共享的技术指标计算实现（SMA/EMA/RSI/MACD/Bollinger）。
//
// 本包用于消除 signal 包与 tactical 包中重复的指标实现（ADR-042 包整理；
// spec Wave 1 Task 1.2）。所有函数在输入参数非法时返回与输入长度相同、
// 元素为 NaN 的切片，保持与原 signal/tactical 实现完全一致的行为契约。
//
// 注意：CalcBollingerPctB 的语义不是标准 Bollinger %B
// （(price - lower) / (upper - lower)），而是 (price - sma) / std 的 z-score
// 形式；此实现沿用原 tactical 包的历史行为以避免回归。
package indicators

import "math"

// nan 是本包共享的 NaN 哨兵，避免在多处重复调用 math.NaN。
var nan = math.NaN()

// CalcSMA 计算简单移动平均。
//
// 不足 period 个样本的位置填 NaN；period <= 0 时全部填 NaN。
// 算法使用滑动窗口求和，时间复杂度 O(n)。
func CalcSMA(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := range result {
		result[i] = nan
	}
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

// CalcEMA 计算指数移动平均。
//
// 第一个样本直接以 prices[0] 作为初始值，后续以 mult = 2/(period+1) 平滑。
// 空切片或 period <= 0 时返回全 NaN 切片。
func CalcEMA(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := range result {
		result[i] = nan
	}
	if len(prices) == 0 || period <= 0 {
		return result
	}
	mult := 2.0 / float64(period+1)
	result[0] = prices[0]
	for i := 1; i < len(prices); i++ {
		result[i] = prices[i]*mult + result[i-1]*(1-mult)
	}
	return result
}

// CalcRSI 计算相对强弱指数（Wilder 平滑法）。
//
// 前 period 个样本填 NaN；当 avgLoss == 0 时 RSI = 100。
// 样本数 <= period 或 period <= 0 时返回全 NaN 切片。
func CalcRSI(prices []float64, period int) []float64 {
	result := make([]float64, len(prices))
	for i := range result {
		result[i] = nan
	}
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
	if avgLoss == 0 {
		result[period] = 100
	} else {
		result[period] = 100 - 100/(1+avgGain/avgLoss)
	}
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
		if avgLoss == 0 {
			result[i] = 100
		} else {
			result[i] = 100 - 100/(1+avgGain/avgLoss)
		}
	}
	return result
}

// CalcMACD 计算 MACD 指标，返回 (macd, signal, histogram) 三个序列。
//
// macd = EMA(prices, 12) - EMA(prices, 26)；signal = EMA(macd, 9)；
// histogram = macd - signal。三个序列长度与 prices 相同。
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

// CalcMACDHist 仅计算 MACD 的 histogram 序列，等价于 CalcMACD 返回值的第三个返回值。
// 供 tactical 等仅消费 histogram 的场景使用。
func CalcMACDHist(prices []float64) []float64 {
	_, _, hist := CalcMACD(prices)
	return hist
}

// CalcBollinger 计算布林带，返回 (upper, middle, lower) 三个序列。
//
// middle = SMA(prices, period)；std 为 period 内的总体标准差（除以 period）；
// upper/lower = middle ± mult * std。不足 period 的位置填 NaN。
func CalcBollinger(prices []float64, period int, mult float64) (upper, middle, lower []float64) {
	middle = CalcSMA(prices, period)
	upper = make([]float64, len(prices))
	lower = make([]float64, len(prices))
	for i := range upper {
		upper[i] = nan
		lower[i] = nan
	}
	for i := period - 1; i < len(prices); i++ {
		if math.IsNaN(middle[i]) {
			continue
		}
		variance := 0.0
		for j := i - period + 1; j <= i; j++ {
			variance += math.Pow(prices[j]-middle[i], 2)
		}
		std := math.Sqrt(variance / float64(period))
		upper[i] = middle[i] + mult*std
		lower[i] = middle[i] - mult*std
	}
	return
}

// CalcBollingerPctB 计算 (price - sma) / std 的 z-score 形式序列。
//
// 注意：此函数并非标准 Bollinger %B（(price - lower) / (upper - lower)），
// 而是历史 tactical 包使用的归一化偏离度。沿用此语义以避免回归。
// std == 0 的位置填 NaN；不足 period 的位置填 NaN。
func CalcBollingerPctB(prices []float64, period int) []float64 {
	sma := CalcSMA(prices, period)
	result := make([]float64, len(prices))
	for i := range result {
		result[i] = nan
	}
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
