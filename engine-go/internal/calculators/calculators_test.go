package calculators

import (
	"math"
	"testing"
)

func TestCalcCAGR(t *testing.T) {
	tests := []struct {
		name  string
		req   CAGRRequest
		check func(t *testing.T, r CAGRResult)
	}{
		{name: "InitialAmount<=0返回零值", req: CAGRRequest{InitialAmount: 0, FinalAmount: 100, Years: 10}, check: func(t *testing.T, r CAGRResult) {
			if r != (CAGRResult{}) {
				t.Errorf("应返回零值, got %+v", r)
			}
		}},
		{name: "Years<=0返回零值", req: CAGRRequest{InitialAmount: 100, FinalAmount: 200, Years: 0}, check: func(t *testing.T, r CAGRResult) {
			if r != (CAGRResult{}) {
				t.Errorf("应返回零值, got %+v", r)
			}
		}},
		{
			name: "翻倍10年_CAGR约7.18%",
			req:  CAGRRequest{InitialAmount: 100, FinalAmount: 200, Years: 10},
			check: func(t *testing.T, r CAGRResult) {
				wantCAGR := math.Pow(2, 1.0/10) - 1
				if math.Abs(r.CAGR-wantCAGR) > 1e-9 {
					t.Errorf("CAGR = %v, want %v", r.CAGR, wantCAGR)
				}
				if math.Abs(r.Multiplier-2) > 1e-9 {
					t.Errorf("Multiplier = %v, want 2", r.Multiplier)
				}
				if math.Abs(r.TotalReturn-100) > 1e-9 {
					t.Errorf("TotalReturn = %v, want 100", r.TotalReturn)
				}
			},
		},
		{
			name: "亏损场景",
			req:  CAGRRequest{InitialAmount: 100, FinalAmount: 50, Years: 5},
			check: func(t *testing.T, r CAGRResult) {
				wantCAGR := math.Pow(0.5, 1.0/5) - 1
				if math.Abs(r.CAGR-wantCAGR) > 1e-9 {
					t.Errorf("CAGR = %v, want %v", r.CAGR, wantCAGR)
				}
				if r.TotalReturn != -50 {
					t.Errorf("TotalReturn = %v, want -50", r.TotalReturn)
				}
			},
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) { tc.check(t, CalcCAGR(tc.req)) })
	}
}
func TestCalcSWR(t *testing.T) {
	t.Run("InitialAmount<=0返回零值", func(t *testing.T) {
		r := CalcSWR(SWRRequest{InitialAmount: 0, AnnualWithdrawal: 100, Years: 10})
		if r != (SWRResult{}) {
			t.Errorf("应返回零值, got %+v", r)
		}
	})
	t.Run("Years<=0返回零值", func(t *testing.T) {
		r := CalcSWR(SWRRequest{InitialAmount: 1000, AnnualWithdrawal: 100, Years: 0})
		if r != (SWRResult{}) {
			t.Errorf("应返回零值, got %+v", r)
		}
	})
	t.Run("确定性_相同输入相同输出", func(t *testing.T) {
		req := SWRRequest{InitialAmount: 100000, AnnualWithdrawal: 4000, Years: 30, MeanReturn: 0.07, Stdev: 0.12}
		r1 := CalcSWR(req)
		r2 := CalcSWR(req)
		if r1 != r2 {
			t.Errorf("固定种子应产生确定性结果, r1=%+v r2=%+v", r1, r2)
		}
	})
	t.Run("数值范围合理", func(t *testing.T) {
		req := SWRRequest{InitialAmount: 100000, AnnualWithdrawal: 4000, Years: 30, MeanReturn: 0.07, Stdev: 0.12}
		r := CalcSWR(req)
		if r.SuccessRate < 0 || r.SuccessRate > 1 {
			t.Errorf("SuccessRate 应在 [0,1], got %v", r.SuccessRate)
		}
		if r.MinPortfolio < 0 {
			t.Errorf("MinPortfolio 应非负, got %v", r.MinPortfolio)
		}
		if r.MaxPortfolio < r.MinPortfolio {
			t.Errorf("MaxPortfolio(%v) 不应小于 MinPortfolio(%v)", r.MaxPortfolio, r.MinPortfolio)
		}
		if r.SafeWithdrawal < 0 {
			t.Errorf("SafeWithdrawal 应非负, got %v", r.SafeWithdrawal)
		}
	})
	t.Run("低提取率高成功率", func(t *testing.T) {
		req := SWRRequest{InitialAmount: 100000, AnnualWithdrawal: 100, Years: 10, MeanReturn: 0.10, Stdev: 0.05}
		r := CalcSWR(req)
		if r.SuccessRate < 0.9 {
			t.Errorf("低提取率高收益应高成功率, got %v", r.SuccessRate)
		}
	})
}
func TestCalcTwoFundFrontier(t *testing.T) {
	t.Run("NumPoints<=0默认20", func(t *testing.T) {
		req := TwoFundFrontierRequest{Asset1Return: 0.05, Asset1Stdev: 0.10, Asset2Return: 0.10, Asset2Stdev: 0.20, Correlation: 0.3, NumPoints: 0}
		r := CalcTwoFundFrontier(req)
		if len(r) != 21 {
			t.Errorf("默认应返回 21 个点, got %d", len(r))
		}
	})
	t.Run("端点权重正确", func(t *testing.T) {
		req := TwoFundFrontierRequest{Asset1Return: 0.05, Asset1Stdev: 0.10, Asset2Return: 0.10, Asset2Stdev: 0.20, Correlation: 0.0, NumPoints: 10}
		r := CalcTwoFundFrontier(req)
		if len(r) != 11 {
			t.Fatalf("应返回 11 个点, got %d", len(r))
		}
		if math.Abs(r[0].Weight1-0) > 1e-9 || math.Abs(r[0].Weight2-1) > 1e-9 {
			t.Errorf("起点权重错误: w1=%v w2=%v", r[0].Weight1, r[0].Weight2)
		}
		last := r[len(r)-1]
		if math.Abs(last.Weight1-1) > 1e-9 || math.Abs(last.Weight2-0) > 1e-9 {
			t.Errorf("终点权重错误: w1=%v w2=%v", last.Weight1, last.Weight2)
		}
	})
	t.Run("权重和恒为1", func(t *testing.T) {
		req := TwoFundFrontierRequest{Asset1Return: 0.05, Asset1Stdev: 0.10, Asset2Return: 0.10, Asset2Stdev: 0.20, Correlation: 0.5, NumPoints: 20}
		r := CalcTwoFundFrontier(req)
		for i, p := range r {
			sum := p.Weight1 + p.Weight2
			if math.Abs(sum-1) > 1e-9 {
				t.Errorf("点 %d 权重和=%v, want 1", i, sum)
			}
		}
	})
	t.Run("组合收益为加权平均", func(t *testing.T) {
		req := TwoFundFrontierRequest{Asset1Return: 0.05, Asset1Stdev: 0.10, Asset2Return: 0.10, Asset2Stdev: 0.20, Correlation: 0.0, NumPoints: 10}
		r := CalcTwoFundFrontier(req)
		for i, p := range r {
			wantReturn := p.Weight1*req.Asset1Return + p.Weight2*req.Asset2Return
			if math.Abs(p.Return-wantReturn) > 1e-9 {
				t.Errorf("点 %d Return=%v, want %v", i, p.Return, wantReturn)
			}
		}
	})
	t.Run("完全负相关方差下限非负", func(t *testing.T) {
		req := TwoFundFrontierRequest{Asset1Return: 0.05, Asset1Stdev: 0.10, Asset2Return: 0.10, Asset2Stdev: 0.20, Correlation: -1.0, NumPoints: 20}
		r := CalcTwoFundFrontier(req)
		for i, p := range r {
			if p.Stdev < 0 {
				t.Errorf("点 %d Stdev 不应为负: %v", i, p.Stdev)
			}
		}
	})
}
