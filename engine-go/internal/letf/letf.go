// Package letf 提供杠杆 ETF 滑点分析功能。
package letf

import (
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"errors"
	"math"
	"sort"
)

const (
	tradingDaysPerYear      = engineutil.TradingDaysPerYear
	effectiveLeverageWindow = 20
)

type SlippagePoint struct {
	Date     string  `json:"date"`
	Slippage float64 `json:"slippage"`
}
type LETFStats struct {
	BenchmarkReturn float64 `json:"benchmarkReturn"`
	LETFReturn      float64 `json:"letfReturn"`
	ExpectedReturn  float64 `json:"expectedReturn"`
	Slippage        float64 `json:"slippage"`
}
type LETFResult struct {
	SlippageCurve     []SlippagePoint `json:"slippageCurve"`
	AnnualDecay       float64         `json:"annualDecay"`
	EffectiveLeverage []*float64      `json:"effectiveLeverage"`
	Stats             LETFStats       `json:"stats"`
}
type LETFRequest struct {
	LETFSeries  []PricePoint `json:"letfSeries"`
	BenchSeries []PricePoint `json:"benchSeries"`
	Leverage    float64      `json:"leverage"`
}
type PricePoint struct {
	Date  string  `json:"date"`
	Price float64 `json:"price"`
}

func alignSeries(letfSeries, benchSeries []PricePoint) []alignedPoint {
	benchMap := make(map[string]float64)
	for _, p := range benchSeries {
		benchMap[p.Date] = p.Price
	}
	var aligned []alignedPoint
	for _, p := range letfSeries {
		if benchPrice, ok := benchMap[p.Date]; ok {
			aligned = append(aligned, alignedPoint{Date: p.Date, LETFPrice: p.Price, BenchPrice: benchPrice})
		}
	}
	return aligned
}

type alignedPoint struct {
	Date       string
	LETFPrice  float64
	BenchPrice float64
}

func calcDailyReturn(prev, curr float64) float64 {
	if prev != 0 {
		return (curr - prev) / prev
	}
	return 0
}
func calcRollingBeta(letfReturns, benchReturns []float64) (float64, bool) {
	n := effectiveLeverageWindow
	if len(letfReturns) < n {
		return 0, false
	}
	start := len(letfReturns) - n
	letfTail := letfReturns[start : start+n]
	benchTail := benchReturns[start : start+n]
	varBench := mathutil.Covariance(benchTail, benchTail)
	if varBench > 0 {
		return mathutil.Covariance(letfTail, benchTail) / varBench, true
	}
	return 0, false
}
func AnalyzeSlippage(req LETFRequest) (*LETFResult, error) {
	aligned := alignSeries(req.LETFSeries, req.BenchSeries)
	if len(aligned) < 2 {
		return nil, errors.New("有效价格数据不足，至少需要 2 个交易日")
	}
	var slippageCurve []SlippagePoint
	var effectiveLeverage []*float64
	cumBench := 1.0
	cumLetf := 1.0
	cumExpected := 1.0
	var letfReturns []float64
	var benchReturns []float64
	for i := 1; i < len(aligned); i++ {
		prev := aligned[i-1]
		curr := aligned[i]
		benchRet := calcDailyReturn(prev.BenchPrice, curr.BenchPrice)
		letfRet := calcDailyReturn(prev.LETFPrice, curr.LETFPrice)
		expectedRet := benchRet * req.Leverage
		cumBench *= 1 + benchRet
		cumLetf *= 1 + letfRet
		cumExpected *= 1 + expectedRet
		cumSlippage := cumExpected - cumLetf
		slippageCurve = append(slippageCurve, SlippagePoint{Date: curr.Date, Slippage: cumSlippage})
		letfReturns = append(letfReturns, letfRet)
		benchReturns = append(benchReturns, benchRet)
		if len(letfReturns) >= effectiveLeverageWindow {
			beta, ok := calcRollingBeta(letfReturns, benchReturns)
			if ok {
				v := beta
				effectiveLeverage = append(effectiveLeverage, &v)
			} else {
				effectiveLeverage = append(effectiveLeverage, nil)
			}
		} else {
			effectiveLeverage = append(effectiveLeverage, nil)
		}
	}
	benchmarkReturn := cumBench - 1
	letfReturn := cumLetf - 1
	expectedReturn := cumExpected - 1
	slippage := expectedReturn - letfReturn
	years := float64(len(aligned)-1) / tradingDaysPerYear
	annualDecay := 0.0
	if years > 0 && cumExpected > 0 && cumLetf > 0 {
		expectedAnnual := math.Pow(cumExpected, 1/years) - 1
		letfAnnual := math.Pow(cumLetf, 1/years) - 1
		annualDecay = expectedAnnual - letfAnnual
	}
	return &LETFResult{
		SlippageCurve: slippageCurve, AnnualDecay: annualDecay, EffectiveLeverage: effectiveLeverage,
		Stats: LETFStats{BenchmarkReturn: benchmarkReturn, LETFReturn: letfReturn,
			ExpectedReturn: expectedReturn, Slippage: slippage,
		},
	}, nil
}
func ToPricePoints(tickerData map[string]float64) []PricePoint {
	var result []PricePoint
	for date, price := range tickerData {
		if price > 0 && !math.IsNaN(price) {
			result = append(result, PricePoint{Date: date, Price: price})
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].Date < result[j].Date })
	return result
}
