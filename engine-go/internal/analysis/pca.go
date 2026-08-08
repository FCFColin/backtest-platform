package analysis

import (
	"engine-go/internal/engineutil"
	"engine-go/internal/mathutil"
	"errors"
	"gonum.org/v1/gonum/mat"
	"sort"
)

type PCAResult struct {
	Eigenvalues        []float64   `json:"eigenvalues"`
	CumulativeVariance []float64   `json:"cumulativeVariance"`
	Loadings           [][]float64 `json:"loadings"`
	Scores             [][]float64 `json:"scores"`
	Tickers            []string    `json:"tickers"`
}
type PCARequest struct {
	Tickers       []string                      `json:"tickers"`
	PriceData     map[string]map[string]float64 `json:"priceData"`
	NumComponents *int                          `json:"numComponents,omitempty"`
}

func PerformPCA(req PCARequest) (*PCAResult, error) {
	tickers := req.Tickers
	priceData := req.PriceData
	commonDates := engineutil.AlignDates(tickers, priceData)
	if len(commonDates) < 2 {
		return nil, engineutil.NewInputError("有效价格数据不足，至少需要 2 个交易日")
	}
	nTickers := len(tickers)
	nDates := len(commonDates)
	nReturns := nDates - 1
	returns := make([][]float64, nTickers)
	for j := 0; j < nTickers; j++ {
		col := make([]float64, nDates)
		for i, d := range commonDates {
			col[i] = priceData[tickers[j]][d]
		}
		returns[j] = mathutil.DailyReturnsWithZeros(col)
	}
	stdReturns := make([][]float64, nTickers)
	stds := make([]float64, nTickers)
	for j := 0; j < nTickers; j++ {
		stds[j] = mathutil.Std(returns[j])
		if stds[j] == 0 {
			stds[j] = 1
		}
		mean := mathutil.Mean(returns[j])
		stdReturns[j] = make([]float64, nReturns)
		for i := range stdReturns[j] {
			stdReturns[j][i] = (returns[j][i] - mean) / stds[j]
		}
	}
	cov := make([][]float64, nTickers)
	for j := range cov {
		cov[j] = make([]float64, nTickers)
		for k := 0; k < nTickers; k++ {
			cov[j][k] = mathutil.Covariance(stdReturns[j], stdReturns[k])
		}
	}
	covFlat := make([]float64, nTickers*nTickers)
	for i := 0; i < nTickers; i++ {
		for j := 0; j < nTickers; j++ {
			covFlat[i*nTickers+j] = cov[i][j]
		}
	}
	covSym := mat.NewSymDense(nTickers, covFlat)
	var es mat.EigenSym
	if !es.Factorize(covSym, true) {
		return nil, errors.New("协方差矩阵特征值分解失败")
	}
	rawEigenvalues := es.Values(nil)
	var rawEigen mat.Dense
	es.VectorsTo(&rawEigen)
	rawEigenvectors := make([][]float64, nTickers)
	for i := 0; i < nTickers; i++ {
		rawEigenvectors[i] = make([]float64, nTickers)
		for j := 0; j < nTickers; j++ {
			rawEigenvectors[i][j] = rawEigen.At(i, j)
		}
	}
	type eigenPair struct {
		val float64
		idx int
	}
	pairs := make([]eigenPair, nTickers)
	for i := 0; i < nTickers; i++ {
		pairs[i] = eigenPair{val: rawEigenvalues[i], idx: i}
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].val > pairs[j].val })
	sortedEigenvalues := make([]float64, nTickers)
	sortedEigenvectors := make([][]float64, nTickers)
	for i := 0; i < nTickers; i++ {
		sortedEigenvectors[i] = make([]float64, nTickers)
	}
	for compIdx := 0; compIdx < nTickers; compIdx++ {
		srcIdx := pairs[compIdx].idx
		sortedEigenvalues[compIdx] = pairs[compIdx].val
		for tickerIdx := 0; tickerIdx < nTickers; tickerIdx++ {
			sortedEigenvectors[tickerIdx][compIdx] = rawEigenvectors[tickerIdx][srcIdx]
		}
	}
	totalVar := 0.0
	for _, v := range sortedEigenvalues {
		if v > 0 {
			totalVar += v
		}
	}
	cumulativeVariance := make([]float64, nTickers)
	cumSum := 0.0
	for i, v := range sortedEigenvalues {
		if v > 0 {
			cumSum += v
		}
		if totalVar > 0 {
			cumulativeVariance[i] = cumSum / totalVar
		}
	}
	scores := make([][]float64, nReturns)
	for i := 0; i < nReturns; i++ {
		scores[i] = make([]float64, nTickers)
		for compIdx := 0; compIdx < nTickers; compIdx++ {
			sum := 0.0
			for j := 0; j < nTickers; j++ {
				sum += stdReturns[j][i] * sortedEigenvectors[j][compIdx]
			}
			scores[i][compIdx] = sum
		}
	}
	keep := nTickers
	if req.NumComponents != nil && *req.NumComponents > 0 && *req.NumComponents < nTickers {
		keep = *req.NumComponents
	}
	result := &PCAResult{
		Eigenvalues: sortedEigenvalues[:keep], CumulativeVariance: cumulativeVariance[:keep],
		Loadings: make([][]float64, nTickers), Scores: make([][]float64, nReturns),
		Tickers: tickers,
	}
	for i := 0; i < nTickers; i++ {
		result.Loadings[i] = sortedEigenvectors[i][:keep]
	}
	for i := 0; i < nReturns; i++ {
		result.Scores[i] = scores[i][:keep]
	}
	return result, nil
}
