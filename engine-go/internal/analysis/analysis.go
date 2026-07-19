// Package analysis 提供单资产分析功能（T-ARCH-2.5）。
// 企业理由：将分析逻辑从 Node.js 降级引擎迁移到 Go，
// 利用 Go 的计算性能和并发能力，为前端提供低延迟的单资产分析 API。
// 复用 engine 包的统计计算函数，确保与 TypeScript 降级引擎指标口径一致。
package analysis

import (
	"context"
	"math"
	"sort"

	"engine-go/internal/engine"
)

// AnalysisRequest 单资产分析请求。
// 企业理由：与前端 TypeScript BacktestParameters 保持字段对应，
// priceData 由前端传入避免 Go 服务直接访问文件系统，保持无状态设计。
type AnalysisRequest struct {
	Tickers   []string                       `json:"tickers"`
	PriceData map[string]map[string]float64  `json:"priceData"` // ticker -> date -> price
	Params    AnalysisParams                 `json:"params"`
}

// AnalysisParams 分析参数。
type AnalysisParams struct {
	StartDate            string  `json:"startDate"`
	EndDate              string  `json:"endDate"`
	StartingValue        float64 `json:"startingValue"`
	AdjustForInflation   bool    `json:"adjustForInflation"`
	RollingWindowMonths  int     `json:"rollingWindowMonths"`
	BenchmarkTicker      string  `json:"benchmarkTicker"`
}

// AnalysisResult 单资产分析结果。
type AnalysisResult struct {
	Assets       []AssetAnalysisItem `json:"assets"`
	Correlations [][]float64         `json:"correlations"`
}

// AssetAnalysisItem 单个资产的分析结果。
// 企业理由：与前端 TypeScript AssetAnalysisItem 类型一一对应，
// JSON 序列化后可直接被前端消费，无需额外映射层。
type AssetAnalysisItem struct {
	Ticker         string                `json:"ticker"`
	GrowthCurve    []engine.DataPoint    `json:"growthCurve"`
	DrawdownCurve  []engine.DrawdownPoint `json:"drawdownCurve"`
	DailyReturns   []float64             `json:"dailyReturns"`
	AnnualReturns  []engine.AnnualReturn `json:"annualReturns"`
	MonthlyReturns []engine.MonthlyReturn `json:"monthlyReturns"`
	RollingReturns []engine.RollingReturn `json:"rollingReturns"`
	Statistics     engine.Statistics     `json:"statistics"`
}

// RunAnalysis 执行单资产分析。
// 企业理由：核心算法与 TypeScript runAnalysis 保持一致：
// 1. 对每个 ticker：归一化价格 price/basePrice * startingValue → 净值曲线
// 2. 计算回撤曲线、日收益率、年度/月度收益、滚动收益
// 3. 计算完整 Statistics（复用 engine 包函数）
// 4. 计算所有 ticker 间日收益率的相关性矩阵
// 5. 注意：基准相关指标（alpha/beta）为零，因为无基准比较
// ctx 用于 per-request 超时控制（handler 层 WithTimeout），在每个 ticker 计算前检查取消信号。
func RunAnalysis(ctx context.Context, req AnalysisRequest) (AnalysisResult, error) {
	if len(req.Tickers) == 0 {
		return AnalysisResult{}, nil
	}

	// 默认参数
	startingValue := req.Params.StartingValue
	if startingValue <= 0 {
		startingValue = 10000
	}
	rollingWindowMonths := req.Params.RollingWindowMonths
	if rollingWindowMonths <= 0 {
		rollingWindowMonths = 12
	}

	// 获取所有交易日期（排序去重）
	dates := getSortedDates(req.PriceData, req.Tickers)

	// 过滤日期范围
	filteredDates := filterDates(dates, req.Params.StartDate, req.Params.EndDate)

	// 预计算每个 ticker 的价格序列和日收益率
	type tickerData struct {
		prices []float64
		dates  []string
		returns []float64
	}
	tickerMap := make(map[string]*tickerData, len(req.Tickers))

	for _, ticker := range req.Tickers {
		prices, priceDates := extractPrices(req.PriceData, ticker, filteredDates)
		if len(prices) < 2 {
			tickerMap[ticker] = &tickerData{prices: prices, dates: priceDates, returns: nil}
			continue
		}
		returns := engine.CalcDailyReturns(prices)
		tickerMap[ticker] = &tickerData{prices: prices, dates: priceDates, returns: returns}
	}

	// 计算每个资产的分析结果
	assets := make([]AssetAnalysisItem, 0, len(req.Tickers))
	for _, ticker := range req.Tickers {
		// 企业理由：每个 ticker 的统计计算可能耗时较长，循环开始前检查 ctx 是否已超时/取消。
		select {
		case <-ctx.Done():
			return AnalysisResult{}, ctx.Err()
		default:
		}
		td := tickerMap[ticker]
		if td == nil || len(td.prices) < 2 {
			assets = append(assets, AssetAnalysisItem{
				Ticker:     ticker,
				Statistics: engine.Statistics{},
			})
			continue
		}

		prices := td.prices
		priceDates := td.dates
		dailyReturns := td.returns

		// 1. 净值曲线：归一化价格 price/basePrice * startingValue
		basePrice := prices[0]
		values := make([]float64, len(prices))
		growthCurve := make([]engine.DataPoint, len(prices))
		for i, p := range prices {
			values[i] = (p / basePrice) * startingValue
			growthCurve[i] = engine.DataPoint{
				Date:  priceDates[i],
				Value: values[i],
			}
		}

		// 2. 回撤曲线
		drawdownCurve := engine.CalcDrawdownCurve(values, priceDates)

		// 3. 滚动收益
		rollingReturns := engine.CalcRollingReturns(values, priceDates, rollingWindowMonths)

		// 4. 年度收益
		annualReturns := engine.CalcAnnualReturns(values, priceDates)

		// 5. 月度收益
		monthlyReturns := engine.CalcMonthlyReturns(values, priceDates)

		// 6. 统计指标
		years := float64(len(prices)) / 252.0
		cagr := engine.CalcCAGR(prices[0], prices[len(prices)-1], years)
		stdev := engine.CalcAnnualizedStdev(dailyReturns)
		mdResult := engine.CalcMaxDrawdown(values)
		avgDrawdown := engine.CalcAvgDrawdown(values)
		ulcerIndex := engine.CalcUlcerIndex(values)
		calmar := engine.CalcCalmar(cagr, mdResult.MaxDrawdown)
		upi := engine.CalcUPI(cagr, ulcerIndex)
		sortino := engine.CalcSortino(cagr, dailyReturns)
		skewness := engine.CalcSkewness(dailyReturns)
		excessKurtosis := engine.CalcExcessKurtosis(dailyReturns)

		// 年度/月度收益纯数值数组
		annualReturnValues := make([]float64, len(annualReturns))
		for i, ar := range annualReturns {
			annualReturnValues[i] = ar.Return
		}
		monthlyReturnValues := make([]float64, len(monthlyReturns))
		for i, mr := range monthlyReturns {
			monthlyReturnValues[i] = mr.Return
		}

		// MWRR：当前仅使用初始投入和期末价值
		finalValue := values[len(values)-1]
		var mwrr float64
		if finalValue > 0 {
			mwrr = engine.CalcMWRR([]struct {
				Value float64
				Time  float64
			}{
				{Value: -startingValue, Time: 0},
				{Value: finalValue, Time: years},
			})
		} else {
			mwrr = -1
		}

		// 企业理由：基准相关指标（alpha/beta/rSquared/trackingError/informationRatio/
		// upsideCapture/downsideCapture）在单资产分析中无基准，全部为零。
		// 这与 TypeScript runAnalysis 中无 benchmarkTicker 时的行为一致。

		// VaR / CVaR (95% 置信度)
		var5 := engine.CalcVaR(dailyReturns, 0.95)
		cvar5 := engine.CalcCVaR(dailyReturns, 0.95)

		// 辅助指标
		totalReturn := engine.CalcTotalReturn(prices[0], prices[len(prices)-1])
		pctPositiveDays := 0.0
		if len(dailyReturns) > 0 {
			positiveCount := 0
			for _, r := range dailyReturns {
				if r > 0 {
					positiveCount++
				}
			}
			pctPositiveDays = float64(positiveCount) / float64(len(dailyReturns))
		}
		maxDailyReturn := 0.0
		minDailyReturn := 0.0
		if len(dailyReturns) > 0 {
			maxDailyReturn = dailyReturns[0]
			minDailyReturn = dailyReturns[0]
			for _, r := range dailyReturns[1:] {
				if r > maxDailyReturn {
					maxDailyReturn = r
				}
				if r < minDailyReturn {
					minDailyReturn = r
				}
			}
		}

		// PWR（永续提款率）
		pwr := engine.CalcPWR(annualReturnValues)

		avgYear := 0.0
		if len(annualReturnValues) > 0 {
			sum := 0.0
			for _, r := range annualReturnValues {
				sum += r
			}
			avgYear = sum / float64(len(annualReturnValues))
		}

		statistics := engine.Statistics{
			CAGR:                  cagr,
			MWRR:                  mwrr,
			Stdev:                 stdev,
			Sharpe:                engine.CalcSharpe(cagr, stdev),
			Sortino:               sortino,
			MaxDrawdown:           mdResult.MaxDrawdown,
			MaxDrawdownDuration:   mdResult.MaxDrawdownDuration,
			BestYear:              engine.CalcBestYear(annualReturnValues),
			WorstYear:             engine.CalcWorstYear(annualReturnValues),
			AvgYear:               avgYear,
			TotalReturn:           totalReturn,
			MaxMonthlyReturn:      engine.CalcBestMonth(monthlyReturnValues),
			MinMonthlyReturn:      engine.CalcWorstMonth(monthlyReturnValues),
			AvgDrawdown:           avgDrawdown,
			UlcerIndex:            ulcerIndex,
			Calmar:                calmar,
			UlcerPerformanceIndex: upi,
			Beta:                  0, // 企业理由：无基准，beta 为零
			Alpha:                 0, // 企业理由：无基准，alpha 为零
			RSquared:              0,
			TrackingError:         0,
			InformationRatio:      0,
		UpsideCapture:         0,
		DownsideCapture:       0,
		MaxDailyReturn:        maxDailyReturn,
		MinDailyReturn:        minDailyReturn,
		PWR:                   pwr,
		Var: engine.VaRByFrequency{
			Daily:   engine.VaRLevels{One: engine.CalcVaR(dailyReturns, 0.99), Five: var5, Ten: engine.CalcVaR(dailyReturns, 0.90)},
			Monthly: engine.VaRLevels{},
			Annual:  engine.VaRLevels{},
		},
		Cvar: engine.VaRByFrequency{
			Daily:   engine.VaRLevels{One: engine.CalcCVaR(dailyReturns, 0.99), Five: cvar5, Ten: engine.CalcCVaR(dailyReturns, 0.90)},
			Monthly: engine.VaRLevels{},
			Annual:  engine.VaRLevels{},
		},
		Skewness: engine.SkewnessByFrequency{
			Daily:   skewness,
			Monthly: 0,
			Annual:  0,
		},
		ExcessKurtosis: engine.SkewnessByFrequency{
			Daily:   excessKurtosis,
			Monthly: 0,
			Annual:  0,
		},
		WinRate: engine.SkewnessByFrequency{
			Daily:   pctPositiveDays,
			Monthly: 0,
			Annual:  0,
		},
		PctPositiveDays: pctPositiveDays,
	}

		assets = append(assets, AssetAnalysisItem{
			Ticker:         ticker,
			GrowthCurve:    growthCurve,
			DrawdownCurve:  drawdownCurve,
			DailyReturns:   dailyReturns,
			AnnualReturns:  annualReturns,
			MonthlyReturns: monthlyReturns,
			RollingReturns: rollingReturns,
			Statistics:     statistics,
		})
	}

	// 计算相关性矩阵
	n := len(req.Tickers)
	correlations := make([][]float64, n)
	for i := range correlations {
		correlations[i] = make([]float64, n)
	}
	for i := 0; i < n; i++ {
		for j := 0; j < n; j++ {
			if i == j {
				correlations[i][j] = 1
			} else if j < i {
				correlations[i][j] = correlations[j][i]
			} else {
				retI := tickerMap[req.Tickers[i]].returns
				retJ := tickerMap[req.Tickers[j]].returns
				if retI != nil && retJ != nil {
					correlations[i][j] = engine.CalcCorrelation(retI, retJ)
				}
			}
		}
	}

	return AnalysisResult{
		Assets:       assets,
		Correlations: correlations,
	}, nil
}

// getSortedDates 获取所有交易日期（排序去重）。
// 企业理由：与 TypeScript getSortedDates 算法一致，
// 从所有 ticker 的价格数据中提取日期并排序。
func getSortedDates(priceData map[string]map[string]float64, tickers []string) []string {
	dateSet := make(map[string]struct{})
	for _, ticker := range tickers {
		if td, ok := priceData[ticker]; ok {
			for date := range td {
				dateSet[date] = struct{}{}
			}
		}
	}
	dates := make([]string, 0, len(dateSet))
	for d := range dateSet {
		dates = append(dates, d)
	}
	sort.Strings(dates)
	return dates
}

// filterDates 过滤日期范围（空字符串视为不限制）。
// 企业理由：与 TypeScript filterDates 行为一致。
func filterDates(dates []string, startDate, endDate string) []string {
	if startDate == "" && endDate == "" {
		return dates
	}
	result := make([]string, 0, len(dates))
	for _, d := range dates {
		if startDate != "" && d < startDate {
			continue
		}
		if endDate != "" && d > endDate {
			continue
		}
		result = append(result, d)
	}
	return result
}

// extractPrices 从 priceData 中提取指定 ticker 在给定日期序列上的价格。
// 企业理由：返回价格数组和对应的日期数组，跳过无数据的日期，
// 确保价格和日期一一对应。
func extractPrices(priceData map[string]map[string]float64, ticker string, dates []string) ([]float64, []string) {
	td, ok := priceData[ticker]
	if !ok {
		return nil, nil
	}
	prices := make([]float64, 0, len(dates))
	priceDates := make([]string, 0, len(dates))
	for _, d := range dates {
		if p, exists := td[d]; exists && p > 0 && !math.IsNaN(p) && !math.IsInf(p, 0) {
			prices = append(prices, p)
			priceDates = append(priceDates, d)
		}
	}
	return prices, priceDates
}
