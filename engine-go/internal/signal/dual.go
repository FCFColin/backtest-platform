package signal

import "sort"

// ===== 双信号组合 =====

// buildSignalDirMap 构建日期→信号方向映射。
func buildSignalDirMap(signals []SignalPoint) map[string]SignalDir {
	m := make(map[string]SignalDir)
	for _, s := range signals {
		m[s.Date] = s.Type
	}
	return m
}

// combineDir 按组合方式合并两个信号方向。
func combineDir(s1, s2 *SignalDir, method string) *SignalDir {
	switch method {
	case "and":
		if s1 != nil && s2 != nil && *s1 == *s2 {
			r := *s1
			return &r
		}
		return nil
	case "or":
		if s1 != nil {
			return s1
		}
		return s2
	case "xor":
		if s1 != nil && s2 == nil {
			return s1
		}
		if s2 != nil && s1 == nil {
			return s2
		}
		return nil
	}
	return nil
}

// AnalyzeDualSignal 执行双信号分析。
func AnalyzeDualSignal(cfg1, cfg2 SignalAnalysisRequest, data1, data2 []PricePoint, combinationMethod string) DualSignalResult {
	result1 := AnalyzeSignal(cfg1, data1)
	result2 := AnalyzeSignal(cfg2, data2)

	map1 := buildSignalDirMap(result1.Signals)
	map2 := buildSignalDirMap(result2.Signals)

	dateSet := make(map[string]bool)
	for d := range map1 {
		dateSet[d] = true
	}
	for d := range map2 {
		dateSet[d] = true
	}
	allDates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		allDates = append(allDates, d)
	}
	sort.Strings(allDates)

	priceMap := make(map[string]float64)
	for _, d := range data1 {
		priceMap[d.Date] = d.Price
	}

	var comparison []ComparisonEntry
	var combinedSignals []SignalPoint

	for _, date := range allDates {
		var s1, s2 *SignalDir
		if v, ok := map1[date]; ok {
			s1 = &v
		}
		if v, ok := map2[date]; ok {
			s2 = &v
		}
		combined := combineDir(s1, s2, combinationMethod)
		entry := ComparisonEntry{Date: date, Signal1: s1, Signal2: s2, Combined: combined}
		comparison = append(comparison, entry)
		if combined != nil {
			if price, ok := priceMap[date]; ok {
				combinedSignals = append(combinedSignals, SignalPoint{Date: date, Type: *combined, Price: price})
			}
		}
	}

	combinedStats := calcStatistics(combinedSignals)
	equityCurve, maxDD, sharpe := calcEquityCurve(combinedSignals, data1)
	combinedStats.MaxDrawdown = maxDD
	combinedStats.Sharpe = sharpe

	return DualSignalResult{
		Signal1:    result1,
		Signal2:    result2,
		Combined:   SignalAnalysisResult{Signals: combinedSignals, Statistics: combinedStats, EquityCurve: equityCurve},
		Comparison: comparison,
	}
}
