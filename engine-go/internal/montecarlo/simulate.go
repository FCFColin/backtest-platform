package montecarlo

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"math"
	mrand "math/rand"
	"runtime"
	"sort"
	"sync"
	"time"
)

func runSimulations(ctx context.Context, historicalReturns []float64, totalDays int, numSims int, mcParams MCSimParams, startingValue float64) [][]float64 {
	var baseSeed int64
	if mcParams.Seed != nil {
		baseSeed = *mcParams.Seed
	} else {
		var seedBuf [8]byte
		if _, err := rand.Read(seedBuf[:]); err == nil {
			baseSeed = int64(binary.LittleEndian.Uint64(seedBuf[:]) >> 1)
		} else {
			baseSeed = time.Now().UnixNano()
		}
	}
	numCPU := runtime.NumCPU()
	if numCPU > numSims {
		numCPU = numSims
	}
	if numCPU < 1 {
		numCPU = 1
	}
	paths := make([][]float64, numSims)
	var wg sync.WaitGroup
	simsPerWorker := numSims / numCPU
	extra := numSims % numCPU
	idx := 0
	for w := 0; w < numCPU; w++ {
		count := simsPerWorker
		if w < extra {
			count++
		}
		if count == 0 {
			continue
		}
		startIdx := idx
		idx += count
		wg.Add(1)
		go func(start, n int) {
			defer wg.Done()
			for i := start; i < start+n; i++ {
				select {
				case <-ctx.Done():
					return
				default:
				}
				// 每条路径独立 RNG（种子 = baseSeed + 全局 sim 索引），
				// 固定 seed 时结果与 CPU 核数无关、可复现；未指定 seed 时 baseSeed 随机
				rng := mrand.New(mrand.NewSource(baseSeed + int64(i)))
				path := make([]float64, totalDays)
				generatePath(path, historicalReturns, totalDays, mcParams, startingValue, rng)
				paths[i] = path
			}
		}(startIdx, count)
	}
	wg.Wait()
	return paths
}
func generatePath(path []float64, historicalReturns []float64, totalDays int, mcParams MCSimParams, startingValue float64, rng *mrand.Rand) {
	minBlockDays := mcParams.MinBlockYears * mcTradingDays
	maxBlockDays := mcParams.MaxBlockYears * mcTradingDays
	pool, weights := prepareSamplingPool(historicalReturns, mcParams.EstimationMethod)
	n := len(pool)
	if minBlockDays > n {
		minBlockDays = n
	}
	if maxBlockDays > n {
		maxBlockDays = n
	}
	if weights != nil && len(weights) != n { // 防御：权重与池长度失配时回退均匀
		weights = nil
	}
	simReturns := blockBootstrapSampleWeighted(pool, totalDays, minBlockDays, maxBlockDays, rng, weights)
	returnsToPath(path, simReturns, startingValue)
}

// U-3：估计法预处理——返回采样池与可选起点权重（nil=均匀）。
func prepareSamplingPool(hist []float64, method string) ([]float64, []float64) {
	switch method {
	case "trimmed":
		return trimmedPool(hist, 0.05), nil
	case "ewWeighted":
		return hist, ewWeights(len(hist), ewHalfLifeDays)
	default:
		return hist, nil
	}
}

const ewHalfLifeDays = 126

// trimmedPool 两端各裁 ratio 比例的极值观测（需排序副本，保持其余顺序无关紧要——池仅用于随机截取）。
func trimmedPool(hist []float64, ratio float64) []float64 {
	n := len(hist)
	trim := int(float64(n) * ratio)
	if n == 0 || trim*2 >= n {
		return hist
	}
	sorted := append([]float64(nil), hist...)
	sort.Float64s(sorted)
	kept := sorted[trim : n-trim]
	minV, maxV := kept[0], kept[len(kept)-1]
	out := make([]float64, 0, len(hist))
	for _, v := range hist {
		if v >= minV && v <= maxV {
			out = append(out, v)
		}
	}
	if len(out) == 0 {
		return hist
	}
	return out
}

// ewWeights 指数加权：w_i ∝ λ^(i)，i=n-1 为最新观测（半衰期 λ^hl=0.5）。
func ewWeights(n int, halfLife float64) []float64 {
	if n <= 0 {
		return nil
	}
	lambda := math.Pow(0.5, 1/halfLife)
	w := make([]float64, n)
	total := 0.0
	for i := range w {
		w[i] = math.Pow(lambda, float64(n-1-i))
		total += w[i]
	}
	for i := range w {
		w[i] /= total
	}
	return w
}

// weightedStartIndex 按累积权重抽样起点（weights 为空时退化为均匀分布）。
func weightedStartIndex(rng *mrand.Rand, n int, weights []float64) int {
	if len(weights) == 0 {
		return rng.Intn(n)
	}
	x := rng.Float64()
	cum := 0.0
	for i, w := range weights {
		cum += w
		if x <= cum {
			return i
		}
	}
	return n - 1
}

func blockBootstrapSampleWeighted(historicalReturns []float64, totalDays int, minBlockDays, maxBlockDays int, rng *mrand.Rand, weights []float64) []float64 {
	n := len(historicalReturns)
	result := make([]float64, 0, totalDays)
	for len(result) < totalDays {
		blockLen := minBlockDays
		if maxBlockDays > minBlockDays {
			blockLen = minBlockDays + rng.Intn(maxBlockDays-minBlockDays+1)
		}
		startPos := weightedStartIndex(rng, n, weights)
		end := startPos + blockLen
		if end > n {
			end = n
		}
		result = append(result, historicalReturns[startPos:end]...)
	}
	return result[:totalDays]
}
func blockBootstrapSample(historicalReturns []float64, totalDays int, minBlockDays, maxBlockDays int, rng *mrand.Rand) []float64 {
	n := len(historicalReturns)
	result := make([]float64, 0, totalDays)
	for len(result) < totalDays {
		blockLen := minBlockDays
		if maxBlockDays > minBlockDays {
			blockLen = minBlockDays + rng.Intn(maxBlockDays-minBlockDays+1)
		}
		startPos := rng.Intn(n)
		end := startPos + blockLen
		if end > n {
			end = n
		}
		result = append(result, historicalReturns[startPos:end]...)
	}
	return result[:totalDays]
}
func returnsToPath(path []float64, returns []float64, startingValue float64) {
	path[0] = startingValue
	for i := 1; i < len(path); i++ {
		path[i] = path[i-1] * (1.0 + returns[i-1])
		if path[i] < 0 {
			path[i] = 0
		}
	}
}
