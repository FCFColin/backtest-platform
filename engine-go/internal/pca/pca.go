// Package pca 提供主成分分析功能。
// 企业理由：将 PCA 计算逻辑从 TS 端迁移到 Go 引擎，统一计算入口（ADR-031）。
// 算法独立实现于 Go 引擎（ADR-031），JSON 契约与 shared/types/pca.ts 对齐。
package pca

import (
	"errors"
	"math"
	"sort"

	"engine-go/internal/engineutil"

	"gonum.org/v1/gonum/mat"
)

// PCAResult PCA 分析结果。
type PCAResult struct {
	Eigenvalues        []float64   `json:"eigenvalues"`
	CumulativeVariance []float64   `json:"cumulativeVariance"`
	Loadings           [][]float64 `json:"loadings"`
	Scores             [][]float64 `json:"scores"`
	Tickers            []string    `json:"tickers"`
}

// PCARequest PCA 分析请求。
type PCARequest struct {
	Tickers       []string                      `json:"tickers"`
	PriceData     map[string]map[string]float64 `json:"priceData"`
	NumComponents *int                          `json:"numComponents,omitempty"`
}

// PerformPCA 执行 PCA 主成分分析。
func PerformPCA(req PCARequest) (*PCAResult, error) {
	tickers := req.Tickers
	priceData := req.PriceData

	commonDates := engineutil.AlignDates(tickers, priceData)
	if len(commonDates) < 2 {
		return nil, errors.New("有效价格数据不足，至少需要 2 个交易日")
	}

	nTickers := len(tickers)
	nDates := len(commonDates)

	// 构建价格矩阵
	prices := make([][]float64, nDates)
	for i := range prices {
		prices[i] = make([]float64, nTickers)
		for j := 0; j < nTickers; j++ {
			prices[i][j] = priceData[tickers[j]][commonDates[i]]
		}
	}

	// 构建日收益率矩阵
	nReturns := nDates - 1
	returns := make([][]float64, nReturns)
	for i := 0; i < nReturns; i++ {
		returns[i] = make([]float64, nTickers)
		for j := 0; j < nTickers; j++ {
			prev := prices[i][j]
			curr := prices[i+1][j]
			if prev != 0 {
				returns[i][j] = (curr - prev) / prev
			}
		}
	}

	// 标准化
	means := make([]float64, nTickers)
	stds := make([]float64, nTickers)
	for j := 0; j < nTickers; j++ {
		sum := 0.0
		for i := 0; i < nReturns; i++ {
			sum += returns[i][j]
		}
		means[j] = sum / float64(nReturns)
		varSum := 0.0
		for i := 0; i < nReturns; i++ {
			diff := returns[i][j] - means[j]
			varSum += diff * diff
		}
		if nReturns > 1 {
			stds[j] = math.Sqrt(varSum / float64(nReturns-1))
		}
		if stds[j] == 0 {
			stds[j] = 1
		}
	}
	stdReturns := make([][]float64, nReturns)
	for i := 0; i < nReturns; i++ {
		stdReturns[i] = make([]float64, nTickers)
		for j := 0; j < nTickers; j++ {
			stdReturns[i][j] = (returns[i][j] - means[j]) / stds[j]
		}
	}

	// 计算协方差矩阵
	cov := make([][]float64, nTickers)
	for j := range cov {
		cov[j] = make([]float64, nTickers)
	}
	for j := 0; j < nTickers; j++ {
		for k := 0; k < nTickers; k++ {
			sum := 0.0
			for i := 0; i < nReturns; i++ {
				sum += stdReturns[i][j] * stdReturns[i][k]
			}
			if nReturns > 1 {
				cov[j][k] = sum / float64(nReturns-1)
			}
		}
	}

	// gonum/mat EigenSym 替代手写 Jacobi 旋转（spec Wave 4 Task 4.2）
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

	// 按特征值降序排列
	type eigenPair struct {
		val float64
		idx int
	}
	pairs := make([]eigenPair, nTickers)
	for i := 0; i < nTickers; i++ {
		pairs[i] = eigenPair{val: rawEigenvalues[i], idx: i}
	}
	sort.Slice(pairs, func(i, j int) bool {
		return pairs[i].val > pairs[j].val
	})

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

	// 累计方差解释率
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

	// 主成分得分
	scores := make([][]float64, nReturns)
	for i := 0; i < nReturns; i++ {
		scores[i] = make([]float64, nTickers)
		for compIdx := 0; compIdx < nTickers; compIdx++ {
			sum := 0.0
			for j := 0; j < nTickers; j++ {
				sum += stdReturns[i][j] * sortedEigenvectors[j][compIdx]
			}
			scores[i][compIdx] = sum
		}
	}

	// 按需截断主成分数量
	keep := nTickers
	if req.NumComponents != nil && *req.NumComponents > 0 && *req.NumComponents < nTickers {
		keep = *req.NumComponents
	}

	result := &PCAResult{
		Eigenvalues:        sortedEigenvalues[:keep],
		CumulativeVariance: cumulativeVariance[:keep],
		Loadings:           make([][]float64, nTickers),
		Scores:             make([][]float64, nReturns),
		Tickers:            tickers,
	}
	for i := 0; i < nTickers; i++ {
		result.Loadings[i] = sortedEigenvectors[i][:keep]
	}
	for i := 0; i < nReturns; i++ {
		result.Scores[i] = scores[i][:keep]
	}
	return result, nil
}
