package engine

import (
	"math"
	"testing"
)

func assertFloatApprox(t *testing.T, got, want float64, label string, tol ...float64) {
	t.Helper()
	eps := 1e-10
	if len(tol) > 0 {
		eps = tol[0]
	}
	if math.Abs(got-want) > eps {
		t.Errorf("%s = %v, want %v", label, got, want)
	}
}

func assertInt(t *testing.T, got, want int, label string) {
	t.Helper()
	if got != want {
		t.Errorf("%s = %d, want %d", label, got, want)
	}
}

func assertStr(t *testing.T, got, want, label string) {
	t.Helper()
	if got != want {
		t.Errorf("%s = %q, want %q", label, got, want)
	}
}

func assertNoPanic(t *testing.T, fn func()) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("panicked: %v", r)
		}
	}()
	fn()
}
