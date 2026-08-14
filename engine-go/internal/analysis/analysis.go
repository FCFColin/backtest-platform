package analysis

import (
	"context"
	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
)

type AnalysisRequest struct {
	Tickers   []string                      `json:"tickers"`
	PriceData map[string]map[string]float64 `json:"priceData"` // ticker -> date -> price
	Params    AnalysisParams                `json:"params"`
}
type AnalysisParams struct {
	StartDate           string  `json:"startDate"`
	EndDate             string  `json:"endDate"`
	StartingValue       float64 `json:"startingValue"`
	RollingWindowMonths int     `json:"rollingWindowMonths"`
}
type AnalysisResult struct {
	Assets       []AssetAnalysisItem `json:"assets"`
	Correlations [][]float64         `json:"correlations"`
}
type AssetAnalysisItem struct {
	Ticker         string                 `json:"ticker"`
	GrowthCurve    []engine.DataPoint     `json:"growthCurve"`
	DrawdownCurve  []engine.DrawdownPoint `json:"drawdownCurve"`
	DailyReturns   []float64              `json:"dailyReturns"`
	AnnualReturns  []engine.AnnualReturn  `json:"annualReturns"`
	MonthlyReturns []engine.MonthlyReturn `json:"monthlyReturns"`
	RollingReturns []engine.RollingReturn `json:"rollingReturns"`
	Statistics     engine.Statistics      `json:"statistics"`
}

func RunAnalysis(ctx context.Context, req AnalysisRequest) (AnalysisResult, error) {
	if len(req.Tickers) == 0 {
		return AnalysisResult{}, nil
	}
	startingValue := engineutil.DefaultStartingValue(req.Params.StartingValue)
	rollingWindowMonths := req.Params.RollingWindowMonths
	if rollingWindowMonths <= 0 {
		rollingWindowMonths = 12
	}
	dates := engineutil.GetSortedDates(req.PriceData, req.Tickers)
	filteredDates := engineutil.FilterDates(dates, req.Params.StartDate, req.Params.EndDate)
	type tickerData struct {
		prices  []float64
		dates   []string
		returns []float64
	}
	tickerMap := make(map[string]*tickerData, len(req.Tickers))
	for _, ticker := range req.Tickers {
		prices, priceDates := extractPrices(req.PriceData, ticker, filteredDates)
		if len(prices) < 2 {
			tickerMap[ticker] = &tickerData{prices: prices, dates: priceDates, returns: nil}
			continue
		}
		returns := mathutil.DailyReturns(prices)
		tickerMap[ticker] = &tickerData{prices: prices, dates: priceDates, returns: returns}
	}
	assets := make([]AssetAnalysisItem, 0, len(req.Tickers))
	for _, ticker := range req.Tickers {
		select {
		case <-ctx.Done():
			return AnalysisResult{}, ctx.Err()
		default:
		}
		td := tickerMap[ticker]
		if td == nil || len(td.prices) < 2 {
			assets = append(assets, AssetAnalysisItem{Ticker: ticker, Statistics: engine.Statistics{}})
			continue
		}
		prices := td.prices
		priceDates := td.dates
		dailyReturns := td.returns
		basePrice := prices[0]
		values := make([]float64, len(prices))
		growthCurve := make([]engine.DataPoint, len(prices))
		for i, p := range prices {
			values[i] = (p / basePrice) * startingValue
			growthCurve[i] = engine.DataPoint{Date: priceDates[i], Value: values[i]}
		}
		drawdownCurve := engine.CalcDrawdownCurve(values, priceDates)
		rollingReturns := engine.CalcRollingReturns(values, priceDates, rollingWindowMonths)
		annualReturns := engine.CalcAnnualReturns(values, priceDates)
		monthlyReturns := engine.CalcMonthlyReturns(values, priceDates)
		annualReturnValues := make([]float64, len(annualReturns))
		for i, ar := range annualReturns {
			annualReturnValues[i] = ar.Return
		}
		monthlyReturnValues := make([]float64, len(monthlyReturns))
		for i, mr := range monthlyReturns {
			monthlyReturnValues[i] = mr.Return
		}
		statistics := engine.CalculateStatisticsFromRequest(engine.StatisticsRequest{
			Values: values, Dates: priceDates, StartingValue: startingValue,
			DailyReturns: dailyReturns, AnnualReturnValues: annualReturnValues,
			MonthlyReturnValues: monthlyReturnValues,
			MwrrCashflows:       []engine.Cashflow{{Value: -startingValue, Time: 0}}})
		assets = append(assets, AssetAnalysisItem{Ticker: ticker, GrowthCurve: growthCurve,
			DrawdownCurve: drawdownCurve, DailyReturns: dailyReturns, AnnualReturns: annualReturns,
			MonthlyReturns: monthlyReturns, RollingReturns: rollingReturns, Statistics: statistics})
	}
	returnsList := make([][]float64, len(req.Tickers))
	for i, t := range req.Tickers {
		td := tickerMap[t]
		if td != nil {
			returnsList[i] = td.returns
		}
	}
	correlations := engine.CalcCorrelationMatrix(returnsList)
	return AnalysisResult{Assets: assets, Correlations: correlations}, nil
}
func extractPrices(priceData map[string]map[string]float64, ticker string, dates []string) ([]float64, []string) {
	prices := make([]float64, 0, len(dates))
	priceDates := make([]string, 0, len(dates))
	for _, date := range dates {
		if price, ok := priceData[ticker][date]; ok {
			prices = append(prices, price)
			priceDates = append(priceDates, date)
		}
	}
	return prices, priceDates
}
