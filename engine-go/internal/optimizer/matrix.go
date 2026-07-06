package optimizer

import (
	"fmt"
	"math"
)

// invertMatrix 使用 Gauss-Jordan 消元法求矩阵逆
//
// 企业理由：闭式解需要矩阵求逆。Gauss-Jordan 法实现简单，
// 对 N<=50 的矩阵性能足够（实际投资组合通常 N<20）。
func invertMatrix(a [][]float64) ([][]float64, error) {
	n := len(a)
	if n == 0 {
		return nil, fmt.Errorf("矩阵为空")
	}

	aug := make([][]float64, n)
	for i := 0; i < n; i++ {
		aug[i] = make([]float64, 2*n)
		for j := 0; j < n; j++ {
			aug[i][j] = a[i][j]
		}
		aug[i][n+i] = 1.0
	}

	for col := 0; col < n; col++ {
		maxRow := col
		maxVal := math.Abs(aug[col][col])
		for row := col + 1; row < n; row++ {
			if math.Abs(aug[row][col]) > maxVal {
				maxVal = math.Abs(aug[row][col])
				maxRow = row
			}
		}
		if maxVal < 1e-15 {
			return nil, fmt.Errorf("矩阵奇异，无法求逆")
		}

		aug[col], aug[maxRow] = aug[maxRow], aug[col]

		pivot := aug[col][col]
		for j := 0; j < 2*n; j++ {
			aug[col][j] /= pivot
		}

		for row := 0; row < n; row++ {
			if row == col {
				continue
			}
			factor := aug[row][col]
			for j := 0; j < 2*n; j++ {
				aug[row][j] -= factor * aug[col][j]
			}
		}
	}

	inv := make([][]float64, n)
	for i := 0; i < n; i++ {
		inv[i] = make([]float64, n)
		for j := 0; j < n; j++ {
			inv[i][j] = aug[i][n+j]
		}
	}

	return inv, nil
}

// matVecMul 矩阵乘向量
func matVecMul(mat [][]float64, vec []float64) []float64 {
	n := len(mat)
	result := make([]float64, n)
	for i := 0; i < n; i++ {
		sum := 0.0
		for j := 0; j < len(vec); j++ {
			sum += mat[i][j] * vec[j]
		}
		result[i] = sum
	}
	return result
}

// copyMatrix 深拷贝矩阵
func copyMatrix(a [][]float64) [][]float64 {
	n := len(a)
	result := make([][]float64, n)
	for i := 0; i < n; i++ {
		result[i] = make([]float64, len(a[i]))
		copy(result[i], a[i])
	}
	return result
}

// maxEigenvalue 幂迭代法求矩阵最大特征值
//
// 企业理由：投影梯度法需要 Lipschitz 常数（=最大特征值），
// 幂迭代法对对称正定矩阵收敛快，10-20次迭代即可。
func maxEigenvalue(a [][]float64) float64 {
	n := len(a)
	if n == 0 {
		return 0
	}

	v := make([]float64, n)
	for i := range v {
		v[i] = 1.0
	}

	for iter := 0; iter < 100; iter++ {
		w := matVecMul(a, v)
		norm := 0.0
		for _, x := range w {
			norm += x * x
		}
		if norm < 1e-30 {
			return 0
		}
		norm = math.Sqrt(norm)
		for i := range v {
			v[i] = w[i] / norm
		}
	}

	w := matVecMul(a, v)
	dot := 0.0
	for i := range v {
		dot += v[i] * w[i]
	}
	return dot
}

// ensurePositiveDefinite 确保矩阵正定，通过 Cholesky 分解检测
//
// 企业理由：闭式解需要矩阵求逆，非正定矩阵不可逆会导致计算失败。
// 逐步增加正则化项，最小化对原始数据的扰动。
func ensurePositiveDefinite(sigma [][]float64) [][]float64 {
	n := len(sigma)
	reg := regStart
	for attempt := 0; attempt < regMaxAttempts; attempt++ {
		if isPositiveDefinite(sigma) {
			return sigma
		}
		result := copyMatrix(sigma)
		for i := 0; i < n; i++ {
			result[i][i] += reg
		}
		sigma = result
		reg *= 10
	}
	return sigma
}

// isPositiveDefinite 通过 Cholesky 分解判断矩阵是否正定
func isPositiveDefinite(a [][]float64) bool {
	n := len(a)
	l := make([][]float64, n)
	for i := 0; i < n; i++ {
		l[i] = make([]float64, n)
	}
	for i := 0; i < n; i++ {
		for j := 0; j <= i; j++ {
			sum := 0.0
			for k := 0; k < j; k++ {
				sum += l[i][k] * l[j][k]
			}
			if i == j {
				val := a[i][i] - sum
				if val <= 0 {
					return false
				}
				l[i][j] = math.Sqrt(val)
			} else {
				if l[j][j] == 0 {
					return false
				}
				l[i][j] = (a[i][j] - sum) / l[j][j]
			}
		}
	}
	return true
}
