package enginetest

import (
	"time"
)

func PriceData(tickers []string, bases []float64, start time.Time, days int, growth float64) map[string]map[string]float64 {
	priceData := make(map[string]map[string]float64, len(tickers))
	for idx, ticker := range tickers {
		prices := make(map[string]float64, days)
		base := bases[idx]
		for i := 0; i < days; i++ {
			date := start.AddDate(0, 0, i)
			if wd := date.Weekday(); wd == time.Saturday || wd == time.Sunday {
				continue
			}
			prices[date.Format("2006-01-02")] = base
			base *= 1 + growth
		}
		priceData[ticker] = prices
	}
	return priceData
}

func ThreeTickerData(start time.Time, days int, growth float64) map[string]map[string]float64 {
	return PriceData([]string{"VTI", "BND", "GLD"}, []float64{100, 50, 80}, start, days, growth)
}

func Dates(startDate string, n int) []string {
	t, _ := time.Parse("2006-01-02", startDate)
	dates := make([]string, n)
	for i := 0; i < n; i++ {
		dates[i] = t.AddDate(0, 0, i).Format("2006-01-02")
	}
	return dates
}

func PriceMap(startDate string, prices []float64) map[string]float64 {
	t, _ := time.Parse("2006-01-02", startDate)
	m := make(map[string]float64, len(prices))
	for i, p := range prices {
		m[t.AddDate(0, 0, i).Format("2006-01-02")] = p
	}
	return m
}

func SeriesPriceData(ticker string, dates []string, prices []float64) map[string]map[string]float64 {
	pd := map[string]map[string]float64{ticker: {}}
	for i, d := range dates {
		pd[ticker][d] = prices[i]
	}
	return pd
}

func LinearPriceData(ticker, startDate string, days int, startPrice, dailyGrowth float64) map[string]map[string]float64 {
	t, _ := time.Parse("2006-01-02", startDate)
	prices := make(map[string]float64, days)
	for i := 0; i < days; i++ {
		prices[t.AddDate(0, 0, i).Format("2006-01-02")] = startPrice * (1 + dailyGrowth*float64(i))
	}
	return map[string]map[string]float64{ticker: prices}
}

func VolatileAnnualReturns(n int) []float64 {
	annualReturns := make([]float64, n)
	for i := range annualReturns {
		annualReturns[i] = 0.08
	}
	for i := 0; i < n; i += 5 {
		annualReturns[i] = -0.15
	}
	return annualReturns
}

func UniformAnnualReturns(n int, rate float64) []float64 {
	annualReturns := make([]float64, n)
	for i := range annualReturns {
		annualReturns[i] = rate
	}
	return annualReturns
}
