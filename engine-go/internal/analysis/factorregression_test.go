package analysis

import (
	"errors"
	"math"
	"testing"

	"engine-go/internal/engineutil"
)

func makeFFData() []FFDataPoint {
	return []FFDataPoint{
		{Date: "2024-01", MktRf: 1.0, Smb: 0.5, Hml: -0.3},
		{Date: "2024-02", MktRf: 2.0, Smb: 0.8, Hml: 0.1},
		{Date: "2024-03", MktRf: -1.0, Smb: -0.4, Hml: 0.5},
		{Date: "2024-04", MktRf: 0.5, Smb: 0.3, Hml: -0.2},
		{Date: "2024-05", MktRf: 3.0, Smb: 1.0, Hml: 0.4},
	}
}
func makePerfectReturns(alpha, beta float64, ff []FFDataPoint) []MonthlyReturn {
	rets := make([]MonthlyReturn, len(ff))
	for i, f := range ff {
		rets[i] = MonthlyReturn{Date: f.Date, Value: alpha + beta*(f.MktRf/100)}
	}
	return rets
}
func TestRunRegression_InsufficientData(t *testing.T) {
	ff := []FFDataPoint{{Date: "2024-01", MktRf: 1.0, Smb: 0.5, Hml: 0.1}, {Date: "2024-02", MktRf: 2.0, Smb: 0.8, Hml: 0.2}}
	cases := []struct {
		name string
		req  FactorRegressionRequest
	}{
		{"空输入", FactorRegressionRequest{MonthlyReturns: []MonthlyReturn{}, FFData: []FFDataPoint{}, Factors: []string{"mktRF"}}},
		{"仅2个对齐点", FactorRegressionRequest{MonthlyReturns: makePerfectReturns(0.001, 1.2, ff), FFData: ff, Factors: []string{"mktRF"}}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := RunRegression(c.req)
			var inputErr *engineutil.InputError
			if !errors.As(err, &inputErr) {
				t.Fatalf("数据不足应返回 InputError, got: %v", err)
			}
		})
	}
}
func TestRunRegression_PerfectLinear(t *testing.T) {
	ff := makeFFData()
	alpha, beta := 0.001, 1.2
	rets := makePerfectReturns(alpha, beta, ff)
	req := FactorRegressionRequest{MonthlyReturns: rets, FFData: ff, Factors: []string{"mktRF"}}
	r, err := RunRegression(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	t.Run("Alpha精确还原", func(t *testing.T) {
		if math.Abs(r.Alpha-alpha) > 1e-9 {
			t.Errorf("Alpha = %v, want %v", r.Alpha, alpha)
		}
	})
	t.Run("Beta精确还原", func(t *testing.T) {
		if math.Abs(r.Beta-beta) > 1e-9 {
			t.Errorf("Beta = %v, want %v", r.Beta, beta)
		}
	})
	t.Run("RSquared为1", func(t *testing.T) {
		if math.Abs(r.RSquared-1.0) > 1e-9 {
			t.Errorf("完美线性 RSquared 应为 1, got %v", r.RSquared)
		}
	})
	t.Run("残差接近0", func(t *testing.T) {
		if len(r.Residuals) != len(ff) {
			t.Fatalf("残差数应 = %d, got %d", len(ff), len(r.Residuals))
		}
		for i, res := range r.Residuals {
			if math.Abs(res) > 1e-9 {
				t.Errorf("残差[%d] = %v, 应接近 0", i, res)
			}
		}
	})
}
func TestRunRegression_DateFilter(t *testing.T) {
	ff := makeFFData()
	rets := makePerfectReturns(0.001, 1.2, ff)
	req := FactorRegressionRequest{MonthlyReturns: rets, FFData: ff, Factors: []string{"mktRF"}, StartDate: "2024-02", EndDate: "2024-04"}
	r, err := RunRegression(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if len(r.Residuals) != 3 {
		t.Errorf("过滤后应有 3 个残差, got %d", len(r.Residuals))
	}
	if math.Abs(r.RSquared-1.0) > 1e-9 {
		t.Errorf("过滤后完美线性 RSquared 应为 1, got %v", r.RSquared)
	}
}
func TestRunRegression_UnselectedFactor(t *testing.T) {
	ff := makeFFData()
	alpha, beta := 0.002, 0.8
	rets := makePerfectReturns(alpha, beta, ff)
	req := FactorRegressionRequest{MonthlyReturns: rets, FFData: ff, Factors: []string{"smb"}}
	r, err := RunRegression(req)
	if err != nil {
		t.Fatalf("不应报错: %v", err)
	}
	if r.Beta != 0 {
		t.Errorf("未选 mktRF 时 Beta 应为 0, got %v", r.Beta)
	}
}
