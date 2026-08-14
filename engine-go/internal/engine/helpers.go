package engine

import (
	"engine-go/internal/engineutil"
	"math"
	"time"
)

func extractValues(curve []DataPoint) []float64 {
	values := make([]float64, len(curve))
	for i, dp := range curve {
		values[i] = dp.Value
	}
	return values
}
func extractDates(curve []DataPoint) []string {
	dates := make([]string, len(curve))
	for i, dp := range curve {
		dates[i] = dp.Date
	}
	return dates
}
func getPriceWithFX(ticker, date string, priceData PriceDataMap, exchangeRates map[string]float64) float64 {
	raw := 0.0
	if td, ok := priceData[ticker]; ok {
		raw = td[date]
	}
	if raw <= 0 || math.IsNaN(raw) || math.IsInf(raw, 0) {
		return 0
	}
	if len(exchangeRates) > 0 {
		if rate, ok := lookupBackdated(date, exchangeRates, 10, func(t time.Time) string { return t.Format("2006-01-02") }); ok {
			return raw * rate
		}
	}
	return raw
}
func lookupBackdated(date string, data map[string]float64, maxDays int, key func(time.Time) string) (float64, bool) {
	if v, ok := data[date]; ok {
		return v, true
	}
	if d, err := time.Parse("2006-01-02", date); err == nil {
		search := d
		for k := 0; k < maxDays; k++ {
			search = search.AddDate(0, 0, -1)
			if v, ok := data[key(search)]; ok {
				return v, true
			}
		}
	}
	return 0, false
}
func adjustForInflation(curve []DataPoint, vals []float64, dates []string, cpiData map[string]float64, enabled bool) {
	if !enabled || len(cpiData) == 0 {
		return
	}
	startCPI := findCPIForDate(dates[0], cpiData)
	if startCPI <= 0 {
		return
	}
	for i, date := range dates {
		if dateCPI := findCPIForDate(date, cpiData); dateCPI > 0 {
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
	progress := (float64(dayIndex) / tradingDaysPerYear) / glidepathYears
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
func findCPIForDate(date string, cpiData map[string]float64) float64 {
	if len(date) < 7 {
		return 0
	}
	if v, ok := lookupBackdated(date, cpiData, 24, func(t time.Time) string { return t.Format("2006-01") + "-01" }); ok {
		return v
	}
	return 0
}
