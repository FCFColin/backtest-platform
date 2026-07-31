// Package mathutil 提供共享的统计与随机数工具函数。
package mathutil

import (
	"math"
	"math/rand"
	"sort"
)

func Mean(arr []float64) float64 {
	if len(arr) == 0 {
		return 0
	}
	return Sum(arr) / float64(len(arr))
}
func Sum(arr []float64) float64 {
	sum := 0.0
	for _, v := range arr {
		sum += v
	}
	return sum
}
func Std(arr []float64) float64 {
	if len(arr) < 2 {
		return 0
	}
	m := Mean(arr)
	varSum := 0.0
	for _, v := range arr {
		diff := v - m
		varSum += diff * diff
	}
	return math.Sqrt(varSum / float64(len(arr)-1))
}
func Percentile(arr []float64, p float64) float64 {
	if len(arr) == 0 {
		return 0
	}
	sorted := make([]float64, len(arr))
	copy(sorted, arr)
	sort.Float64s(sorted)
	if p < 0 {
		p = 0
	} else if p > 1 {
		p = 1
	}
	idx := int(float64(len(sorted)) * p)
	if idx >= len(sorted) {
		idx = len(sorted) - 1
	}
	if idx < 0 {
		idx = 0
	}
	return sorted[idx]
}
func GaussianRandom(rnd *rand.Rand, mean, std float64) float64 {
	u1 := rnd.Float64()
	if u1 < 1e-10 {
		u1 = 1e-10
	}
	u2 := rnd.Float64()
	z := math.Sqrt(-2*math.Log(u1)) * math.Cos(2*math.Pi*u2)
	return mean + std*z
}
func Covariance(x, y []float64) float64 {
	n := len(x)
	if n == 0 || len(y) != n {
		return 0
	}
	meanX := Mean(x)
	meanY := Mean(y)
	cov := 0.0
	for i := 0; i < n; i++ {
		cov += (x[i] - meanX) * (y[i] - meanY)
	}
	if n < 2 {
		return cov
	}
	return cov / float64(n-1)
}

// DailyReturns 计算价格序列的日收益率；前一日价格非正时跳过该日。
func DailyReturns(prices []float64) []float64 {
	if len(prices) < 2 {
		return nil
	}
	rets := make([]float64, 0, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		if prices[i-1] > 0 {
			rets = append(rets, (prices[i]-prices[i-1])/prices[i-1])
		}
	}
	return rets
}

// DailyReturnsWithZeros 计算价格序列的日收益率；前一日价格非正时补 0（保持与输入等长）。
func DailyReturnsWithZeros(prices []float64) []float64 {
	if len(prices) < 2 {
		return nil
	}
	rets := make([]float64, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		if prices[i-1] > 0 {
			rets[i-1] = (prices[i] - prices[i-1]) / prices[i-1]
		}
	}
	return rets
}

// DownsideDeviation 计算下行偏差：低于目标收益率 mar 的超额收益平方均值开方。
func DownsideDeviation(returns []float64, mar float64) float64 {
	if len(returns) == 0 {
		return 0
	}
	var sumSquared float64
	for _, r := range returns {
		if excess := r - mar; excess < 0 {
			sumSquared += excess * excess
		}
	}
	return math.Sqrt(sumSquared / float64(len(returns)))
}

// Histogram 将 values 等宽分箱（binCount 箱），返回各箱计数与区间端点。
func Histogram(values []float64, binCount int) (counts []int, minVal, maxVal float64) {
	if len(values) == 0 || binCount <= 0 {
		return nil, 0, 0
	}
	minVal, maxVal = values[0], values[0]
	for _, v := range values[1:] {
		if v < minVal {
			minVal = v
		}
		if v > maxVal {
			maxVal = v
		}
	}
	counts = make([]int, binCount)
	if maxVal == minVal {
		counts[0] = len(values)
		return counts, minVal, maxVal
	}
	binWidth := (maxVal - minVal) / float64(binCount)
	for _, v := range values {
		bin := int((v - minVal) / binWidth)
		if bin >= binCount {
			bin = binCount - 1
		}
		if bin < 0 {
			bin = 0
		}
		counts[bin]++
	}
	return counts, minVal, maxVal
}
