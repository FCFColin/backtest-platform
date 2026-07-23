package providerutil

import "testing"

// 迁移自 yfinance_test.go 的 TestToFloat64 / TestToFloat64Safe / TestToInt64Safe。
func TestToFloat64(t *testing.T) {
	cases := []struct {
		name  string
		input interface{}
		want  float64
	}{
		{"nil", nil, 0},
		{"float64", 3.14, 3.14},
		{"string numeric", "42.5", 42.5},
		{"string invalid", "invalid", 0},
		{"int", 42, 0}, // 非 float64/string 返回 0
	}
	for _, c := range cases {
		got := ToFloat64(c.input)
		if got != c.want {
			t.Errorf("ToFloat64(%s) = %v, want %v", c.name, got, c.want)
		}
	}
}

func TestToFloat64Safe(t *testing.T) {
	arr := []interface{}{1.5, "2.5", nil, "invalid"}
	if v := ToFloat64Safe(arr, 0); v != 1.5 {
		t.Errorf("ToFloat64Safe([0]) = %v, want 1.5", v)
	}
	if v := ToFloat64Safe(arr, 1); v != 2.5 {
		t.Errorf("ToFloat64Safe([1]) = %v, want 2.5", v)
	}
	if v := ToFloat64Safe(arr, 2); v != 0 {
		t.Errorf("ToFloat64Safe([2] nil) = %v, want 0", v)
	}
	// 越界
	if v := ToFloat64Safe(arr, 10); v != 0 {
		t.Errorf("ToFloat64Safe(out of range) = %v, want 0", v)
	}
}

func TestToInt64Safe(t *testing.T) {
	arr := []interface{}{42.0, "100", nil, "invalid"}
	if v := ToInt64Safe(arr, 0); v != 42 {
		t.Errorf("ToInt64Safe([0]) = %d, want 42", v)
	}
	if v := ToInt64Safe(arr, 1); v != 100 {
		t.Errorf("ToInt64Safe([1]) = %d, want 100", v)
	}
	if v := ToInt64Safe(arr, 2); v != 0 {
		t.Errorf("ToInt64Safe([2] nil) = %d, want 0", v)
	}
	// 越界
	if v := ToInt64Safe(arr, 10); v != 0 {
		t.Errorf("ToInt64Safe(out of range) = %d, want 0", v)
	}
}

// 迁移自 twelvedata_test.go 的 TestParseTwelveFloat / TestParseTwelveInt。
func TestParseStringFloat(t *testing.T) {
	cases := []struct {
		input string
		want  float64
	}{
		{"3.14", 3.14},
		{"0", 0},
		{"", 0},
		{"  10.5  ", 10.5}, // 带空格
		{"invalid", 0},
	}
	for _, c := range cases {
		got := ParseStringFloat(c.input)
		if got != c.want {
			t.Errorf("ParseStringFloat(%q) = %v, want %v", c.input, got, c.want)
		}
	}
}

func TestParseStringInt(t *testing.T) {
	cases := []struct {
		input string
		want  int64
	}{
		{"1000000", 1000000},
		{"3.7", 3}, // float 字符串截断为 int
		{"0", 0},
		{"", 0},
		{"  500  ", 500},
		{"invalid", 0},
	}
	for _, c := range cases {
		got := ParseStringInt(c.input)
		if got != c.want {
			t.Errorf("ParseStringInt(%q) = %d, want %d", c.input, got, c.want)
		}
	}
}
