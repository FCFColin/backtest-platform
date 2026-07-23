package engine

// CalcSWR 计算安全提款率（Safe Withdrawal Rate）。
// 对给定年限years，使用滚动窗口法，找到使successRate比例的窗口不耗尽的最大提款率。
// annualReturns: 年收益率序列
// years: 提款期年限
// successRate: 成功率（0.95表示95%的窗口不耗尽）
func CalcSWR(annualReturns []float64, years int, successRate float64) float64 {
	if len(annualReturns) < years || years <= 0 {
		return 0
	}

	low, high := 0.0, 1.0
	for i := 0; i < 100; i++ {
		mid := (low + high) / 2
		if rollingWindowSuccessRate(annualReturns, years, mid) >= successRate {
			low = mid
		} else {
			high = mid
		}
		if high-low < 1e-8 {
			break
		}
	}
	return low
}

// CalcPWRYears 计算指定期限的永续提款率（Perpetual Withdrawal Rate）。
// 对给定年限years，找到使100%滚动窗口都不耗尽的最大提款率。
func CalcPWRYears(annualReturns []float64, years int) float64 {
	return CalcSWR(annualReturns, years, 1.0)
}

// rollingWindowSuccessRate 计算给定提款率在滚动窗口下的成功率。
func rollingWindowSuccessRate(annualReturns []float64, years int, withdrawalRate float64) float64 {
	numWindows := len(annualReturns) - years + 1
	if numWindows <= 0 {
		return 0
	}
	successes := 0
	for start := 0; start < numWindows; start++ {
		window := annualReturns[start : start+years]
		if simulateWithdrawal(window, withdrawalRate) {
			successes++
		}
	}
	return float64(successes) / float64(numWindows)
}

// CalcPWRAllYears 批量计算10/20/30/40年的PWR和SWR。
func CalcPWRAllYears(annualReturns []float64) (pwr10y, swr10y, pwr20y, swr20y, pwr30y, swr30y, pwr40y, swr40y float64) {
	if len(annualReturns) >= 10 {
		pwr10y = CalcPWRYears(annualReturns, 10)
		swr10y = CalcSWR(annualReturns, 10, 0.95)
	}
	if len(annualReturns) >= 20 {
		pwr20y = CalcPWRYears(annualReturns, 20)
		swr20y = CalcSWR(annualReturns, 20, 0.95)
	}
	if len(annualReturns) >= 30 {
		pwr30y = CalcPWRYears(annualReturns, 30)
		swr30y = CalcSWR(annualReturns, 30, 0.95)
	}
	if len(annualReturns) >= 40 {
		pwr40y = CalcPWRYears(annualReturns, 40)
		swr40y = CalcSWR(annualReturns, 40, 0.95)
	}
	return
}
