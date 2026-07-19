// Package mathutil 提供共享的统计与随机数工具函数。
//
// 企业理由（T-ARCH-4.2）：goaloptimizer 和 calculators 此前各自维护
// mean/std/percentile/gaussianRandom 本地副本，造成口径分裂。本包统一
// 这些基础数学工具，确保跨包统计口径一致（spec Wave 4 Task 4.2.3）。
package mathutil

import (
	"math"
	"math/rand"
	"sort"
)

// Mean 计算算术平均值。空切片返回 0。
func Mean(arr []float64) float64 {
	if len(arr) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range arr {
		sum += v
	}
	return sum / float64(len(arr))
}

// Std 计算样本标准差（除以 n-1）。元素数 < 2 时返回 0。
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

// Percentile 返回排序后第 p 分位数的值（p ∈ [0, 1]）。
// 空切片返回 0。p 越界会被裁剪到 [0, 1]。
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

// GaussianRandom 使用 Box-Muller 变换生成正态分布随机数。
// rnd 由调用方提供以保留可复现性（如 rand.New(rand.NewSource(42))）。
func GaussianRandom(rnd *rand.Rand, mean, std float64) float64 {
	u1 := rnd.Float64()
	if u1 < 1e-10 {
		u1 = 1e-10
	}
	u2 := rnd.Float64()
	z := math.Sqrt(-2*math.Log(u1)) * math.Cos(2*math.Pi*u2)
	return mean + std*z
}
