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
