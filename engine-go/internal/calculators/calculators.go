package calculators

import (
	"engine-go/internal/engine"
	"engine-go/internal/mathutil"
	"math"
	"math/rand"
)

type CAGRRequest struct {
	InitialAmount float64 `json:"initialAmount"`
	FinalAmount   float64 `json:"finalAmount"`
	Years         float64 `json:"years"`
}
type CAGRResult struct {
	CAGR        float64 `json:"cagr"`
	TotalReturn float64 `json:"totalReturn"`
	Multiplier  float64 `json:"multiplier"`
}

func CalcCAGR(req CAGRRequest) CAGRResult {
	if req.InitialAmount <= 0 || req.Years <= 0 {
		return CAGRResult{}
	}
	multiplier := req.FinalAmount / req.InitialAmount
	cagr := engine.CalcCAGR(req.InitialAmount, req.FinalAmount, req.Years)
	return CAGRResult{CAGR: cagr, TotalReturn: req.FinalAmount - req.InitialAmount, Multiplier: multiplier}
}

type SWRRequest struct {
	InitialAmount    float64 `json:"initialAmount"`
	AnnualWithdrawal float64 `json:"annualWithdrawal"`
	Years            float64 `json:"years"`
	MeanReturn       float64 `json:"meanReturn"`
	Stdev            float64 `json:"stdev"`
}
type SWRResult struct {
	SuccessRate    float64 `json:"successRate"`
	MinPortfolio   float64 `json:"minPortfolio"`
	MaxPortfolio   float64 `json:"maxPortfolio"`
	SafeWithdrawal float64 `json:"safeWithdrawal"`
}

const (
	maxSWRYears       = 100
	maxFrontierPoints = 1000
)

func CalcSWR(req SWRRequest) SWRResult {
	if req.InitialAmount <= 0 || req.Years <= 0 {
		return SWRResult{}
	}
	years := int(req.Years)
	if years > maxSWRYears {
		years = maxSWRYears
	}
	numSims := 1000
	survivalCount := 0
	minPort := math.Inf(1)
	maxPort := math.Inf(-1)
	rnd := rand.New(rand.NewSource(42))
	for s := 0; s < numSims; s++ {
		portfolio := req.InitialAmount
		for y := 0; y < years; y++ {
			ret := mathutil.GaussianRandom(rnd, req.MeanReturn, req.Stdev)
			portfolio = portfolio*(1+ret) - req.AnnualWithdrawal
			if portfolio <= 0 {
				portfolio = 0
				break
			}
		}
		if portfolio > 0 {
			survivalCount++
		}
		if portfolio < minPort {
			minPort = portfolio
		}
		if portfolio > maxPort {
			maxPort = portfolio
		}
	}
	successRate := float64(survivalCount) / float64(numSims)
	safe := req.InitialAmount * successRate * 0.9
	return SWRResult{SuccessRate: successRate, MinPortfolio: minPort, MaxPortfolio: maxPort, SafeWithdrawal: safe}
}

type TwoFundFrontierRequest struct {
	Asset1Return float64 `json:"asset1Return"`
	Asset1Stdev  float64 `json:"asset1Stdev"`
	Asset2Return float64 `json:"asset2Return"`
	Asset2Stdev  float64 `json:"asset2Stdev"`
	Correlation  float64 `json:"correlation"`
	NumPoints    int     `json:"numPoints"`
}
type FrontierPoint struct {
	Weight1 float64 `json:"weight1"`
	Weight2 float64 `json:"weight2"`
	Return  float64 `json:"return"`
	Stdev   float64 `json:"stdev"`
}

func CalcTwoFundFrontier(req TwoFundFrontierRequest) []FrontierPoint {
	n := req.NumPoints
	if n <= 0 {
		n = 20
	}
	if n > maxFrontierPoints {
		n = maxFrontierPoints
	}
	result := make([]FrontierPoint, n+1)
	for i := 0; i <= n; i++ {
		w1 := float64(i) / float64(n)
		w2 := 1 - w1
		portReturn := w1*req.Asset1Return + w2*req.Asset2Return
		variance := w1*w1*req.Asset1Stdev*req.Asset1Stdev +
			w2*w2*req.Asset2Stdev*req.Asset2Stdev +
			2*w1*w2*req.Correlation*req.Asset1Stdev*req.Asset2Stdev
		stdev := math.Sqrt(math.Max(0, variance))
		result[i] = FrontierPoint{Weight1: w1, Weight2: w2, Return: portReturn, Stdev: stdev}
	}
	return result
}
