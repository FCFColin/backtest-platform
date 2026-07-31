// Package engine 提供回测核心计算逻辑。
package engine
import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"maps"
	"math"
	"slices"
	"time"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
)
func RunBacktest(ctx context.Context, req BacktestRequest) (*BacktestResult, error) {
	tradingDates, err := engineutil.ParseTradingDates(req.PriceData)
	if err != nil { return nil, fmt.Errorf("解析交易日失败: %w", err) }
	tradingDates = engineutil.FilterByDateRange(tradingDates, req.Params.StartDate, req.Params.EndDate)
	if len(tradingDates) == 0 { return nil, fmt.Errorf("日期范围内无交易数据") }
	assetTickers := slices.Sorted(maps.Keys(req.PriceData))
	benchmarkGrowth := computeBenchmarkGrowth(req.Params.BenchmarkTicker, req.PriceData, tradingDates, req.Params)
	portfolioResults := make([]PortfolioResult, 0, len(req.Portfolios))
	portfolioDailyReturns := make([][]float64, 0, len(req.Portfolios))
	for _, pf := range req.Portfolios {
		select { case <-ctx.Done(): return nil, ctx.Err(); default: }
		curve, allocHist, err := computeGrowthCurve(pf, req.PriceData, req.CPIData, req.ExchangeRates, tradingDates, req.Params)
		if err != nil { return nil, fmt.Errorf("组合 %s 计算失败: %w", pf.Name, err) }
		ddCurve := CalcDrawdownCurve(extractValues(curve), extractDates(curve))
		episodes := detectDrawdownEpisodes(curve)
		stats := computeStatistics(curve, episodes, benchmarkGrowth)
		rawRR := CalcRollingReturns(extractValues(curve), extractDates(curve), req.Params.RollingWindowMonths)
		rollingReturns := make([]DataPoint, len(rawRR))
		for i, r := range rawRR { rollingReturns[i] = DataPoint{Date: r.Date, Value: r.Return} }
		portfolioResults = append(portfolioResults, PortfolioResult{Name: pf.Name, GrowthCurve: curve, DrawdownCurve: ddCurve, RollingReturns: rollingReturns, AnnualReturns: annualReturnsFromCurve(curve), MonthlyReturns: monthlyReturnsFromCurve(curve), Statistics: stats, DrawdownEpisodes: episodes, AllocationHistory: allocHist})
		portfolioDailyReturns = append(portfolioDailyReturns, dailyReturns(extractValues(curve)))
	}
	correlations := CalcCorrelationMatrix(portfolioDailyReturns)
	assetDailyReturns := make([][]float64, 0, len(assetTickers))
	for _, ticker := range assetTickers { assetDailyReturns = append(assetDailyReturns, dailyReturns(engineutil.ExtractPrices(req.PriceData, ticker, tradingDates))) }
	assetCorrelations := CalcCorrelationMatrix(assetDailyReturns)
	result := &BacktestResult{Portfolios: portfolioResults, Correlations: correlations, BenchmarkGrowth: benchmarkGrowth, AssetTickers: assetTickers, AssetCorrelations: assetCorrelations}
	if req.Fingerprint {
		h := sha256.New()
		for i := range result.Portfolios {
			fp, err := ComputeFingerprint(&result.Portfolios[i])
			if err != nil { return nil, fmt.Errorf("计算指纹失败: %w", err) }
			h.Write([]byte(fp))
		}
		result.Fingerprint = hex.EncodeToString(h.Sum(nil))
	}
	return result, nil
}
func computeBenchmarkGrowth(benchmarkTicker string, priceData PriceDataMap, tradingDates []time.Time, params BacktestParams) []DataPoint {
	startValue := params.StartingValue
	if startValue <= 0 { startValue = 10000 }
	prices := engineutil.ExtractPrices(priceData, benchmarkTicker, tradingDates)
	if len(prices) < 2 || prices[0] <= 0 { return nil }
	curve := make([]DataPoint, len(prices))
	startPrice := prices[0]
	for i, p := range prices { curve[i] = DataPoint{Date: tradingDates[i].Format("2006-01-02"), Value: startValue * (p / startPrice)} }
	return curve
}
func dailyReturns(values []float64) []float64 {
	if len(values) < 2 { return nil }
	rets := make([]float64, 0, len(values)-1)
	for i := 1; i < len(values); i++ { if values[i-1] > 0 { rets = append(rets, (values[i]-values[i-1])/values[i-1]) } }
	return rets
}
func computeGrowthCurve(pf PortfolioInput, priceData PriceDataMap, cpiData map[string]float64, exchangeRates map[string]float64, tradingDates []time.Time, params BacktestParams) ([]DataPoint, []AllocationPoint, error) {
	startValue := params.StartingValue
	if startValue <= 0 { startValue = 10000 }
	n := len(pf.Assets)
	if n == 0 { return nil, nil, fmt.Errorf("组合 %s 无资产", pf.Name) }
	weights := normalizeWeights(pf.Assets)
	dates := make([]string, len(tradingDates))
	for i, d := range tradingDates { dates[i] = d.Format("2006-01-02") }
	if len(dates) == 0 { return nil, nil, fmt.Errorf("组合 %s 日期范围内无数据", pf.Name) }
	gp := func(ticker, date string) float64 { return getPriceWithFX(ticker, date, priceData, exchangeRates) }
	holdings := make([]float64, n)
	for i := range holdings { holdings[i] = startValue * weights[i] }
	initPrices := make([]float64, n)
	for i, a := range pf.Assets { initPrices[i] = gp(a.Ticker, dates[0]) }
	shares := make([]float64, n)
	for i := range shares { if initPrices[i] > 0 { shares[i] = holdings[i] / initPrices[i] } }
	lastPrices := make([]float64, n)
	dailyDrag := 1.0
	if pf.Drag > 0 { dailyDrag = math.Pow(1.0-pf.Drag/100.0, 1.0/float64(tradingDays)) }
	var glidepathTo []float64
	if len(pf.GlidepathToWeights) == n { glidepathTo = pf.GlidepathToWeights }
	glidepathYears := float64(pf.GlidepathYears)
	if glidepathYears == 0 { glidepathYears = 10 }
	otcMap := make(map[string]float64)
	for _, cf := range params.OneTimeCashflows { amt := cf.Amount; if cf.Type == "withdrawal" { amt = -amt }; if amt != 0 { otcMap[cf.Date] += amt } }
	cfMap, err := buildPeriodicCashflowMap(params.CashflowLegs, dates)
	if err != nil { return nil, nil, err }
	curve := make([]DataPoint, 0, len(dates)); allocHistory := make([]AllocationPoint, 0); vals := make([]float64, 0, len(dates))
	liquidated := false; prev := dates[0]; lastRebalanceDi := 0
	for di, date := range dates {
		if liquidated { curve, vals = appendZeroDay(curve, vals, date); prev = date; continue }
		for i, a := range pf.Assets {
			pr := gp(a.Ticker, date)
			if pr > 0 { lastPrices[i] = pr }
			eff := pr
			if eff <= 0 { eff = lastPrices[i] }
			if eff > 0 { holdings[i] = shares[i] * eff }
		}
		pv := mathutil.Sum(holdings)
		if dailyDrag != 1.0 { for i := range holdings { holdings[i] *= dailyDrag }; pv = mathutil.Sum(holdings) }
		currentWeights := glidepathWeights(weights, glidepathTo, di, glidepathYears)
		cfAmount := cfMap[date] + otcMap[date]
		if cfAmount != 0 {
			pv += cfAmount
			if pv <= 0 { liquidated = true; zeroHoldings(holdings); curve, vals = appendZeroDay(curve, vals, date); prev = date; continue }
			recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
		}
		if pv <= 0 { liquidated = true; zeroHoldings(holdings); curve, vals = appendZeroDay(curve, vals, date); prev = date; continue }
		if di > 0 && engineutil.ShouldRebalance(pf.RebalanceFrequency, prev, date, pf.RebalanceThreshold, holdings, currentWeights, pv, pf.RebalanceBands) {
			recalculateShares(holdings, &shares, lastPrices, currentWeights, pv, pf, gp, date)
			lastRebalanceDi = di
		}
		curve = append(curve, DataPoint{Date: date, Value: pv})
		vals = append(vals, pv)
		if di%20 == 0 || (di == lastRebalanceDi && di > 0) {
			snapshot := make([]float64, n)
			if pv > 0 { for i := range holdings { snapshot[i] = holdings[i] / pv } }
			allocHistory = append(allocHistory, AllocationPoint{Date: date, Weights: snapshot})
		}
		prev = date
	}
	adjustForInflation(curve, vals, dates, cpiData, params.AdjustForInflation)
	return curve, allocHistory, nil
}
func recalculateShares(holdings []float64, shares *[]float64, lastPrices []float64, currentWeights []float64, pv float64, pf PortfolioInput, gp func(string, string) float64, date string) {
	for i := range holdings { holdings[i] = pv * currentWeights[i] }
	for i, a := range pf.Assets {
		pr := gp(a.Ticker, date)
		if pr > 0 { lastPrices[i] = pr }
		eff := pr
		if eff <= 0 { eff = lastPrices[i] }
		if eff > 0 { (*shares)[i] = holdings[i] / eff } else { (*shares)[i] = 0 }
	}
}
func appendZeroDay(curve []DataPoint, vals []float64, date string) ([]DataPoint, []float64) { return append(curve, DataPoint{Date: date, Value: 0}), append(vals, 0) }
func zeroHoldings(holdings []float64) { for i := range holdings { holdings[i] = 0 } }
func computeStatistics(curve []DataPoint, episodes []DrawdownEpisode, benchCurve []DataPoint) Statistics {
	if len(curve) < 2 { return Statistics{} }
	values := extractValues(curve)
	dates := extractDates(curve)
	startValue := curve[0].Value
	endValue := curve[len(curve)-1].Value
	annualRets := annualReturnsFromCurve(curve)
	monthlyRets := monthlyReturnsFromCurve(curve)
	annualReturnValues := make([]float64, len(annualRets))
	for i, ar := range annualRets { annualReturnValues[i] = ar.Return }
	monthlyReturnValues := make([]float64, len(monthlyRets))
	for i, mr := range monthlyRets { monthlyReturnValues[i] = mr.Return }
	var benchDailyReturns []float64
	var benchmarkCagr *float64
	if len(benchCurve) >= 2 { benchDailyReturns = dailyReturns(extractValues(benchCurve)); c := CalcCAGR(benchCurve[0].Value, benchCurve[len(benchCurve)-1].Value, float64(len(benchCurve))/float64(tradingDays)); benchmarkCagr = &c }
	result := CalculateStatisticsFromRequest(StatisticsRequest{Values: values, Dates: dates, StartingValue: startValue, DailyReturns: dailyReturns(values), AnnualReturnValues: annualReturnValues, MonthlyReturnValues: monthlyReturnValues, MwrrCashflows: []Cashflow{{Value: -startValue, Time: 0}}, BenchmarkDailyReturns: benchDailyReturns, BenchmarkCagr: benchmarkCagr})
	if endValue <= 0 { result.MWRR = 0 }
	return result
}
func CalcCorrelationMatrix(dailyReturnsList [][]float64) [][]float64 {
	n := len(dailyReturnsList)
	matrix := make([][]float64, n)
	for i := range matrix { matrix[i] = make([]float64, n) }
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			if i == j { matrix[i][j] = 1 } else if j < i { matrix[i][j] = matrix[j][i] } else { matrix[i][j] = CalcCorrelation(dailyReturnsList[i], dailyReturnsList[j]) }
		}
	}
	return matrix
}
func annualReturnsFromCurve(curve []DataPoint) []AnnualReturn { if len(curve) < 2 { return nil }; return CalcAnnualReturns(extractValues(curve), extractDates(curve)) }
func monthlyReturnsFromCurve(curve []DataPoint) []MonthlyReturn { if len(curve) < 2 { return nil }; return CalcMonthlyReturns(extractValues(curve), extractDates(curve)) }
func extractValues(curve []DataPoint) []float64 { values := make([]float64, len(curve)); for i, dp := range curve { values[i] = dp.Value }; return values }
func extractDates(curve []DataPoint) []string { dates := make([]string, len(curve)); for i, dp := range curve { dates[i] = dp.Date }; return dates }
func getPriceWithFX(ticker, date string, priceData PriceDataMap, exchangeRates map[string]float64) float64 {
	raw := 0.0
	if td, ok := priceData[ticker]; ok { raw = td[date] }
	if raw <= 0 { return 0 }
	if len(exchangeRates) > 0 {
		if rate, ok := exchangeRates[date]; ok { return raw * rate }
		if d, err := time.Parse("2006-01-02", date); err == nil {
			search := d
			for k := 0; k < 10; k++ {
				search = search.AddDate(0, 0, -1)
				if rate, ok := exchangeRates[search.Format("2006-01-02")]; ok { return raw * rate }
			}
		}
	}
	return raw
}
func adjustForInflation(curve []DataPoint, vals []float64, dates []string, cpiData map[string]float64, enabled bool) {
	if !enabled || len(cpiData) == 0 { return }
	startCPI := findCPIForDate(dates[0], cpiData)
	if startCPI <= 0 { return }
	for i, date := range dates { if dateCPI := findCPIForDate(date, cpiData); dateCPI > 0 { curve[i].Value = vals[i] * (startCPI / dateCPI) } }
}
func glidepathWeights(initialWeights, targetWeights []float64, dayIndex int, glidepathYears float64) []float64 {
	n := len(initialWeights)
	result := make([]float64, n)
	if targetWeights == nil { copy(result, initialWeights); return result }
	progress := (float64(dayIndex) / float64(tradingDays)) / glidepathYears
	if progress > 1 { progress = 1 }
	for i := range result { result[i] = initialWeights[i] + (targetWeights[i]-initialWeights[i])*progress }
	return result
}
func normalizeWeights(assets []AssetInput) []float64 {
	raw := make([]float64, len(assets))
	for i, a := range assets { raw[i] = a.Weight / 100.0 }
	return engineutil.NormalizeWeights(raw)
}
func buildPeriodicCashflowMap(legs []CashflowLeg, dates []string) (map[string]float64, error) {
	m := make(map[string]float64)
	for _, leg := range legs {
		if leg.Amount == 0 { continue }
		amt := leg.Amount
		if leg.Type == "withdrawal" { amt = -amt }
		var freqDays int
		switch leg.Frequency {
		case "weekly": freqDays = 5
		case "monthly": freqDays = 21
		case "quarterly": freqDays = 63
		case "yearly": freqDays = 252
		default: return nil, fmt.Errorf("不支持的现金流频率 %q（支持：weekly/monthly/quarterly/yearly）", leg.Frequency)
		}
		until := leg.Until
		if until == "" { until = "9999-99-99" }
		nextIdx := 0
		for nextIdx < len(dates) {
			idx := nextIdx
			if idx+freqDays < len(dates) { nextIdx = idx + freqDays } else { break }
			if dates[nextIdx] > until { break }
			m[dates[nextIdx]] += amt
		}
	}
	return m, nil
}
func findCPIForDate(date string, cpiData map[string]float64) float64 {
	if v, ok := cpiData[date]; ok { return v }
	if len(date) < 7 { return 0 }
	monthStart := date[:7] + "-01"
	if v, ok := cpiData[monthStart]; ok { return v }
	if d, err := time.Parse("2006-01-02", date); err == nil {
		search := d
		for k := 0; k < 24; k++ {
			search = search.AddDate(0, 0, -1)
			key := search.Format("2006-01") + "-01"
			if v, ok := cpiData[key]; ok { return v }
		}
	}
	return 0
}
func ComputeFingerprint(result *PortfolioResult) (string, error) {
	h := sha256.New()
	encoder := json.NewEncoder(h)
	encoder.SetEscapeHTML(false)
	summary := map[string]any{"final_nav": result.Statistics.CAGR, "total_return": result.Statistics.TotalReturn, "sharpe": result.Statistics.Sharpe, "max_drawdown": result.Statistics.MaxDrawdown, "sortino": result.Statistics.Sortino, "stdev": result.Statistics.Stdev, "calmar": result.Statistics.Calmar}
	if err := encoder.Encode(summary); err != nil { return "", err }
	if err := encoder.Encode(map[string]any{"growth_sampled": sampleEvery(result.GrowthCurve, 20)}); err != nil { return "", err }
	return hex.EncodeToString(h.Sum(nil)), nil
}
func sampleEvery(curve []DataPoint, n int) []DataPoint {
	if len(curve) <= n { return curve }
	result := make([]DataPoint, n)
	step := float64(len(curve)-1) / float64(n-1)
	for i := 0; i < n; i++ {
		idx := int(float64(i) * step)
		if idx >= len(curve) { idx = len(curve) - 1 }
		result[i] = curve[idx]
	}
	return result
}
const drawdownThreshold = 0.05 // 5% 回撤阈值
func detectDrawdownEpisodes(curve []DataPoint) []DrawdownEpisode {
	if len(curve) < 2 { return nil }
	var episodes []DrawdownEpisode
	peakValue, troughValue := curve[0].Value, curve[0].Value
	peakDate, troughDate := curve[0].Date, curve[0].Date
	peakIdx, troughIdx := 0, 0
	inDrawdown := false
	for i := 1; i < len(curve); i++ {
		currentValue, currentDate := curve[i].Value, curve[i].Date
		if currentValue >= peakValue {
			if inDrawdown {
				drawdown := (peakValue - troughValue) / peakValue
				if drawdown >= drawdownThreshold {
					episodes = append(episodes, buildDrawdownEpisode(curve, peakIdx, troughIdx, i, peakDate, troughDate, currentDate, peakValue, troughValue, currentValue))
				}
				inDrawdown = false
			}
			peakValue = currentValue; peakDate = currentDate; peakIdx = i; troughValue = currentValue; troughDate = currentDate; troughIdx = i
		} else {
			if currentValue < troughValue { troughValue = currentValue; troughDate = currentDate; troughIdx = i }
			drawdown := (peakValue - currentValue) / peakValue
			if drawdown >= drawdownThreshold { inDrawdown = true }
		}
	}
	if inDrawdown {
		drawdown := (peakValue - troughValue) / peakValue
		if drawdown >= drawdownThreshold {
			lastIdx := len(curve) - 1
			episodes = append(episodes, buildDrawdownEpisode(curve, peakIdx, troughIdx, lastIdx, peakDate, troughDate, "", peakValue, troughValue, curve[lastIdx].Value))
		}
	}
	return episodes
}
func buildDrawdownEpisode(curve []DataPoint, peakIdx, troughIdx, recoveryIdx int, peakDate, troughDate, recoveryDate string, peakValue, troughValue, recoveryValue float64) DrawdownEpisode {
	timeToTrough := daysBetween(peakDate, troughDate)
	totalDays := daysBetween(peakDate, recoveryDate)
	if recoveryDate == "" { totalDays = daysBetween(peakDate, curve[recoveryIdx].Date) }
	var recoveryTime int
	var recoveryFactor float64
	if recoveryDate != "" && timeToTrough > 0 { recoveryTime = daysBetween(troughDate, recoveryDate); recoveryFactor = float64(recoveryTime) / float64(timeToTrough) }
	cagrDuring := calcCagrBetween(peakValue, recoveryValue, totalDays)
	ulcerDuring := calcUlcerDuring(curve, peakIdx, recoveryIdx, peakValue)
	returnFromPeakToTrough := 0.0
	if peakValue > 0 { returnFromPeakToTrough = (troughValue - peakValue) / peakValue }
	ep := DrawdownEpisode{PeakDate: peakDate, TroughDate: troughDate, RecoveryDate: recoveryDate, Depth: (peakValue - troughValue) / peakValue, TimeToTrough: timeToTrough, RecoveryTime: recoveryTime, TotalTimeDurationDays: totalDays, RecoveryFactor: recoveryFactor, CagrDuring: cagrDuring, UlcerDuring: ulcerDuring, ReturnFromPeakToTrough: returnFromPeakToTrough}
	if recoveryDate != "" && troughValue > 0 { retFromTrough := (recoveryValue - troughValue) / troughValue; ep.ReturnFromTroughToRecovery = &retFromTrough }
	return ep
}
func calcCagrBetween(startValue, endValue float64, days int) float64 { if days <= 0 || startValue <= 0 { return 0 }; years := float64(days) / 365.0; if endValue <= 0 { return -1 }; return math.Pow(endValue/startValue, 1.0/years) - 1 }
func calcUlcerDuring(curve []DataPoint, peakIdx, endIdx int, peakValue float64) float64 {
	if peakValue <= 0 || endIdx <= peakIdx { return 0 }
	var sumSquaredDD float64
	count := 0
	for i := peakIdx; i <= endIdx && i < len(curve); i++ {
		dd := (peakValue - curve[i].Value) / peakValue
		if dd < 0 { dd = 0 }
		sumSquaredDD += dd * dd
		count++
	}
	if count == 0 { return 0 }
	return math.Sqrt(sumSquaredDD / float64(count))
}
func daysBetween(dateStr1, dateStr2 string) int {
	t1, err1 := time.Parse("2006-01-02", dateStr1)
	t2, err2 := time.Parse("2006-01-02", dateStr2)
	if err1 != nil || err2 != nil { return 0 }
	days := int(t2.Sub(t1).Hours() / 24)
	if days < 0 { return -days }
	return days
}
