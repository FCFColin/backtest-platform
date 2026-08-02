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

func runSimulations(ctx context.Context, historicalReturns []float64, totalDays int, numSims int, mcParams MCSimParams, startingValue float64) [][]float64 {
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
func generatePath(path []float64, historicalReturns []float64, totalDays int, mcParams MCSimParams, startingValue float64, rng *mrand.Rand) {
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
