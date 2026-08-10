package analysis

import (
	"engine-go/internal/engineutil"
	"fmt"
	"gonum.org/v1/gonum/mat"
	"sort"
)

type FFDataPoint struct {
	Date  string  `json:"date"`
	MktRf float64 `json:"mktRf"`
	Smb   float64 `json:"smb"`
	Hml   float64 `json:"hml"`
}
type RegressionResult struct {
	Alpha     float64   `json:"alpha"`
	Beta      float64   `json:"beta"`
	SMB       float64   `json:"smb"`
	HML       float64   `json:"hml"`
	RSquared  float64   `json:"rSquared"`
	Residuals []float64 `json:"residuals"`
}
type FactorRegressionRequest struct {
	MonthlyReturns []MonthlyReturn `json:"monthlyReturns"`
	FFData         []FFDataPoint   `json:"ffData"`
	Factors        []string        `json:"factors"`
	StartDate      string          `json:"startDate"`
	EndDate        string          `json:"endDate"`
}
type MonthlyReturn struct {
	Date  string  `json:"date"`
	Value float64 `json:"value"`
}

func RunRegression(req FactorRegressionRequest) (*RegressionResult, error) {
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
	startPrefix, endPrefix := req.StartDate, req.EndDate
	if len(startPrefix) > 7 {
		startPrefix = startPrefix[:7]
	}
	if len(endPrefix) > 7 {
		endPrefix = endPrefix[:7]
	}
	var data []FFDataPoint
	for _, d := range req.FFData {
		if startPrefix != "" && d.Date < startPrefix {
			continue
		}
		if endPrefix != "" && d.Date > endPrefix {
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
		return nil, engineutil.NewInputError("因子回归对齐数据不足（需至少 3 个月对齐数据，当前 %d 个）", len(aligned))
	}
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
		return nil, fmt.Errorf("因子矩阵不可逆（因子共线性）: %w", err)
	}
	var XtY mat.VecDense
	XtY.MulVec(&Xt, yvec)
	var betaVec mat.VecDense
	betaVec.MulVec(&XtXInv, &XtY)
	beta := make([]float64, colCount)
	for i := 0; i < colCount; i++ {
		beta[i] = betaVec.AtVec(i)
	}
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
	getCoeff := func(key string) float64 {
		for i, f := range activeFactors {
			if f == key {
				return beta[i+1]
			}
		}
		return 0
	}
	return &RegressionResult{Alpha: beta[0], Beta: getCoeff("mktRF"), SMB: getCoeff("smb"), HML: getCoeff("hml"), RSquared: rSquared, Residuals: residuals}, nil
}
