package engine

import (
	"math"
	"testing"
)

func TestCalcPSR(t *testing.T) {
	mk := func(drift float64) []float64 {
		out := make([]float64, 60)
		for i := range out {
			noise := 0.002
			if i%2 == 1 {
				noise = -noise
			}
			out[i] = drift + noise
		}
		return out
	}
	if psr := CalcPSR(mk(0.01), 0.02, 0); psr < 0.999 {
		t.Errorf("强正漂移 PSR 应≈1: %v", psr)
	}
	if psr := CalcPSR(mk(-0.01), 0.02, 0); psr > 0.001 {
		t.Errorf("强负漂移 PSR 应≈0: %v", psr)
	}
	var alt []float64 // 零和交替：SR≈0 → PSR(SR*=0)≈0.5
	for i := 0; i < 60; i++ {
		if i%2 == 0 {
			alt = append(alt, 0.01)
		} else {
			alt = append(alt, -0.01)
		}
	}
	if psr := CalcPSR(alt, 0.02, 0); math.Abs(psr-0.5) > 0.05 {
		t.Errorf("零漂移 PSR 应≈0.5: %v", psr)
	}
}

func TestCalcHurstExponent(t *testing.T) {
	// 收益域游程对比：长同号游程（正自相关）→ H>0.5；交替（反相关）→ H<0.5
	persistent := make([]float64, 200)
	for i := range persistent {
		if (i/20)%2 == 0 {
			persistent[i] = 0.01
		} else {
			persistent[i] = -0.01
		}
	}
	hPersist := CalcHurstExponent(persistent)
	alternating := make([]float64, 200)
	for i := range alternating {
		if i%2 == 0 {
			alternating[i] = 0.01
		} else {
			alternating[i] = -0.01
		}
	}
	hAlt := CalcHurstExponent(alternating)
	t.Logf("H_persist=%v H_alt=%v", hPersist, hAlt)
	if hPersist <= hAlt {
		t.Errorf("正自相关序列 H(%v) 应大于交替序列 H(%v)", hPersist, hAlt)
	}
	if hAlt >= 0.55 {
		t.Errorf("交替序列 H 应<0.55: %v", hAlt)
	}
	short := []float64{1, 2, 3}
	if h := CalcHurstExponent(short); h != 0.5 {
		t.Errorf("样本不足应缺省 0.5: %v", h)
	}
}

func TestBurkeSterlingRatio(t *testing.T) {
	depths := []float64{0.10, 0.30, 0.20, 0.15, 0.25, 0.05}
	const cagr, rf = 0.10, 0.02
	// top5 深度降序：0.30,0.25,0.20,0.15,0.10 → Σsq=0.225 → Burke=0.08/0.225
	wantBurke := (cagr - rf) / (0.09 + 0.0625 + 0.04 + 0.0225 + 0.01)
	if got := CalcBurkeRatio(cagr, rf, depths); math.Abs(got-wantBurke) > 1e-12 {
		t.Errorf("Burke = %v, want %v", got, wantBurke)
	}
	// Sterling = 0.08 / mean(0.30,0.25,0.20,0.15,0.10)
	wantSterling := (cagr - rf) / 0.20
	if got := CalcSterlingRatio(cagr, rf, depths); math.Abs(got-wantSterling) > 1e-12 {
		t.Errorf("Sterling = %v, want %v", got, wantSterling)
	}
}

func TestCalcBattingAverage(t *testing.T) {
	pr := []float64{0.02, 0.01, -0.01, 0.03}
	br := []float64{0.005, 0.02, -0.02, 0.01}
	// 配对：win, lose(0.01<0.02), win(-0.01>-0.02), win → 3/4
	if got := CalcBattingAverage(pr, br); math.Abs(got-0.75) > 1e-12 {
		t.Errorf("BattingAverage = %v, want 0.75", got)
	}
	if got := CalcBattingAverage(nil, nil); got != 0 {
		t.Errorf("空输入应为 0: %v", got)
	}
}
