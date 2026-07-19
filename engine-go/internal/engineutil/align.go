package engineutil

import "sort"

// AlignDates 返回所有 ticker 都有数据的日期交集（按升序排序）。
// 收口自 pca.alignDates / optimizer.collectAlignedDates / goaloptimizer 内联交集逻辑，
// 消除三处副本的行为漂移风险。若 tickers 为空、首个 ticker 无数据或无交集，返回 nil。
func AlignDates(tickers []string, priceData map[string]map[string]float64) []string {
	dateSets := make([]map[string]bool, len(tickers))
	for i, t := range tickers {
		ds := make(map[string]bool)
		if pd, ok := priceData[t]; ok {
			for d := range pd {
				ds[d] = true
			}
		}
		dateSets[i] = ds
	}
	if len(dateSets) == 0 || len(dateSets[0]) == 0 {
		return nil
	}
	var commonDates []string
	for d := range dateSets[0] {
		all := true
		for i := 1; i < len(dateSets); i++ {
			if !dateSets[i][d] {
				all = false
				break
			}
		}
		if all {
			commonDates = append(commonDates, d)
		}
	}
	sort.Strings(commonDates)
	return commonDates
}