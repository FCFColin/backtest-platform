package engine

import (
	"fmt"
	"time"

	"engine-go/internal/engineutil"
)

// getPriceWithFX 获取资产价格并乘以当日汇率（如有），当日缺失时回溯最多 10 天。
func getPriceWithFX(ticker, date string, priceData PriceDataMap, exchangeRates map[string]float64) float64 {
	raw := 0.0
	if td, ok := priceData[ticker]; ok {
		raw = td[date]
	}
	if raw <= 0 {
		return 0
	}
	if len(exchangeRates) > 0 {
		if rate, ok := exchangeRates[date]; ok {
			return raw * rate
		}
		if d, err := time.Parse("2006-01-02", date); err == nil {
			search := d
			for k := 0; k < 10; k++ {
				search = search.AddDate(0, 0, -1)
				if rate, ok := exchangeRates[search.Format("2006-01-02")]; ok {
					return raw * rate
				}
			}
		}
	}
	return raw
}

// normalizeWeights 将资产权重从百分比转为小数并归一化，总和为 0 时退化为等权重。
// 归一化逻辑委托至 engineutil.NormalizeWeights（spec Wave 4 Task 4.1：消除与
// tactical 包的重复实现），本函数仅负责 AssetInput → []float64 的提取与百分比转换。
// glidepathWeights 计算当日目标权重（glidepath 线性插值），无 glidepath 时返回原始权重。
// adjustForInflation 用 CPI 将名义净值折算为实际净值（基期为首个交易日）。
func adjustForInflation(curve []DataPoint, vals []float64, dates []string, cpiData map[string]float64, enabled bool) {
	if !enabled || len(cpiData) == 0 {
		return
	}
	startCPI := findCPIForDate(dates[0], cpiData)
	if startCPI <= 0 {
		return
	}
	for i, date := range dates {
		dateCPI := findCPIForDate(date, cpiData)
		if dateCPI > 0 {
			curve[i].Value = vals[i] * (startCPI / dateCPI)
		}
	}
}

func glidepathWeights(initialWeights, targetWeights []float64, dayIndex int, glidepathYears float64) []float64 {
	n := len(initialWeights)
	result := make([]float64, n)
	if targetWeights == nil {
		copy(result, initialWeights)
		return result
	}
	progress := (float64(dayIndex) / float64(tradingDays)) / glidepathYears
	if progress > 1 {
		progress = 1
	}
	for i := range result {
		result[i] = initialWeights[i] + (targetWeights[i]-initialWeights[i])*progress
	}
	return result
}

func normalizeWeights(assets []AssetInput) []float64 {
	raw := make([]float64, len(assets))
	for i, a := range assets {
		raw[i] = a.Weight / 100.0
	}
	return engineutil.NormalizeWeights(raw)
}

// sumFloat 求浮点切片之和。
func sumFloat(xs []float64) float64 {
	s := 0.0
	for _, x := range xs {
		s += x
	}
	return s
}

// buildPeriodicCashflowMap 将周期性现金流腿展开为 日期 -> 净金额 映射。
//
// 企业理由：按交易日步长（周 5/月 21/
// 季 63/年 252）推进，从首个步长处开始计入，withdrawal 取负，until 之后停止。
func buildPeriodicCashflowMap(legs []CashflowLeg, dates []string) (map[string]float64, error) {
	m := make(map[string]float64)
	for _, leg := range legs {
		if leg.Amount == 0 {
			continue
		}
		amt := leg.Amount
		if leg.Type == "withdrawal" {
			amt = -amt
		}
		var freqDays int
		switch leg.Frequency {
		case "weekly":
			freqDays = 5
		case "monthly":
			freqDays = 21
		case "quarterly":
			freqDays = 63
		case "yearly":
			freqDays = 252
		default:
			return nil, fmt.Errorf("不支持的现金流频率 %q（支持：weekly/monthly/quarterly/yearly）", leg.Frequency)
		}
		until := leg.Until
		if until == "" {
			until = "9999-99-99"
		}
		nextIdx := 0
		for nextIdx < len(dates) {
			idx := nextIdx
			if idx+freqDays < len(dates) {
				nextIdx = idx + freqDays
			} else {
				break
			}
			if dates[nextIdx] > until {
				break
			}
			m[dates[nextIdx]] += amt
		}
	}
	return m, nil
}

// findCPIForDate 查找给定日期对应的 CPI 值（月度数据）。
//
// 企业理由：先精确匹配，再尝试同月 1 号，
// 最后逐日回溯最多 24 个月查找最近月份的 CPI 值。
func findCPIForDate(date string, cpiData map[string]float64) float64 {
	if v, ok := cpiData[date]; ok {
		return v
	}
	if len(date) < 7 {
		return 0
	}
	monthStart := date[:7] + "-01"
	if v, ok := cpiData[monthStart]; ok {
		return v
	}
	if d, err := time.Parse("2006-01-02", date); err == nil {
		search := d
		for k := 0; k < 24; k++ {
			search = search.AddDate(0, 0, -1)
			key := search.Format("2006-01") + "-01"
			if v, ok := cpiData[key]; ok {
				return v
			}
		}
	}
	return 0
}
