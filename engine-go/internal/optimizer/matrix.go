package optimizer

import (
	"fmt"
	"gonum.org/v1/gonum/mat"
	"slices"
)

func flatten(a [][]float64) []float64 {
	flat := make([]float64, 0, len(a)*len(a[0]))
	for _, row := range a {
		flat = append(flat, row...)
	}
	return flat
}
func invertDense(a [][]float64) ([][]float64, error) {
	n := len(a)
	if n == 0 {
		return nil, fmt.Errorf("矩阵为空")
	}
	m := mat.NewDense(n, n, flatten(a))
	var inv mat.Dense
	if err := inv.Inverse(m); err != nil {
		return nil, fmt.Errorf("矩阵奇异，无法求逆: %w", err)
	}
	result := make([][]float64, n)
	for i := 0; i < n; i++ {
		result[i] = make([]float64, n)
		for j := 0; j < n; j++ {
			result[i][j] = inv.At(i, j)
		}
	}
	return result, nil
}
func denseMulVec(matrix [][]float64, vec []float64) []float64 {
	if len(matrix) == 0 {
		return nil
	}
	m := mat.NewDense(len(matrix), len(vec), flatten(matrix))
	v := mat.NewVecDense(len(vec), vec)
	var result mat.VecDense
	result.MulVec(m, v)
	return result.RawVector().Data
}
func largestEigenvalue(a [][]float64) float64 {
	if len(a) == 0 {
		return 0
	}
	var es mat.EigenSym
	if !es.Factorize(mat.NewSymDense(len(a), flatten(a)), false) {
		return 0
	}
	if vals := es.Values(nil); len(vals) > 0 {
		return slices.Max(vals)
	}
	return 0
}
func ensurePD(sigma [][]float64) [][]float64 {
	reg := regStart
	for attempt := 0; attempt < regMaxAttempts; attempt++ {
		if isPD(sigma) {
			return sigma
		}
		result := cloneMatrix(sigma)
		for i := range sigma {
			result[i][i] += reg
		}
		sigma, reg = result, reg*10
	}
	return sigma
}
func isPD(a [][]float64) bool {
	if len(a) == 0 {
		return false
	}
	var chol mat.Cholesky
	return chol.Factorize(mat.NewSymDense(len(a), flatten(a)))
}
func cloneMatrix(a [][]float64) [][]float64 {
	result := make([][]float64, len(a))
	for i := range a {
		result[i] = slices.Clone(a[i])
	}
	return result
}
