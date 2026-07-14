package montecarlo

import (
	"slices"
	"sort"
)

// computePercentiles 计算各百分位路径
//
// 企业理由：百分位路径展示投资结果的概率分布，是蒙特卡洛模拟
// 最核心的可视化输出。投资者可直观看到最好/最坏/中间情况。
func computePercentiles(paths [][]float64, totalDays int) MCPercentiles {
	numSims := len(paths)
	if numSims == 0 {
		return MCPercentiles{}
	}

	p5 := make([]float64, totalDays)
	p10 := make([]float64, totalDays)
	p25 := make([]float64, totalDays)
	p50 := make([]float64, totalDays)
	p75 := make([]float64, totalDays)
	p90 := make([]float64, totalDays)
	p95 := make([]float64, totalDays)

	type pctTarget struct {
		pct float64
		dst *[]float64
	}
	targets := []pctTarget{
		{0.05, &p5}, {0.10, &p10}, {0.25, &p25}, {0.50, &p50},
		{0.75, &p75}, {0.90, &p90}, {0.95, &p95},
	}

	// 企业理由：对每个交易日，收集所有路径的值并排序取百分位
	values := make([]float64, numSims)
	for day := 0; day < totalDays; day++ {
		for i, path := range paths {
			values[i] = path[day]
		}
		slices.Sort(values)

		for _, t := range targets {
			idx := int(float64(numSims-1) * t.pct)
			if idx < 0 {
				idx = 0
			}
			if idx >= numSims {
				idx = numSims - 1
			}
			(*t.dst)[day] = values[idx]
		}
	}

	return MCPercentiles{
		P5: p5, P10: p10, P25: p25, P50: p50,
		P75: p75, P90: p90, P95: p95,
	}
}

// computeSuccessProbability 计算成功概率（基于阈值）
//
// 企业理由：成功概率展示投资组合在不同时间点达到目标值的可能性，
// 是退休规划中"能否退休"的核心判断依据。
func computeSuccessProbability(paths [][]float64, threshold float64, startingValue float64) []float64 {
	if len(paths) == 0 {
		return nil
	}
	totalDays := len(paths[0])
	target := startingValue * threshold
	result := make([]float64, totalDays)
	numSims := float64(len(paths))

	for day := 0; day < totalDays; day++ {
		success := 0
		for _, path := range paths {
			if path[day] >= target {
				success++
			}
		}
		result[day] = float64(success) / numSims
	}

	return result
}

// computeSuccessProbabilities 计算三种成功概率（按年采样）
//
// 企业理由：三种成功类型覆盖投资者最关心的场景：
// - survival：组合是否存活（价值 > 0），评估破产风险
// - capitalPreservation：是否保本（价值 >= 起始值），评估购买力保护
// - profit：是否盈利（价值 > 起始值），评估投资收益
// 按年采样减少数据量，与退休规划的年度评估周期对齐。
func computeSuccessProbabilities(paths [][]float64, startingValue float64, numYears int) MCSuccessProbabilities {
	if len(paths) == 0 {
		return MCSuccessProbabilities{}
	}

	survival := make([]float64, numYears)
	capitalPreservation := make([]float64, numYears)
	profit := make([]float64, numYears)
	n := float64(len(paths))
	pathLen := len(paths[0])

	for year := 1; year <= numYears; year++ {
		dayIdx := year*mcTradingDays - 1
		if dayIdx >= pathLen {
			dayIdx = pathLen - 1
		}

		survCount := 0
		capPresCount := 0
		profitCount := 0

		for _, path := range paths {
			val := path[dayIdx]
			if val > 0 {
				survCount++
			}
			if val >= startingValue {
				capPresCount++
			}
			if val > startingValue {
				profitCount++
			}
		}

		idx := year - 1
		survival[idx] = float64(survCount) / n
		capitalPreservation[idx] = float64(capPresCount) / n
		profit[idx] = float64(profitCount) / n
	}

	return MCSuccessProbabilities{
		Survival:            survival,
		CapitalPreservation: capitalPreservation,
		Profit:              profit,
	}
}

// computeFinalDistribution 计算最终价值分布直方图
//
// 企业理由：直方图展示模拟结束时组合价值的分布密度，
// 帮助投资者直观理解最终结果的集中度和尾部风险。
// 50 个分箱在精度和可读性之间取得平衡。
func computeFinalDistribution(paths [][]float64) []float64 {
	if len(paths) == 0 {
		return nil
	}

	// 收集最终价值
	finalValues := make([]float64, len(paths))
	for i, path := range paths {
		finalValues[i] = path[len(path)-1]
	}

	// 排序以确定范围
	sorted := make([]float64, len(finalValues))
	copy(sorted, finalValues)
	slices.Sort(sorted)

	minVal := sorted[0]
	maxVal := sorted[len(sorted)-1]

	// 企业理由：所有值相同时，集中在中间分箱
	if maxVal == minVal {
		result := make([]float64, mcHistogramBins)
		result[mcHistogramBins/2] = float64(len(paths))
		return result
	}

	binWidth := (maxVal - minVal) / float64(mcHistogramBins)
	result := make([]float64, mcHistogramBins)

	for _, v := range finalValues {
		bin := int((v - minVal) / binWidth)
		if bin >= mcHistogramBins {
			bin = mcHistogramBins - 1
		}
		if bin < 0 {
			bin = 0
		}
		result[bin]++
	}

	return result
}

// computeRepresentativePaths 计算代表性路径
//
// 企业理由：代表性路径从 1000+ 条模拟路径中选取 5 条典型路径，
// 便于可视化展示和快速理解结果范围。降采样到月度（每 21 天）
// 减少前端渲染压力，同时保留路径的主要形态特征。
func computeRepresentativePaths(paths [][]float64, totalDays int) MCRepresentativePaths {
	if len(paths) == 0 {
		return MCRepresentativePaths{}
	}

	// 按最终价值排序路径索引
	type pathIndex struct {
		idx        int
		finalValue float64
	}
	sorted := make([]pathIndex, len(paths))
	for i, path := range paths {
		sorted[i] = pathIndex{idx: i, finalValue: path[len(path)-1]}
	}
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].finalValue < sorted[j].finalValue
	})

	n := len(sorted)
	// 选取代表性路径索引
	worstIdx := 0
	p25Idx := int(float64(n) * 0.25)
	medianIdx := n / 2
	p75Idx := int(float64(n) * 0.75)
	bestIdx := n - 1

	return MCRepresentativePaths{
		Worst:  downsampleMonthly(paths[sorted[worstIdx].idx]),
		P25:    downsampleMonthly(paths[sorted[p25Idx].idx]),
		Median: downsampleMonthly(paths[sorted[medianIdx].idx]),
		P75:    downsampleMonthly(paths[sorted[p75Idx].idx]),
		Best:   downsampleMonthly(paths[sorted[bestIdx].idx]),
	}
}

// downsampleMonthly 将路径降采样到月度（每 21 个交易日取一个点），确保包含最后一个点。
func downsampleMonthly(path []float64) []float64 {
	result := make([]float64, 0, len(path)/21+1)
	for i := 0; i < len(path); i += 21 {
		result = append(result, path[i])
	}
	if len(path) > 0 && (len(path)-1)%21 != 0 {
		result = append(result, path[len(path)-1])
	}
	return result
}
