package indicators

import (
	"math"
	"testing"
)

// 近似相等阈值：覆盖 float64 累加误差与 RSI/EMA 平滑误差。
const floatTol = 1e-9

func approxSlice(t *testing.T, name string, got, want []float64) {
	t.Helper()
	if len(got) != len(want) {
		t.Fatalf("%s: length mismatch: got %d want %d", name, len(got), len(want))
	}
	for i := range got {
		if math.IsNaN(got[i]) && math.IsNaN(want[i]) {
			continue
		}
		if math.IsNaN(got[i]) != math.IsNaN(want[i]) || math.Abs(got[i]-want[i]) > floatTol {
			t.Fatalf("%s[%d]: got %v want %v", name, i, got[i], want[i])
		}
	}
}

func TestCalcSMA(t *testing.T) {
	prices := []float64{1, 2, 3, 4, 5}
	got := CalcSMA(prices, 3)
	// 前 period-1 个为 NaN，从 index 2 开始为窗口均值。
	want := []float64{nan, nan, 2.0, 3.0, 4.0}
	approxSlice(t, "CalcSMA", got, want)

	// period <= 0：全 NaN。
	got = CalcSMA(prices, 0)
	if len(got) != len(prices) {
		t.Fatalf("CalcSMA period=0: length mismatch")
	}
	for i, v := range got {
		if !math.IsNaN(v) {
			t.Fatalf("CalcSMA period=0[%d]: expected NaN, got %v", i, v)
		}
	}
}

func TestCalcEMA(t *testing.T) {
	prices := []float64{10, 20, 30}
	got := CalcEMA(prices, 2)
	if len(got) != 3 {
		t.Fatalf("CalcEMA: length mismatch")
	}
	// 第一个样本为 prices[0]。
	if math.Abs(got[0]-10) > floatTol {
		t.Fatalf("CalcEMA[0]: got %v want 10", got[0])
	}
	mult := 2.0 / 3.0
	want1 := 20*mult + 10*(1-mult)
	if math.Abs(got[1]-want1) > floatTol {
		t.Fatalf("CalcEMA[1]: got %v want %v", got[1], want1)
	}

	// 空切片：返回空切片。
	got = CalcEMA([]float64{}, 5)
	if len(got) != 0 {
		t.Fatalf("CalcEMA empty: expected empty, got %d", len(got))
	}
}

func TestCalcRSI_AllUp(t *testing.T) {
	// 单调上涨序列：所有 diff > 0，avgLoss == 0，RSI 应为 100。
	prices := []float64{1, 2, 3, 4, 5, 6}
	got := CalcRSI(prices, 3)
	if len(got) != len(prices) {
		t.Fatalf("CalcRSI: length mismatch")
	}
	for i := 3; i < len(got); i++ {
		if math.Abs(got[i]-100) > floatTol {
			t.Fatalf("CalcRSI[%d]: got %v want 100", i, got[i])
		}
	}
	// 前 period 个为 NaN。
	for i := 0; i < 3; i++ {
		if !math.IsNaN(got[i]) {
			t.Fatalf("CalcRSI[%d]: expected NaN, got %v", i, got[i])
		}
	}
}

func TestCalcRSI_ShortInput(t *testing.T) {
	// 样本数 <= period：全 NaN。
	prices := []float64{1, 2, 3}
	got := CalcRSI(prices, 5)
	for i, v := range got {
		if !math.IsNaN(v) {
			t.Fatalf("CalcRSI short[%d]: expected NaN, got %v", i, v)
		}
	}
}

func TestCalcMACD_LengthAndRelation(t *testing.T) {
	prices := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
		21, 22, 23, 24, 25, 26, 27, 28, 29, 30}
	macd, signal, hist := CalcMACD(prices)
	if len(macd) != len(prices) || len(signal) != len(prices) || len(hist) != len(prices) {
		t.Fatalf("CalcMACD: length mismatch")
	}
	for i := range prices {
		if math.Abs(hist[i]-(macd[i]-signal[i])) > floatTol {
			t.Fatalf("CalcMACD[%d]: histogram != macd - signal", i)
		}
	}
}

func TestCalcMACDHist_MatchesCalcMACD(t *testing.T) {
	prices := []float64{1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
		11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
		21, 22, 23, 24, 25, 26, 27, 28, 29, 30}
	_, _, histFromMACD := CalcMACD(prices)
	histFromHist := CalcMACDHist(prices)
	approxSlice(t, "CalcMACDHist vs CalcMACD histogram", histFromHist, histFromMACD)
}

func TestCalcBollinger_Basic(t *testing.T) {
	prices := []float64{1, 2, 3, 4, 5}
	upper, middle, lower := CalcBollinger(prices, 3, 2.0)
	if len(upper) != len(prices) || len(middle) != len(prices) || len(lower) != len(prices) {
		t.Fatalf("CalcBollinger: length mismatch")
	}
	// 前 period-1 个为 NaN。
	for i := 0; i < 2; i++ {
		if !math.IsNaN(upper[i]) || !math.IsNaN(lower[i]) {
			t.Fatalf("CalcBollinger[%d]: expected NaN", i)
		}
	}
	// index 2: middle = (1+2+3)/3 = 2；variance = ((1-2)^2+(2-2)^2+(3-2)^2)/3 = 2/3；std = sqrt(2/3)。
	std := math.Sqrt(2.0 / 3.0)
	wantMid := 2.0
	wantUpper := wantMid + 2.0*std
	wantLower := wantMid - 2.0*std
	if math.Abs(middle[2]-wantMid) > floatTol {
		t.Fatalf("CalcBollinger middle[2]: got %v want %v", middle[2], wantMid)
	}
	if math.Abs(upper[2]-wantUpper) > floatTol {
		t.Fatalf("CalcBollinger upper[2]: got %v want %v", upper[2], wantUpper)
	}
	if math.Abs(lower[2]-wantLower) > floatTol {
		t.Fatalf("CalcBollinger lower[2]: got %v want %v", lower[2], wantLower)
	}
}

func TestCalcBollingerPctB_Basic(t *testing.T) {
	prices := []float64{1, 2, 3, 4, 5}
	got := CalcBollingerPctB(prices, 3)
	if len(got) != len(prices) {
		t.Fatalf("CalcBollingerPctB: length mismatch")
	}
	// 前 period-1 个为 NaN。
	for i := 0; i < 2; i++ {
		if !math.IsNaN(got[i]) {
			t.Fatalf("CalcBollingerPctB[%d]: expected NaN", i)
		}
	}
	// index 2: sma = 2；std = sqrt(2/3)；pctB = (3 - 2) / std。
	std := math.Sqrt(2.0 / 3.0)
	want := (3.0 - 2.0) / std
	if math.Abs(got[2]-want) > floatTol {
		t.Fatalf("CalcBollingerPctB[2]: got %v want %v", got[2], want)
	}
}
