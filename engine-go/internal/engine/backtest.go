// Package engine 提供回测核心计算逻辑。
//
// 所有 JSON 字段使用 camelCase，与前端 TypeScript 接口一致。
package engine

import (
	"context"
	"fmt"
	"sort"
	"time"

	"engine-go/internal/engineutil"
)

// RunBacktest 执行完整回测，是引擎的主入口函数
//
// 企业理由：统一入口处理请求解析、增长曲线计算、统计指标计算、
// 相关性计算等所有步骤。
// 当 req.Fingerprint == true 时，对每个组合计算 SHA-256 指纹并填充到 BacktestResult.Fingerprint。
// ctx 用于 per-request 超时控制（handler 层 WithTimeout），在每个组合计算前检查取消信号。
func RunBacktest(ctx context.Context, req BacktestRequest) (*BacktestResult, error) {
	// 1. 解析并排序所有交易日
	tradingDates, err := engineutil.ParseTradingDates(req.PriceData)
	if err != nil {
		return nil, fmt.Errorf("解析交易日失败: %w", err)
	}

	// 2. 应用日期范围过滤
	tradingDates = engineutil.FilterByDateRange(tradingDates, req.Params.StartDate, req.Params.EndDate)
	if len(tradingDates) == 0 {
		return nil, fmt.Errorf("日期范围内无交易数据")
	}

	// 3. 收集所有资产 ticker
	assetTickers := collectAssetTickers(req.PriceData)
	sort.Strings(assetTickers)

	// 4. 计算基准增长曲线（用于 Alpha/Beta 等指标和最终结果展示）
	benchmarkGrowth := computeBenchmarkGrowth(req.Params.BenchmarkTicker, req.PriceData, tradingDates, req.Params)

	// 5. 计算每个组合的增长曲线
	portfolioResults := make([]PortfolioResult, 0, len(req.Portfolios))
	portfolioDailyReturns := make([][]float64, 0, len(req.Portfolios))

	for _, pf := range req.Portfolios {
		// 企业理由：每个组合计算可能耗时较长，循环开始前检查 ctx 是否已超时/取消，
		// 避免在已超时请求上继续消耗 CPU。
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		default:
		}
		curve, allocHist, err := computeGrowthCurve(pf, req.PriceData, req.CPIData, req.ExchangeRates, tradingDates, req.Params)
		if err != nil {
			return nil, fmt.Errorf("组合 %s 计算失败: %w", pf.Name, err)
		}

		ddCurve := CalcDrawdownCurve(extractValues(curve), extractDates(curve))
		episodes := detectDrawdownEpisodes(curve)

		stats := computeStatistics(curve, episodes, benchmarkGrowth)

		// 滚动收益——复用 CalcRollingReturns 并转换为 DataPoint
		rawRR := CalcRollingReturns(extractValues(curve), extractDates(curve), req.Params.RollingWindowMonths)
		rollingReturns := make([]DataPoint, len(rawRR))
		for i, r := range rawRR {
			rollingReturns[i] = DataPoint{Date: r.Date, Value: r.Return}
		}

		// 年度/月度收益
		annualRets := annualReturnsFromCurve(curve)
		monthlyRets := monthlyReturnsFromCurve(curve)

		portfolioResults = append(portfolioResults, PortfolioResult{
			Name:              pf.Name,
			GrowthCurve:       curve,
			DrawdownCurve:     ddCurve,
			RollingReturns:    rollingReturns,
			AnnualReturns:     annualRets,
			MonthlyReturns:    monthlyRets,
			Statistics:        stats,
			DrawdownEpisodes:  episodes,
			AllocationHistory: allocHist,
		})

		portfolioDailyReturns = append(portfolioDailyReturns, dailyReturns(extractValues(curve)))
	}

	// 5. 计算组合间相关性矩阵
	correlations := CalcCorrelationMatrix(portfolioDailyReturns)

	// 6. 计算资产间相关性矩阵
	assetDailyReturns := make([][]float64, 0, len(assetTickers))
	for _, ticker := range assetTickers {
		prices := engineutil.ExtractPrices(req.PriceData, ticker, tradingDates)
		assetDailyReturns = append(assetDailyReturns, dailyReturns(prices))
	}
	assetCorrelations := CalcCorrelationMatrix(assetDailyReturns)

	result := &BacktestResult{
		Portfolios:        portfolioResults,
		Correlations:      correlations,
		BenchmarkGrowth:   benchmarkGrowth,
		AssetTickers:      assetTickers,
		AssetCorrelations: assetCorrelations,
	}

	// 8. 计算确定性指纹（可选）
	if req.Fingerprint {
		fp, err := ComputeResultFingerprint(result)
		if err != nil {
			return nil, fmt.Errorf("计算指纹失败: %w", err)
		}
		result.Fingerprint = fp
	}

	return result, nil
}

// computeGrowthCurve, recalculateShares, zeroHoldings, getPriceWithFX,
// adjustForInflation, glidepathWeights, normalizeWeights,
// buildPeriodicCashflowMap, findCPIForDate
// 以上函数已拆分至 backtest_curve.go 和 backtest_helpers.go。

// computeBenchmarkGrowth 计算基准增长曲线
func computeBenchmarkGrowth(
	benchmarkTicker string,
	priceData PriceDataMap,
	tradingDates []time.Time,
	params BacktestParams,
) []DataPoint {
	startValue := params.StartingValue
	if startValue <= 0 {
		startValue = 10000
	}

	prices := engineutil.ExtractPrices(priceData, benchmarkTicker, tradingDates)
	if len(prices) < 2 || prices[0] <= 0 {
		return nil
	}

	curve := make([]DataPoint, len(prices))
	startPrice := prices[0]
	for i, p := range prices {
		value := startValue * (p / startPrice)
		curve[i] = DataPoint{
			Date:  tradingDates[i].Format("2006-01-02"),
			Value: value,
		}
	}
	return curve
}

// ============================================================
// 辅助函数
// ============================================================

// collectAssetTickers 收集所有资产 ticker
func collectAssetTickers(priceData PriceDataMap) []string {
	tickers := make(map[string]bool)
	for t := range priceData {
		tickers[t] = true
	}
	result := make([]string, 0, len(tickers))
	for t := range tickers {
		result = append(result, t)
	}
	return result
}

// dailyReturns 从价格/值序列计算日收益率
func dailyReturns(values []float64) []float64 {
	if len(values) < 2 {
		return nil
	}
	rets := make([]float64, 0, len(values)-1)
	for i := 1; i < len(values); i++ {
		if values[i-1] > 0 {
			rets = append(rets, (values[i]-values[i-1])/values[i-1])
		}
	}
	return rets
}

// computeStatistics, computeCorrelationMatrix, annualReturnsFromCurve,
// monthlyReturnsFromCurve, extractValues, extractDates
// 以上函数已拆分至 backtest_stats.go。
