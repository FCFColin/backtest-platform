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
	"upsideCapture", "downsideCapture", "upsideCaptureDaily", "downsideCaptureDaily",
	"upsideCaptureAnnual", "downsideCaptureAnnual",
	"captureSpread", "captureSpreadDaily", "captureSpreadAnnual",
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
}
var expectedBacktestParamsFields = []string{
	"startDate", "endDate", "startingValue", "baseCurrency",
	"adjustForInflation", "rollingWindowMonths", "benchmarkTicker",
	"extendedWithdrawalStats", "cashflowLegs", "oneTimeCashflows",
}
var expectedPortfolioInputFields = []string{
	"name", "assets", "rebalanceFrequency", "rebalanceThreshold",
	"rebalanceOffset", "rebalanceBands", "drag", "totalReturn",
	"glidepathYears", "glidepathToWeights",
}
var expectedRebalanceBandsFields = []string{
	"enabled", "absoluteBand", "relativeBand", "upperBand", "lowerBand",
}
var expectedCashflowLegFields = []string{
	"amount", "type", "frequency", "offset", "until",
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
}
var allowedBacktestResultExtraFields = []string{
	"fingerprint", // Go 引擎缓存指纹，不出现在 TS 契约中
}
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
		if tag == "" || tag == "-" { continue }
		name := strings.Split(tag, ",")[0]
if name != "" { names = append(names, name) }
	}
	return names
}
func toSet(items []string) map[string]bool {
	m := make(map[string]bool, len(items))
	for _, item := range items { m[item] = true }
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
if !expectedSet[f] && !allowedSet[f] { extra = append(extra, f) }
	}
	var missing []string
	if exact {
		for _, f := range expected {
if !goSet[f] { missing = append(missing, f) }
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
func TestStatisticsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(Statistics{}), expectedStatisticsFields, nil, false, "Statistics")
}
func TestBacktestParamsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(BacktestParams{}), expectedBacktestParamsFields, nil, true, "BacktestParams")
}
func TestPortfolioInputJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(PortfolioInput{}), expectedPortfolioInputFields, nil, true, "PortfolioInput")
}
func TestRebalanceBandsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(RebalanceBands{}), expectedRebalanceBandsFields, nil, true, "RebalanceBands")
}
func TestCashflowLegJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(CashflowLeg{}), expectedCashflowLegFields, nil, true, "CashflowLeg")
}
func TestOneTimeCashflowJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(OneTimeCashflow{}), expectedOneTimeCashflowFields, nil, true, "OneTimeCashflow")
}
func TestAssetInputJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(AssetInput{}), expectedAssetInputFields, nil, true, "AssetInput")
}
func TestPortfolioResultJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(PortfolioResult{}), expectedPortfolioResultFields, nil, false, "PortfolioResult")
}
func TestBacktestResultJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(BacktestResult{}), expectedBacktestResultFields, allowedBacktestResultExtraFields, true, "BacktestResult")
}
func TestDrawdownEpisodeJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(DrawdownEpisode{}), expectedDrawdownEpisodeFields, nil, true, "DrawdownEpisode")
}
func TestDataPointJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(DataPoint{}), expectedDataPointFields, nil, true, "DataPoint")
}
func TestDrawdownPointJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(DrawdownPoint{}), expectedDrawdownPointFields, nil, true, "DrawdownPoint")
}
func TestAnnualReturnJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(AnnualReturn{}), expectedAnnualReturnFields, nil, true, "AnnualReturn")
}
func TestMonthlyReturnJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(MonthlyReturn{}), expectedMonthlyReturnFields, nil, true, "MonthlyReturn")
}
func TestRollingReturnJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(RollingReturn{}), expectedRollingReturnFields, nil, true, "RollingReturn")
}
func TestAllocationPointJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(AllocationPoint{}), expectedAllocationPointFields, nil, true, "AllocationPoint")
}
func TestVaRLevelsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(VaRLevels{}), expectedVaRLevelsFields, nil, true, "VaRLevels")
}
func TestVaRByFrequencyJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(VaRByFrequency{}), expectedVaRByFrequencyFields, nil, true, "VaRByFrequency")
}
func TestSkewnessByFrequencyJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(SkewnessByFrequency{}), expectedSkewnessByFrequencyFields, nil, true, "SkewnessByFrequency")
}
