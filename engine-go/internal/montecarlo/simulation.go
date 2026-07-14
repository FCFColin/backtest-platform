package montecarlo

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	mrand "math/rand"
	"runtime"
	"sync"
	"time"
)

// runSimulations 并行执行蒙特卡洛模拟
//
// 企业理由：蒙特卡洛模拟的各路径之间相互独立，天然适合并行计算。
// 使用 goroutine 并行可将模拟时间缩短为原来的 1/numCPU，
// 对 1000 次模拟的典型场景，从约 2 秒缩短到约 0.3 秒。
func runSimulations(
	ctx context.Context,
	historicalReturns []float64,
	totalDays int,
	numSims int,
	mcParams MCSimParams,
	startingValue float64,
) [][]float64 {
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
			// 企业理由：使用 crypto/rand 生成每个 goroutine 的独立种子，避免 math/rand 默认种子碰撞
			var seed int64
			var seedBuf [8]byte
			if _, err := rand.Read(seedBuf[:]); err == nil {
				seed = int64(binary.LittleEndian.Uint64(seedBuf[:]))
			} else {
				seed = time.Now().UnixNano() + int64(start)
			}
			rng := mrand.New(mrand.NewSource(seed))

			for i := start; i < start+n; i++ {
				select {
				case <-ctx.Done():
					return
				default:
				}
				path := make([]float64, totalDays)
				generatePath(path, historicalReturns, totalDays, mcParams, startingValue, rng)
				paths[i] = path
			}
		}(startIdx, count)
	}

	wg.Wait()
	return paths
}

// generatePath 生成单条蒙特卡洛模拟路径（块自助法）
//
// 企业理由：块自助法（Block Bootstrap）保留收益率序列的自相关结构，
// 比简单随机采样更准确地反映金融时间序列的持续性特征（如波动聚集）。
// 变长块进一步减少块边界处的结构断裂，提高模拟路径的真实性。
// 截断到边界（no wrap-around）避免环绕破坏时间序列的连续性。
func generatePath(
	path []float64,
	historicalReturns []float64,
	totalDays int,
	mcParams MCSimParams,
	startingValue float64,
	rng *mrand.Rand,
) {
	minBlockDays := mcParams.MinBlockYears * mcTradingDays
	maxBlockDays := mcParams.MaxBlockYears * mcTradingDays
	n := len(historicalReturns)

	if minBlockDays > n {
		minBlockDays = n
	}
	if maxBlockDays > n {
		maxBlockDays = n
	}

	simReturns := blockBootstrapSample(historicalReturns, totalDays, minBlockDays, maxBlockDays, rng)
	returnsToPath(path, simReturns, startingValue)
}

// blockBootstrapSample 使用块自助法从历史收益率中采样指定天数的收益率序列。
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

// returnsToPath 将收益率序列转换为价值路径。
func returnsToPath(path []float64, returns []float64, startingValue float64) {
	path[0] = startingValue
	for i := 1; i < len(path); i++ {
		path[i] = path[i-1] * (1.0 + returns[i-1])
		if path[i] < 0 {
			path[i] = 0
		}
	}
}
