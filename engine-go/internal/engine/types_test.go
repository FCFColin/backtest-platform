// Package engine 的类型一致性单测。
package engine

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

var expectedStatisticsFields = []string{
	"cagr", "mwrr", "totalReturn", "bestYear", "worstYear", "avgYear",
	"avgAnnualReturn", "avgMonthlyReturn", "avgDailyReturn",
	"stdev", "stdevAnnual", "stdevMonthly", "stdevMonthlyRaw", "stdevDaily", "stdevDailyRaw",
	"downsideDeviation", "downsideDeviationDailyRaw", "downsideDeviationMonthly",
	"downsideDeviationMonthlyRaw", "downsideDeviationAnnual",
	"maxDrawdown", "maxDrawdownDuration", "avgDrawdown", "ulcerIndex", "drawdownRecoveryFactor",
	"sharpe", "sortino", "calmar", "ulcerPerformanceIndex", "diversificationRatio", "m2",
	"alpha", "beta", "rSquared", "treynor", "benchmarkCorrelation",
	"upsideCorrelation", "downsideCorrelation", "upsideBeta", "downsideBeta",
	"alphaDaily", "alphaAnnualized",
	"upsideCapture", "downsideCapture",
	"captureSpread",
	"activeReturn", "trackingError", "informationRatio",
	"var", "cvar",
	"var5", "cvar5",
	"cvarDaily10",
	"cvarMonthly10",
	"cvarAnnual10",
	"skewness", "skewnessAnnual",
	"excessKurtosis", "excessKurtosisAnnual",
	"winRate", "pctPositiveDays", "pctPositiveMonths", "pctPositiveYears",
	"maxDailyReturn", "minDailyReturn", "maxMonthlyReturn", "minMonthlyReturn",
	"maxAnnualReturn", "minAnnualReturn",
	"avgDailyGain", "avgDailyLoss", "gainLossRatioDaily",
	"avgMonthlyGain", "avgMonthlyLoss", "gainLossRatioMonthly",
	"avgAnnualGain", "avgAnnualLoss", "gainLossRatioAnnual",
	"swr", "pwr", "swr10y", "pwr10y", "swr20y", "pwr20y", "swr30y", "pwr30y", "swr40y", "pwr40y",
	"psr", "hurstExponent", "burkeRatio", "martinRatio", "sterlingRatio", "battingAverage",
}
var expectedBacktestParamsFields = []string{
	"startDate", "endDate", "startingValue",
	"adjustForInflation", "rollingWindowMonths", "benchmarkTicker",
	"cashflowLegs", "oneTimeCashflows", "risk_free_rate",
}
var expectedPortfolioInputFields = []string{
	"name", "assets", "rebalanceFrequency", "rebalanceThreshold",
	"rebalanceOffset", "rebalanceBands", "drag",
	"glidepathYears", "glidepathToWeights",
}
var expectedRebalanceBandsFields = []string{
	"enabled", "absoluteBand", "relativeBand",
}
var expectedCashflowLegFields = []string{
	"amount", "type", "frequency", "until",
}
var expectedOneTimeCashflowFields = []string{
	"amount", "type", "date",
}
var expectedAssetInputFields = []string{
	"ticker", "weight",
}
var expectedPortfolioResultFields = []string{
	"name", "growthCurve", "drawdownCurve", "rollingReturns",
	"annualReturns", "monthlyReturns", "statistics",
	"withdrawalStats", "drawdownEpisodes", "allocationHistory", "drag",
}
var expectedBacktestResultFields = []string{
	"portfolios", "correlations", "benchmarkGrowth", "assetTickers", "assetCorrelations",
	"quarterlyCorrelations",
}
var allowedBacktestResultExtraFields = []string{}
var expectedDrawdownEpisodeFields = []string{
	"peakDate", "troughDate", "recoveryDate",
	"depth", "timeToTrough", "recoveryTime", "totalTimeDurationDays",
	"recoveryFactor", "cagrDuring", "ulcerDuring",
	"returnFromPeakToTrough", "returnFromTroughToRecovery",
}
var expectedDataPointFields = []string{"date", "value"}
var expectedDrawdownPointFields = []string{"date", "drawdown"}
var expectedAnnualReturnFields = []string{"year", "return"}
var expectedMonthlyReturnFields = []string{"year", "month", "return"}
var expectedRollingReturnFields = []string{"date", "return"}
var expectedAllocationPointFields = []string{"date", "weights"}
var expectedVaRLevelsFields = []string{"1", "5", "10"}
var expectedVaRByFrequencyFields = []string{"daily", "monthly", "annual"}
var expectedSkewnessByFrequencyFields = []string{"daily", "monthly", "annual"}

func extractJSONFields(t reflect.Type) []string {
	var names []string
	for i := 0; i < t.NumField(); i++ {
		tag := t.Field(i).Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		name := strings.Split(tag, ",")[0]
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}
func toSet(items []string) map[string]bool {
	m := make(map[string]bool, len(items))
	for _, item := range items {
		m[item] = true
	}
	return m
}
func assertJSONFields(t *testing.T, typ reflect.Type, expected, allowedExtra []string, exact bool, typeName string) {
	t.Helper()
	expectedSet := toSet(expected)
	allowedSet := toSet(allowedExtra)
	goFields := extractJSONFields(typ)
	goSet := toSet(goFields)
	var extra []string
	for _, f := range goFields {
		if !expectedSet[f] && !allowedSet[f] {
			extra = append(extra, f)
		}
	}
	var missing []string
	if exact {
		for _, f := range expected {
			if !goSet[f] {
				missing = append(missing, f)
			}
		}
	}
	if len(extra) > 0 || len(missing) > 0 {
		sort.Strings(extra)
		sort.Strings(missing)
		t.Errorf("%s JSON tag 与 TS 契约漂移:\n"+
			"  多余字段(Go有/TS无): %v\n"+
			"  缺失字段(TS有/Go无): %v\n"+
			"  期望字段(TS): %v\n"+
			"  实际字段(Go): %v",
			typeName, extra, missing, expected, goFields)
	}
}
func TestJSONTagsConformance(t *testing.T) {
	cases := []struct {
		name     string
		typ      reflect.Type
		expected []string
		allowed  []string
		exact    bool
	}{
		{"Statistics", reflect.TypeOf(Statistics{}), expectedStatisticsFields, nil, false},
		{"BacktestParams", reflect.TypeOf(BacktestParams{}), expectedBacktestParamsFields, nil, true},
		{"PortfolioInput", reflect.TypeOf(PortfolioInput{}), expectedPortfolioInputFields, nil, true},
		{"RebalanceBands", reflect.TypeOf(RebalanceBands{}), expectedRebalanceBandsFields, nil, true},
		{"CashflowLeg", reflect.TypeOf(CashflowLeg{}), expectedCashflowLegFields, nil, true},
		{"OneTimeCashflow", reflect.TypeOf(OneTimeCashflow{}), expectedOneTimeCashflowFields, nil, true},
		{"AssetInput", reflect.TypeOf(AssetInput{}), expectedAssetInputFields, nil, true},
		{"PortfolioResult", reflect.TypeOf(PortfolioResult{}), expectedPortfolioResultFields, nil, false},
		{"BacktestResult", reflect.TypeOf(BacktestResult{}), expectedBacktestResultFields, allowedBacktestResultExtraFields, true},
		{"DrawdownEpisode", reflect.TypeOf(DrawdownEpisode{}), expectedDrawdownEpisodeFields, nil, true},
		{"DataPoint", reflect.TypeOf(DataPoint{}), expectedDataPointFields, nil, true},
		{"DrawdownPoint", reflect.TypeOf(DrawdownPoint{}), expectedDrawdownPointFields, nil, true},
		{"AnnualReturn", reflect.TypeOf(AnnualReturn{}), expectedAnnualReturnFields, nil, true},
		{"MonthlyReturn", reflect.TypeOf(MonthlyReturn{}), expectedMonthlyReturnFields, nil, true},
		{"RollingReturn", reflect.TypeOf(RollingReturn{}), expectedRollingReturnFields, nil, true},
		{"AllocationPoint", reflect.TypeOf(AllocationPoint{}), expectedAllocationPointFields, nil, true},
		{"VaRLevels", reflect.TypeOf(VaRLevels{}), expectedVaRLevelsFields, nil, true},
		{"VaRByFrequency", reflect.TypeOf(VaRByFrequency{}), expectedVaRByFrequencyFields, nil, true},
		{"SkewnessByFrequency", reflect.TypeOf(SkewnessByFrequency{}), expectedSkewnessByFrequencyFields, nil, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assertJSONFields(t, tc.typ, tc.expected, tc.allowed, tc.exact, tc.name)
		})
	}
}
