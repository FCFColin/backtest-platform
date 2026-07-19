// Package factorregression 提供 Fama-French 因子回归功能。
// 企业理由：将因子回归逻辑从 TS 前端迁移到 Go 引擎，统一计算入口（ADR-031）。
// 算法独立实现于 Go 引擎（ADR-031）。
package factorregression

import (
	"sort"

	"gonum.org/v1/gonum/mat"
)

// FFDataPoint Fama-French 因子数据点。
type FFDataPoint struct {
	Date  string  `json:"date"`
	MktRf float64 `json:"mktRf"`
	Smb   float64 `json:"smb"`
	Hml   float64 `json:"hml"`
}

// RegressionResult 因子回归结果。
type RegressionResult struct {
	Alpha     float64   `json:"alpha"`
	Beta      float64   `json:"beta"`
	SMB       float64   `json:"smb"`
	HML       float64   `json:"hml"`
	RSquared  float64   `json:"rSquared"`
	Residuals []float64 `json:"residuals"`
}

// FactorRegressionRequest 因子回归请求。
type FactorRegressionRequest struct {
	MonthlyReturns []MonthlyReturn `json:"monthlyReturns"`
	FFData         []FFDataPoint   `json:"ffData"`
	Factors        []string        `json:"factors"`
	StartDate      string          `json:"startDate"`
	EndDate        string          `json:"endDate"`
}

// MonthlyReturn 月度收益率。
type MonthlyReturn struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

// RunRegression 执行 Fama-French 因子回归。
func RunRegression(req FactorRegressionRequest) (*RegressionResult, error) {
	// 过滤和对齐因子数据与组合收益
	var aligned []struct {
		ret float64
		mkt float64
		smb float64
		hml float64
	}
	returnMap := make(map[string]float64)
	for _, r := range req.MonthlyReturns {
		returnMap[r.Date] = r.Value
	}

	var data []FFDataPoint
	for _, d := range req.FFData {
		if req.StartDate != "" && d.Date < req.StartDate[:7] {
			continue
		}
		if req.EndDate != "" && d.Date > req.EndDate[:7] {
			continue
		}
		data = append(data, d)
	}
	sort.Slice(data, func(i, j int) bool { return data[i].Date < data[j].Date })

	for _, fp := range data {
		retVal, ok := returnMap[fp.Date]
		if !ok {
			continue
		}
		aligned = append(aligned, struct {
			ret float64
			mkt float64
			smb float64
			hml float64
		}{
			ret: retVal,
			mkt: fp.MktRf / 100,
			smb: fp.Smb / 100,
			hml: fp.Hml / 100,
		})
	}

	if len(aligned) < 3 {
		return &RegressionResult{
			Alpha: 0, Beta: 0, SMB: 0, HML: 0,
			RSquared:  0,
			Residuals: []float64{},
		}, nil
	}

	// 确定活跃因子
	activeFactors := []string{}
	for _, f := range []string{"mktRF", "smb", "hml"} {
		for _, sel := range req.Factors {
			if f == sel {
				activeFactors = append(activeFactors, f)
				break
			}
		}
	}

	n := len(aligned)
	colCount := 1 + len(activeFactors)
	X := make([][]float64, n)
	Y := make([]float64, n)
	for i := 0; i < n; i++ {
		X[i] = make([]float64, colCount)
		X[i][0] = 1 // 截距
		for f := 0; f < len(activeFactors); f++ {
			switch activeFactors[f] {
			case "mktRF":
				X[i][f+1] = aligned[i].mkt
			case "smb":
				X[i][f+1] = aligned[i].smb
			case "hml":
				X[i][f+1] = aligned[i].hml
			}
		}
		Y[i] = aligned[i].ret
	}

	// OLS: beta = (X'X)^{-1} X'Y，使用 gonum/mat 替代手写矩阵运算（spec Wave 4 Task 4.2）
	xFlat := make([]float64, n*colCount)
	for i := 0; i < n; i++ {
		for j := 0; j < colCount; j++ {
			xFlat[i*colCount+j] = X[i][j]
		}
	}
	xdense := mat.NewDense(n, colCount, xFlat)
	yvec := mat.NewVecDense(n, Y)

	var Xt mat.Dense
	Xt.CloneFrom(xdense.T())

	var XtX mat.Dense
	XtX.Mul(&Xt, xdense)

	var XtXInv mat.Dense
	if err := XtXInv.Inverse(&XtX); err != nil {
		// 矩阵奇异（多重共线性），返回零系数
		return &RegressionResult{
			Alpha:     0,
			Beta:      0,
			SMB:       0,
			HML:       0,
			RSquared:  0,
			Residuals: []float64{},
		}, nil
	}

	var XtY mat.VecDense
	XtY.MulVec(&Xt, yvec)

	var betaVec mat.VecDense
	betaVec.MulVec(&XtXInv, &XtY)

	beta := make([]float64, colCount)
	for i := 0; i < colCount; i++ {
		beta[i] = betaVec.AtVec(i)
	}

	// 计算拟合值、残差和 R²
	fitted := make([]float64, n)
	residuals := make([]float64, n)
	ssRes := 0.0
	ssTot := 0.0
	meanY := 0.0
	for _, y := range Y {
		meanY += y
	}
	meanY /= float64(n)
	for i := 0; i < n; i++ {
		fitted[i] = beta[0]
		for f := 0; f < len(activeFactors); f++ {
			fitted[i] += beta[f+1] * X[i][f+1]
		}
		residuals[i] = Y[i] - fitted[i]
		ssRes += residuals[i] * residuals[i]
		ssTot += (Y[i] - meanY) * (Y[i] - meanY)
	}
	rSquared := 0.0
	if ssTot > 0 {
		rSquared = 1 - ssRes/ssTot
	}

	// 提取因子系数
	getCoeff := func(key string) float64 {
		for i, f := range activeFactors {
			if f == key {
				return beta[i+1]
			}
		}
		return 0
	}

	return &RegressionResult{
		Alpha:     beta[0],
		Beta:      getCoeff("mktRF"),
		SMB:       getCoeff("smb"),
		HML:       getCoeff("hml"),
		RSquared:  rSquared,
		Residuals: residuals,
	}, nil
}
