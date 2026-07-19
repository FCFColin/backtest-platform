package optimizer

import (
	"fmt"

	"gonum.org/v1/gonum/mat"
)

// invertDense 使用 gonum/mat 求矩阵逆。
//
// 企业理由：闭式解需要矩阵求逆。gonum 的 LU 分解实现稳定且经过广泛验证，
// 对 N<=50 的矩阵性能足够（实际投资组合通常 N<20）。
func invertDense(a [][]float64) ([][]float64, error) {
	n := len(a)
	if n == 0 {
		return nil, fmt.Errorf("矩阵为空")
	}
	flat := make([]float64, 0, n*n)
	for _, row := range a {
		flat = append(flat, row...)
	}
	m := mat.NewDense(n, n, flat)
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

// denseMulVec 使用 gonum/mat 计算矩阵×向量。
func denseMulVec(matrix [][]float64, vec []float64) []float64 {
	n := len(matrix)
	if n == 0 {
		return nil
	}
	p := len(vec)
	flat := make([]float64, 0, n*p)
	for _, row := range matrix {
		flat = append(flat, row...)
	}
	m := mat.NewDense(n, p, flat)
	v := mat.NewVecDense(p, vec)
	var result mat.VecDense
	result.MulVec(m, v)
	return result.RawVector().Data
}

// largestEigenvalue 使用 gonum/mat EigenSym 求对称矩阵的最大特征值。
//
// 企业理由：投影梯度法需要 Lipschitz 常数（=最大特征值）。
// 协方差矩阵对称，使用 EigenSym 求实数特征值，避免复数运算。
func largestEigenvalue(a [][]float64) float64 {
	n := len(a)
	if n == 0 {
		return 0
	}
	flat := make([]float64, 0, n*n)
	for _, row := range a {
		flat = append(flat, row...)
	}
	sym := mat.NewSymDense(n, flat)
	var es mat.EigenSym
	if !es.Factorize(sym, false) {
		return 0
	}
	vals := es.Values(nil)
	if len(vals) == 0 {
		return 0
	}
	maxVal := vals[0]
	for _, v := range vals[1:] {
		if v > maxVal {
			maxVal = v
		}
	}
	return maxVal
}

// ensurePD 确保矩阵对称正定，通过 Cholesky 分解检测。
//
// 企业理由：闭式解需要矩阵求逆，非正定矩阵不可逆会导致计算失败。
// 逐步增加正则化项，最小化对原始数据的扰动。
func ensurePD(sigma [][]float64) [][]float64 {
	n := len(sigma)
	reg := regStart
	for attempt := 0; attempt < regMaxAttempts; attempt++ {
		if isPD(sigma) {
			return sigma
		}
		result := cloneMatrix(sigma)
		for i := 0; i < n; i++ {
			result[i][i] += reg
		}
		sigma = result
		reg *= 10
	}
	return sigma
}

// isPD 通过 Cholesky 分解判断矩阵是否对称正定。
func isPD(a [][]float64) bool {
	n := len(a)
	if n == 0 {
		return false
	}
	flat := make([]float64, 0, n*n)
	for _, row := range a {
		flat = append(flat, row...)
	}
	sym := mat.NewSymDense(n, flat)
	var chol mat.Cholesky
	return chol.Factorize(sym)
}

// cloneMatrix 深拷贝二维矩阵。
func cloneMatrix(a [][]float64) [][]float64 {
	n := len(a)
	result := make([][]float64, n)
	for i := 0; i < n; i++ {
		result[i] = make([]float64, len(a[i]))
		copy(result[i], a[i])
	}
	return result
}
