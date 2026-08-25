package engine

import (
	"math"
	"testing"
)

func TestProbeRS(t *testing.T) {
	vals := make([]float64, 200)
	for i := range vals {
		vals[i] = float64(i) * float64(i) * 0.01
	}
	for size := 8; size <= 100; size *= 2 {
		chunks := len(vals) / size
		rsSum, rsN := 0.0, 0.0
		for ch := 0; ch < chunks; ch++ {
			sub := vals[ch*size : (ch+1)*size]
			mean := 0.0
			for _, v := range sub {
				mean += v
			}
			mean /= float64(size)
			var cum, devSq, mn, mx float64
			mn, mx = math.Inf(1), math.Inf(-1)
			for _, v := range sub {
				cum += v - mean
				devSq += cum * cum
				if cum < mn {
					mn = cum
				}
				if cum > mx {
					mx = cum
				}
			}
			s := math.Sqrt(devSq / float64(size))
			if s > 0 {
				rsSum += (mx - mn) / s
				rsN++
			}
		}
		if rsN > 0 {
			t.Logf("size=%d RS=%v", size, rsSum/rsN)
		}
	}
}
