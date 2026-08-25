package fred

import (
	"math"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"data-fetcher/internal/httpclient"
)

func mustClient() *httpclient.Client {
	return httpclient.New("fred-test", httpclient.Options{
		RequestDelay:   time.Millisecond,
		MaxRetries:     1,
		ConnectTimeout: time.Second,
		ReadTimeout:    time.Second,
	})
}

func TestParseObservations(t *testing.T) {
	body := []byte(`{"observations":[
		{"date":"2024-01-02","value":"5.40"},
		{"date":"2024-01-03","value":"."},
		{"date":"2024-01-04","value":""},
		{"date":"2024-01-05","value":"garbage"},
		{"date":"bad-date","value":"5.30"},
		{"date":"2024-01-08","value":"5.35"}
	]}`)
	got, err := ParseObservations(body)
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("应仅保留 2 个有效观测（跳过 ./空/非法/坏日期），got %d: %+v", len(got), got)
	}
	if got[0].Date != "2024-01-02" || math.Abs(got[0].Rate-0.054) > 1e-12 {
		t.Errorf("首点 = %+v, want {2024-01-02 ~0.054}", got[0])
	}
	if math.Abs(got[1].Rate-0.0535) > 1e-12 {
		t.Errorf("百分数→小数换算错误: %v", got[1].Rate)
	}
}

func TestFetchDailyRates_RequestShape(t *testing.T) {
	var gotPath, gotQuery string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotQuery = r.URL.Path, r.URL.RawQuery
		w.Write([]byte(`{"observations":[{"date":"2024-01-02","value":"5.40"}]}`))
	}))
	defer ts.Close()

	c := NewWithBase("test-key", ts.URL, mustClient())
	if _, err := c.FetchDailyRates(t.Context(), "DGS3MO", "2024-01-01", "2024-02-01"); err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if gotPath != "/fred/series/observations" {
		t.Errorf("path = %s", gotPath)
	}
	for _, want := range []string{"series_id=DGS3MO", "api_key=test-key", "file_type=json", "observation_start=2024-01-01"} {
		if !contains(gotQuery, want) {
			t.Errorf("query 缺 %s: %s", want, gotQuery)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}
func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
