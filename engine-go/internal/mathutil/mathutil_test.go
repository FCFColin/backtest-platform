package mathutil

import (
	"gonum.org/v1/gonum/stat"
	"math"
	"math/rand"
	"testing"
)

const approxTol = 1e-9

func approxEqual(a, b float64) bool {
	return math.Abs(a-b) < approxTol
}
func TestSum(t *testing.T) {
	tests := []struct {
		name string
		arr  []float64
		want float64
	}{
		{"空切片返回0", []float64{}, 0},
		{"单元素", []float64{42.5}, 42.5},
		{"多元素求和", []float64{1, 2, 3, 4, 5}, 15},
		{"含负数", []float64{-1, 2, -3, 4}, 2},
		{"nil切片返回0", nil, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Sum(tc.arr); !approxEqual(got, tc.want) {
				t.Errorf("Sum(%v) = %v, want %v", tc.arr, got, tc.want)
			}
		})
	}
}
func TestPercentile(t *testing.T) {
	arr := []float64{1, 2, 3, 4, 5}
	tests := []struct {
		name string
		arr  []float64
		p    float64
		want float64
	}{
		{"空切片返回0", []float64{}, 0.5, 0},
		{"最小值_p0", arr, 0, 1},
		{"最大值_p1", arr, 1, 5},
		{"中位数_p0.5", arr, 0.5, 3},
		{"p越界负数裁剪到0", arr, -0.5, 1},
		{"p越界大于1裁剪到1", arr, 1.5, 5},
		{"nil切片返回0", nil, 0.5, 0},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := Percentile(tc.arr, tc.p); !approxEqual(got, tc.want) {
				t.Errorf("Percentile(%v, %v) = %v, want %v", tc.arr, tc.p, got, tc.want)
			}
		})
	}
}
func TestPercentile_NotMutatingInput(t *testing.T) {
	arr := []float64{5, 3, 1, 4, 2}
	original := make([]float64, len(arr))
	copy(original, arr)
	_ = Percentile(arr, 0.5)
	for i := range arr {
		if arr[i] != original[i] {
			t.Errorf("Percentile 修改了输入切片, idx=%d got=%v want=%v", i, arr[i], original[i])
		}
	}
}
func TestGaussianRandom(t *testing.T) {
	t.Run("确定性种子可复现", func(t *testing.T) {
		r1 := rand.New(rand.NewSource(42))
		r2 := rand.New(rand.NewSource(42))
		mean, std := 0.0, 1.0
		for i := 0; i < 100; i++ {
			v1 := GaussianRandom(r1, mean, std)
			v2 := GaussianRandom(r2, mean, std)
			if v1 != v2 {
				t.Errorf("相同种子应产生相同序列, idx=%d v1=%v v2=%v", i, v1, v2)
			}
		}
	})
	t.Run("统计特性_均值和标准差", func(t *testing.T) {
		rnd := rand.New(rand.NewSource(123))
		mean, std := 0.05, 0.2
		samples := make([]float64, 10000)
		for i := range samples {
			samples[i] = GaussianRandom(rnd, mean, std)
		}
		gotMean := stat.Mean(samples, nil)
		gotStd := stat.StdDev(samples, nil)
		if math.Abs(gotMean-mean) > 0.02 {
			t.Errorf("均值偏差过大: got=%v want≈%v", gotMean, mean)
		}
		if math.Abs(gotStd-std) > 0.02 {
			t.Errorf("标准差偏差过大: got=%v want≈%v", gotStd, std)
		}
	})
	t.Run("零标准差返回均值", func(t *testing.T) {
		rnd := rand.New(rand.NewSource(1))
		v := GaussianRandom(rnd, 5.0, 0.0)
		if !approxEqual(v, 5.0) {
			t.Errorf("std=0 时应返回均值, got=%v want=5.0", v)
		}
	})
}
