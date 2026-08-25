package engine

// 字节级金样本门禁（R-04 机器化）。与 statistics_golden_test.go 的容差断言互补：
// 那里验证数学语义（1e-6），这里锁定浮点输出序列（ULP 级），专防重构/gonum 升级
// 引起的求和顺序漂移。基线文件：engine-go/testdata/statistics_golden.json。
//
// 重基线流程（仅限用户明示授权后）：
//
//	go test ./internal/engine -run TestStatisticsGoldenFile -update-golden
//
// 禁止用 -update-golden 掩盖未归因的偏差；失败时先做 ULP 偏差分析再裁决。

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"testing"

	"engine-go/internal/enginetest"
	"engine-go/internal/mathutil"
)

var updateGolden = flag.Bool("update-golden", false, "rewrite statistics_golden.json baseline (authorized re-baseline only)")

// goldenReturnsA/B 为固定字面量序列：覆盖正负交替、连跌、常数段与零收益。
var goldenReturnsA = []float64{
	0.03, -0.01, -0.01, -0.01, 0.02, 0.005, -0.002, 0.017,
	-0.031, 0.011, 0.011, 0.011, -0.007, 0.023, -0.013, 0.001,
	0.019, -0.021, 0.009, 0.014, -0.018, 0.026, -0.004, 0.006,
}

var goldenReturnsB = []float64{
	0.015, -0.005, -0.003, 0.007, 0.011, -0.017, 0.002, 0.008,
	-0.014, 0.019, -0.006, 0.004, 0.012, -0.012, 0.021, -0.008,
	0.003, 0.016, -0.022, 0.005, 0.013, -0.009, 0.018, -0.002,
}

// goldenPriceCurve 含一次 -33% 回撤与部分恢复（对应既有 TestGoldenMaxDrawdown 语义放大版）。
var goldenPriceCurve = []float64{100, 120, 118, 80, 96, 102, 99, 108, 105, 111}

func goldenResults() map[string]any {
	res := map[string]any{}

	res["mathutil.Sum.A"] = mathutil.Sum(goldenReturnsA)
	res["mathutil.DownsideDeviation.A.mar0"] = mathutil.DownsideDeviation(goldenReturnsA, 0)
	res["mathutil.DownsideDeviation.B.mar0.004"] = mathutil.DownsideDeviation(goldenReturnsB, 0.004)
	res["mathutil.Percentile.A.p25"] = mathutil.Percentile(goldenReturnsA, 0.25)
	res["mathutil.Percentile.A.p90"] = mathutil.Percentile(goldenReturnsA, 0.90)

	prices := append([]float64{50, 52, 51, 0, 53}, goldenPriceCurve...)
	dr := mathutil.DailyReturns(prices)
	drz := mathutil.DailyReturnsWithZeros(prices)
	res["mathutil.DailyReturns.gap"] = toAnySlice(dr)
	res["mathutil.DailyReturnsWithZeros.gap"] = toAnySlice(drz)

	histCounts, histMin, histMax := mathutil.Histogram(goldenPriceCurve, 4)
	res["mathutil.Histogram.curve.counts"] = intsToAnySlice(histCounts)
	res["mathutil.Histogram.curve.min"] = histMin
	res["mathutil.Histogram.curve.max"] = histMax

	cagr := CalcCAGR(100.0, 200.0, 5.0)
	totalReturn := CalcTotalReturn(100.0, 200.0)
	stdevA := CalcAnnualizedStdev(goldenReturnsA)
	stdevB := CalcAnnualizedStdev(goldenReturnsB)
	betaAB := CalcBeta(goldenReturnsA, goldenReturnsB)

	res["engine.CalcCAGR.100to200.5y"] = cagr
	res["engine.CalcTotalReturn.100to200"] = totalReturn
	res["engine.CalcAnnualizedStdev.A"] = stdevA
	res["engine.CalcAnnualizedStdev.B"] = stdevB
	res["engine.CalcSharpe.cagr.stdevA"] = CalcSharpe(cagr, stdevA)
	res["engine.CalcSortino.cagr.A"] = CalcSortino(cagr, goldenReturnsA)
	res["engine.CalcCorrelation.A.B"] = CalcCorrelation(goldenReturnsA, goldenReturnsB)
	res["engine.CalcBeta.A.over.B"] = betaAB
	res["engine.CalcAlpha.cagr.beta.bench0.06"] = CalcAlpha(cagr, betaAB, 0.06)
	res["engine.CalcRSquared.A.B"] = CalcRSquared(goldenReturnsA, goldenReturnsB)
	res["engine.CalcTrackingError.A.B"] = CalcTrackingError(goldenReturnsA, goldenReturnsB)
	res["engine.CalcInformationRatio.alpha.te"] = CalcInformationRatio(
		CalcAlpha(cagr, betaAB, 0.06), CalcTrackingError(goldenReturnsA, goldenReturnsB))
	res["engine.CalcVaR.A.0.95"] = CalcVaR(goldenReturnsA, 0.95)
	res["engine.CalcVaR.A.0.99"] = CalcVaR(goldenReturnsA, 0.99)
	res["engine.CalcCVaR.A.0.95"] = CalcCVaR(goldenReturnsA, 0.95)
	res["engine.CalcSkewness.A"] = CalcSkewness(goldenReturnsA)
	res["engine.CalcExcessKurtosis.A"] = CalcExcessKurtosis(goldenReturnsA)

	mdd := CalcMaxDrawdown(goldenPriceCurve)
	res["engine.CalcMaxDrawdown.curve"] = map[string]any{
		"maxDrawdown": mdd.MaxDrawdown, "maxDrawdownDuration": mdd.MaxDrawdownDuration,
	}
	res["engine.CalcAvgDrawdown.curve"] = CalcAvgDrawdown(goldenPriceCurve)
	res["engine.CalcUlcerIndex.curve"] = CalcUlcerIndex(goldenPriceCurve)
	res["engine.CalcCalmar.cagr.mdd"] = CalcCalmar(cagr, mdd.MaxDrawdown)

	res["engine.CalcCaptureRatio.A.B.up"] = CalcCaptureRatio(goldenReturnsA, goldenReturnsB, true)
	res["engine.CalcCaptureRatio.A.B.down"] = CalcCaptureRatio(goldenReturnsA, goldenReturnsB, false)

	annual := enginetest.UniformAnnualReturns(30, 0.05)
	res["engine.CalcPWR.uniform0.05.30y"] = CalcPWR(annual)
	res["engine.CalcSWR.uniform0.05.30y.sr0.95"] = CalcSWR(annual, 30, 0.95)

	return res
}

func toAnySlice(fs []float64) []any {
	out := make([]any, len(fs))
	for i, f := range fs {
		out[i] = f
	}
	return out
}

func intsToAnySlice(is []int) []any {
	out := make([]any, len(is))
	for i, v := range is {
		out[i] = v
	}
	return out
}

// formatFloat 以 15 位有效数字规范化（IEEE754 double 的可分辨精度边界），
// 消除 strconv 'g' -1 在末位有效数字上的抖动。
func formatFloat(f float64) string {
	s := strconv.FormatFloat(f, 'g', 15, 64)
	if s == "-0" {
		return "0"
	}
	return s
}

func canonJSON(v any) (string, error) {
	var b bytes.Buffer
	if err := writeCanon(&b, v); err != nil {
		return "", err
	}
	return b.String(), nil
}

func writeCanon(b *bytes.Buffer, v any) error {
	switch x := v.(type) {
	case nil:
		b.WriteString("null")
	case bool:
		b.WriteString(strconv.FormatBool(x))
	case int:
		b.WriteString(strconv.Itoa(x))
	case float64:
		b.WriteString(formatFloat(x))
	case string:
		e, err := json.Marshal(x)
		if err != nil {
			return err
		}
		b.Write(e)
	case []any:
		b.WriteByte('[')
		for i, item := range x {
			if i > 0 {
				b.WriteByte(',')
			}
			if err := writeCanon(b, item); err != nil {
				return err
			}
		}
		b.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(x))
		for k := range x {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		b.WriteByte('{')
		for i, k := range keys {
			if i > 0 {
				b.WriteByte(',')
			}
			kk, err := json.Marshal(k)
			if err != nil {
				return err
			}
			b.Write(kk)
			b.WriteByte(':')
			if err := writeCanon(b, x[k]); err != nil {
				return err
			}
		}
		b.WriteByte('}')
	default:
		return fmt.Errorf("golden: unsupported type %T", v)
	}
	return nil
}

var goldenRelPath = filepath.Join("..", "..", "testdata", "statistics_golden.json")

func TestStatisticsGoldenFile(t *testing.T) {
	got, err := canonJSON(goldenResults())
	if err != nil {
		t.Fatalf("canonical serialization failed: %v", err)
	}
	got += "\n"

	if *updateGolden {
		if err := os.MkdirAll(filepath.Dir(goldenRelPath), 0o755); err != nil {
			t.Fatalf("mkdir testdata: %v", err)
		}
		if err := os.WriteFile(goldenRelPath, []byte(got), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		t.Log("golden file rewritten (authorized re-baseline)")
		return
	}

	wantBytes, err := os.ReadFile(goldenRelPath)
	if err != nil {
		t.Fatalf("读取 golden 失败（首次生成请运行 -update-golden）: %v", err)
	}
	want := string(wantBytes)
	if got != want {
		t.Fatalf("golden 字节级不匹配（R-04）：first diff at byte %d\nwant: %s\ngot:  %s",
			firstDiffOffset(want, got),
			snippet(want), snippet(got))
	}
	t.Log("golden file matched (byte-exact)")
}

func firstDiffOffset(a, b string) int {
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	for i := 0; i < n; i++ {
		if a[i] != b[i] {
			return i
		}
	}
	return n
}

func snippet(s string) string {
	const max = 240
	if len(s) > max {
		return s[:max] + "…"
	}
	return s
}
