package mathutil

import (
	"math"
	"math/rand"
	"sort"
)

func Sum(arr []float64) float64 {
	sum := 0.0
	for _, v := range arr {
		sum += v
	}
	return sum
}
func Percentile(arr []float64, p float64) float64 {
	if len(arr) == 0 {
		return 0
	}
	sorted := make([]float64, len(arr))
	copy(sorted, arr)
	sort.Float64s(sorted)
	p = math.Max(0, math.Min(1, p))
	return sorted[min(len(sorted)-1, int(float64(len(sorted))*p))]
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
func DailyReturns(prices []float64) []float64 {
	if len(prices) < 2 {
		return nil
	}
	rets := make([]float64, 0, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		if prices[i-1] > 0 {
			rets = append(rets, dailyReturn(prices[i-1], prices[i], nextPrice(prices, i+1)))
		}
	}
	return rets
}
func DailyReturnsWithZeros(prices []float64) []float64 {
	if len(prices) < 2 {
		return nil
	}
	rets := make([]float64, len(prices)-1)
	for i := 1; i < len(prices); i++ {
		if prices[i-1] > 0 {
			rets[i-1] = dailyReturn(prices[i-1], prices[i], nextPrice(prices, i+1))
		}
	}
	return rets
}

// dailyReturn 把 0 视为缺失而非真实清零：后续仍有报价判定为缺口（记 0），否则为清算（记 -100%）。
func dailyReturn(prev, cur, next float64) float64 {
	if cur > 0 {
		return (cur - prev) / prev
	}
	if next > 0 {
		return 0
	}
	return -1.0
}
func nextPrice(prices []float64, i int) float64 {
	if i < len(prices) {
		return prices[i]
	}
	return 0
}

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
