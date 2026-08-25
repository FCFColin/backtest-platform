package montecarlo

import (
	"math"
	mrand "math/rand"
	"testing"
)

func TestTrimmedPool_RemovesExtremes(t *testing.T) {
	hist := make([]float64, 100)
	for i := range hist {
		hist[i] = 0.01
	}
	hist[0] = 0.5  // 右端极端
	hist[1] = -0.5 // 左端极端
	pool := trimmedPool(hist, 0.05)
	for _, v := range pool {
		if math.Abs(v) > 0.02 {
			t.Fatalf("裁尾池仍含极值 %v", v)
		}
	}
	if len(pool) != len(hist)-2 {
		t.Errorf("裁尾后长度 = %d, want %d", len(pool), len(hist)-2)
	}
}

func TestEwWeights_SumToOneAndMonotonic(t *testing.T) {
	w := ewWeights(200, ewHalfLifeDays)
	sum := 0.0
	t.Logf("w0=%.6e w1=%.6e w1/w0=%v", w[0], w[1], w[1]/w[0])
	for i, x := range w {
		sum += x
		if i > 0 && w[i-1] >= x { // 严格递增（越新越大）
			t.Fatalf("权重非严格递增于 i=%d (prev=%v cur=%v)", i, w[i-1], x)
		}
		if math.IsNaN(x) || x < 0 {
			t.Fatalf("非法权重 %v @%d", x, i)
		}
	}
	if math.Abs(sum-1) > 1e-9 {
		t.Errorf("权重和 = %v, want ~1", sum)
	}
	// 半衰期验证：距末端 126 天的权重应约为末端的一半
	if math.Abs(w[len(w)-1-126]/w[len(w)-1]-0.5) > 1e-9 {
		t.Errorf("半衰期比例失准: %v", w[len(w)-1-126]/w[len(w)-1])
	}
}

func TestEstimationMethods_DeterministicAndDistinct(t *testing.T) {
	hist := make([]float64, 500)
	for i := range hist {
		hist[i] = 0.01 + float64(i%7)*0.001
	}
	hist[10] = 0.4 // 极端值
	run := func(method string, seed int64) []float64 {
		pool, w := prepareSamplingPool(hist, method)
		return blockBootstrapSampleWeighted(pool, 252, 252, 504, mrand.New(mrand.NewSource(seed)), w)
	}
	aLegacy, aTrim, aEw := run("", 42), run("trimmed", 42), run("ewWeighted", 42)
	bLegacy, _, bEw := run("", 42), run("trimmed", 42), run("ewWeighted", 42)
	for i := range aLegacy {
		if aLegacy[i] != bLegacy[i] || aEw[i] != bEw[i] {
			t.Fatalf("同 seed 不同轮结果不一致（确定性破坏）@%d", i)
		}
	}
	distinct := false
	for i := range aLegacy {
		if aTrim[i] != aLegacy[i] || aEw[i] != aLegacy[i] {
			distinct = true
			break
		}
	}
	if !distinct {
		t.Error("三法输出完全相同——变体未生效")
	}
	maxAbs := 0.0
	for _, v := range aTrim {
		if math.Abs(v) > maxAbs {
			maxAbs = math.Abs(v)
		}
	}
	if maxAbs > 0.05 {
		t.Errorf("trimmed 输出含超裁尾界收益 %v", maxAbs)
	}
}
