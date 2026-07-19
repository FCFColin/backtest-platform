// Package engine 的类型一致性单测。
//
// 本文件通过反射提取 Go 结构体的 json tag，与 packages/shared/types/*.ts 中
// 对应 interface 的字段名集合做结构断言，防止 Go 与 TS 之间的手工同步漂移。
//
// 期望字段列表硬编码在下方 var 声明中，修改 TS 类型时必须同步更新。
// codegen 方案不在本文件范围内。
package engine

import (
	"reflect"
	"sort"
	"strings"
	"testing"
)

// ============================================================
// 期望字段列表 — 与 packages/shared/types/*.ts 的对应 interface 字段保持一致。
// 修改 TS 类型时必须同步更新此处，单测会自动捕获漂移。
// ============================================================

// 与 packages/shared/types/statistics.ts 的 Statistics interface 字段保持一致。
// Go 引擎仅实现 TS Statistics 的子集（TS 端 100+ 字段，多数为可选），
// 故使用 subset 模式校验：Go 的每个字段必须在 TS 集合中存在，但反之不要求。
var expectedStatisticsFields = []string{
	// 核心收益
	"cagr", "mwrr", "totalReturn", "bestYear", "worstYear", "avgYear",
	"avgAnnualReturn", "avgMonthlyReturn", "avgDailyReturn",
	// 波动率
	"stdev", "stdevAnnual", "stdevMonthly", "stdevMonthlyRaw", "stdevDaily", "stdevDailyRaw",
	// 下行偏差
	"downsideDeviation", "downsideDeviationDailyRaw", "downsideDeviationMonthly",
	"downsideDeviationMonthlyRaw", "downsideDeviationAnnual",
	// 回撤
	"maxDrawdown", "maxDrawdownDuration", "avgDrawdown", "ulcerIndex", "drawdownRecoveryFactor",
	// 风险调整
	"sharpe", "sortino", "calmar", "ulcerPerformanceIndex", "diversificationRatio", "m2",
	// 基准相关
	"alpha", "beta", "rSquared", "treynor", "benchmarkCorrelation",
	"upsideCorrelation", "downsideCorrelation", "upsideBeta", "downsideBeta",
	"alphaDaily", "alphaAnnualized",
	// 捕获率
	"upsideCapture", "downsideCapture", "upsideCaptureDaily", "downsideCaptureDaily",
	"upsideCaptureAnnual", "downsideCaptureAnnual",
	"captureSpread", "captureSpreadDaily", "captureSpreadAnnual",
	// 主动管理
	"activeReturn", "trackingError", "informationRatio",
	// VaR / CVaR 嵌套
	"var", "cvar",
	// 扁平 VaR/CVaR
	"var5", "cvar5",
	"varDaily1", "varDaily5", "varDaily10", "cvarDaily1", "cvarDaily5", "cvarDaily10",
	"varMonthly1", "varMonthly5", "varMonthly10", "cvarMonthly1", "cvarMonthly5", "cvarMonthly10",
	"varAnnual1", "varAnnual5", "varAnnual10", "cvarAnnual1", "cvarAnnual5", "cvarAnnual10",
	// 分布特征
	"skewness", "skewnessDaily", "skewnessMonthly", "skewnessAnnual",
	"excessKurtosis", "excessKurtosisDaily", "excessKurtosisMonthly", "excessKurtosisAnnual",
	// 正收益比例
	"winRate", "pctPositiveDays", "pctPositiveMonths", "pctPositiveYears",
	// 极值收益
	"maxDailyReturn", "minDailyReturn", "maxMonthlyReturn", "minMonthlyReturn",
	"maxAnnualReturn", "minAnnualReturn",
	// 平均盈亏 & 盈亏比
	"avgDailyGain", "avgDailyLoss", "gainLossRatioDaily",
	"avgMonthlyGain", "avgMonthlyLoss", "gainLossRatioMonthly",
	"avgAnnualGain", "avgAnnualLoss", "gainLossRatioAnnual",
	// 提款率
	"swr", "pwr", "swr10y", "pwr10y", "swr20y", "pwr20y", "swr30y", "pwr30y", "swr40y", "pwr40y",
}

// 与 packages/shared/types/backtest.ts 的 BacktestParameters interface 字段保持一致。
var expectedBacktestParamsFields = []string{
	"startDate", "endDate", "startingValue", "baseCurrency",
	"adjustForInflation", "rollingWindowMonths", "benchmarkTicker",
	"extendedWithdrawalStats", "cashflowLegs", "oneTimeCashflows",
}

// 与 packages/shared/types/portfolio.ts 的 Portfolio interface 字段保持一致。
// 排除字段（Go 端故意不实现）：
//   - id: 前端专用（crypto.randomUUID，仅用于列表 key），不提交后端
//   - isGlidepath/glidepathFrom/glidepathTo: Go 使用 glidepathToWeights（显式权重）
//     替代 glidepathTo（组合 ID 引用），映射在 API 层完成
var expectedPortfolioInputFields = []string{
	"name", "assets", "rebalanceFrequency", "rebalanceThreshold",
	"rebalanceOffset", "rebalanceBands", "drag", "totalReturn",
	"glidepathYears", "glidepathToWeights",
}

// 与 packages/shared/types/portfolio.ts 的 RebalanceBands interface 字段保持一致。
var expectedRebalanceBandsFields = []string{
	"enabled", "absoluteBand", "relativeBand", "upperBand", "lowerBand",
}

// 与 packages/shared/types/portfolio.ts 的 CashflowLeg interface 字段保持一致。
// 排除字段：id（继承自 CashflowBase，前端专用，不提交后端）。
var expectedCashflowLegFields = []string{
	"amount", "type", "frequency", "offset", "until",
}

// 与 packages/shared/types/portfolio.ts 的 OneTimeCashflow interface 字段保持一致。
// 排除字段：id（继承自 CashflowBase，前端专用，不提交后端）。
var expectedOneTimeCashflowFields = []string{
	"amount", "type", "date",
}

// 与 packages/shared/types/portfolio.ts 的 Asset interface 字段保持一致。
// 排除字段：id（前端专用，可选，仅用于列表 key）。
var expectedAssetInputFields = []string{
	"ticker", "weight",
}

// 与 packages/shared/types/backtest.ts 的 PortfolioResult interface 字段保持一致。
// Go 引擎当前未计算 withdrawalStats 和 drag，故使用 subset 模式校验。
var expectedPortfolioResultFields = []string{
	"name", "growthCurve", "drawdownCurve", "rollingReturns",
	"annualReturns", "monthlyReturns", "statistics",
	"withdrawalStats", "drawdownEpisodes", "allocationHistory", "drag",
}

// 与 packages/shared/types/backtest.ts 的 BacktestResult interface 字段保持一致。
var expectedBacktestResultFields = []string{
	"portfolios", "correlations", "benchmarkGrowth", "assetTickers", "assetCorrelations",
}

// BacktestResult 允许的 Go 专用扩展字段（TS 端不存在，但 Go 引擎需要）。
var allowedBacktestResultExtraFields = []string{
	"fingerprint", // Go 引擎缓存指纹，不出现在 TS 契约中
}

// 与 packages/shared/types/backtest.ts 的 DrawdownEpisode interface 字段保持一致。
var expectedDrawdownEpisodeFields = []string{
	"peakDate", "troughDate", "recoveryDate",
	"depth", "timeToTrough", "recoveryTime", "totalTime",
	"recoveryFactor", "cagrDuring", "ulcerDuring",
	"returnFromPeakToTrough", "returnFromTroughToRecovery",
}

// 与 packages/shared/types/backtest.ts 的 TimeSeriesPoint 类型字段保持一致。
var expectedDataPointFields = []string{"date", "value"}

// 与 packages/shared/types/backtest.ts 的 drawdownCurve 内联类型字段保持一致。
var expectedDrawdownPointFields = []string{"date", "drawdown"}

// 与 packages/shared/types/backtest.ts 的 annualReturns 内联类型字段保持一致。
var expectedAnnualReturnFields = []string{"year", "return"}

// 与 packages/shared/types/backtest.ts 的 monthlyReturns 内联类型字段保持一致。
var expectedMonthlyReturnFields = []string{"year", "month", "return"}

// 与 packages/shared/types/backtest.ts 的 rollingReturns 内联类型字段保持一致。
var expectedRollingReturnFields = []string{"date", "return"}

// 与 packages/shared/types/backtest.ts 的 allocationHistory 内联类型字段保持一致。
var expectedAllocationPointFields = []string{"date", "weights"}

// 与 packages/shared/types/statistics.ts 的 Statistics.var 内联类型字段保持一致。
// TS 端为 { [K in 1 | 5 | 10]: number }，JSON 序列化后键为字符串 "1"/"5"/"10"。
var expectedVaRLevelsFields = []string{"1", "5", "10"}

// 与 packages/shared/types/statistics.ts 的 var/cvar 内联类型字段保持一致。
var expectedVaRByFrequencyFields = []string{"daily", "monthly", "annual"}

// 与 packages/shared/types/statistics.ts 的 skewness/excessKurtosis/winRate 内联类型字段保持一致。
var expectedSkewnessByFrequencyFields = []string{"daily", "monthly", "annual"}

// ============================================================
// 辅助函数
// ============================================================

// extractJSONFields 从结构体类型提取所有 json tag 的字段名。
// 忽略 json:"-" 和无 json tag 的字段。处理 omitempty 等选项。
func extractJSONFields(t reflect.Type) []string {
	var names []string
	for i := 0; i < t.NumField(); i++ {
		tag := t.Field(i).Tag.Get("json")
		if tag == "" || tag == "-" {
			continue
		}
		// 取逗号前的部分作为字段名
		name := strings.Split(tag, ",")[0]
		if name != "" {
			names = append(names, name)
		}
	}
	return names
}

// toSet 将字符串切片转为集合。
func toSet(items []string) map[string]bool {
	m := make(map[string]bool, len(items))
	for _, item := range items {
		m[item] = true
	}
	return m
}

// assertJSONFields 校验 Go 结构体的 json tag 与 TS 端期望字段集的一致性。
//
// 参数：
//   - expected: TS 端字段集（源 of truth）
//   - allowedExtra: Go 端允许的额外字段（TS 端不存在，如 fingerprint）
//   - exact: true=精确匹配（Go 必须包含所有 expected 字段）；false=子集匹配（Go 字段必须是 expected 的子集）
//   - typeName: 类型名（用于错误消息）
//
// 失败时打印清晰的 diff（多余字段、缺失字段）。
func assertJSONFields(t *testing.T, typ reflect.Type, expected, allowedExtra []string, exact bool, typeName string) {
	t.Helper()

	expectedSet := toSet(expected)
	allowedSet := toSet(allowedExtra)

	goFields := extractJSONFields(typ)
	goSet := toSet(goFields)

	// 检查多余字段：Go 有但 expected 和 allowed 都没有
	var extra []string
	for _, f := range goFields {
		if !expectedSet[f] && !allowedSet[f] {
			extra = append(extra, f)
		}
	}

	// 检查缺失字段：expected 有但 Go 没有（仅 exact 模式）
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

// ============================================================
// 结构断言单测
// ============================================================

// TestStatisticsJSONTags 校验 Statistics 的 json tag 与 TS Statistics interface 一致。
// Statistics 使用 subset 模式：Go 引擎仅实现 TS 字段的子集，但每个 Go 字段必须在 TS 集合中存在。
func TestStatisticsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(Statistics{}), expectedStatisticsFields, nil, false, "Statistics")
}

// TestBacktestParamsJSONTags 校验 BacktestParams 的 json tag 与 TS BacktestParameters interface 精确一致。
func TestBacktestParamsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(BacktestParams{}), expectedBacktestParamsFields, nil, true, "BacktestParams")
}

// TestPortfolioInputJSONTags 校验 PortfolioInput 的 json tag 与 TS Portfolio interface 一致。
// 使用精确匹配（已排除前端专用字段 id 和 glidepath 映射字段）。
func TestPortfolioInputJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(PortfolioInput{}), expectedPortfolioInputFields, nil, true, "PortfolioInput")
}

// TestRebalanceBandsJSONTags 校验 RebalanceBands 的 json tag 与 TS RebalanceBands interface 精确一致。
func TestRebalanceBandsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(RebalanceBands{}), expectedRebalanceBandsFields, nil, true, "RebalanceBands")
}

// TestCashflowLegJSONTags 校验 CashflowLeg 的 json tag 与 TS CashflowLeg interface 一致。
// 使用精确匹配（已排除前端专用字段 id）。
func TestCashflowLegJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(CashflowLeg{}), expectedCashflowLegFields, nil, true, "CashflowLeg")
}

// TestOneTimeCashflowJSONTags 校验 OneTimeCashflow 的 json tag 与 TS OneTimeCashflow interface 一致。
// 使用精确匹配（已排除前端专用字段 id）。
func TestOneTimeCashflowJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(OneTimeCashflow{}), expectedOneTimeCashflowFields, nil, true, "OneTimeCashflow")
}

// TestAssetInputJSONTags 校验 AssetInput 的 json tag 与 TS Asset interface 一致。
// 使用精确匹配（已排除前端专用字段 id）。
func TestAssetInputJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(AssetInput{}), expectedAssetInputFields, nil, true, "AssetInput")
}

// TestPortfolioResultJSONTags 校验 PortfolioResult 的 json tag 与 TS PortfolioResult interface 一致。
// 使用 subset 模式：Go 引擎当前未计算 withdrawalStats 和 drag（TS 端可选字段）。
func TestPortfolioResultJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(PortfolioResult{}), expectedPortfolioResultFields, nil, false, "PortfolioResult")
}

// TestBacktestResultJSONTags 校验 BacktestResult 的 json tag 与 TS BacktestResult interface 一致。
// 允许 Go 专用扩展字段 fingerprint（缓存指纹）。
func TestBacktestResultJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(BacktestResult{}), expectedBacktestResultFields, allowedBacktestResultExtraFields, true, "BacktestResult")
}

// TestDrawdownEpisodeJSONTags 校验 DrawdownEpisode 的 json tag 与 TS DrawdownEpisode interface 精确一致。
func TestDrawdownEpisodeJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(DrawdownEpisode{}), expectedDrawdownEpisodeFields, nil, true, "DrawdownEpisode")
}

// TestDataPointJSONTags 校验 DataPoint 的 json tag 与 TS TimeSeriesPoint 类型精确一致。
func TestDataPointJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(DataPoint{}), expectedDataPointFields, nil, true, "DataPoint")
}

// TestDrawdownPointJSONTags 校验 DrawdownPoint 的 json tag 与 TS drawdownCurve 内联类型精确一致。
func TestDrawdownPointJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(DrawdownPoint{}), expectedDrawdownPointFields, nil, true, "DrawdownPoint")
}

// TestAnnualReturnJSONTags 校验 AnnualReturn 的 json tag 与 TS annualReturns 内联类型精确一致。
func TestAnnualReturnJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(AnnualReturn{}), expectedAnnualReturnFields, nil, true, "AnnualReturn")
}

// TestMonthlyReturnJSONTags 校验 MonthlyReturn 的 json tag 与 TS monthlyReturns 内联类型精确一致。
func TestMonthlyReturnJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(MonthlyReturn{}), expectedMonthlyReturnFields, nil, true, "MonthlyReturn")
}

// TestRollingReturnJSONTags 校验 RollingReturn 的 json tag 与 TS rollingReturns 内联类型精确一致。
func TestRollingReturnJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(RollingReturn{}), expectedRollingReturnFields, nil, true, "RollingReturn")
}

// TestAllocationPointJSONTags 校验 AllocationPoint 的 json tag 与 TS allocationHistory 内联类型精确一致。
func TestAllocationPointJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(AllocationPoint{}), expectedAllocationPointFields, nil, true, "AllocationPoint")
}

// TestVaRLevelsJSONTags 校验 VaRLevels 的 json tag 与 TS Statistics.var 内联类型精确一致。
// TS 端为 { [K in 1 | 5 | 10]: number }，JSON 序列化后键为字符串 "1"/"5"/"10"。
func TestVaRLevelsJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(VaRLevels{}), expectedVaRLevelsFields, nil, true, "VaRLevels")
}

// TestVaRByFrequencyJSONTags 校验 VaRByFrequency 的 json tag 与 TS var/cvar 内联类型精确一致。
func TestVaRByFrequencyJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(VaRByFrequency{}), expectedVaRByFrequencyFields, nil, true, "VaRByFrequency")
}

// TestSkewnessByFrequencyJSONTags 校验 SkewnessByFrequency 的 json tag 与 TS skewness/excessKurtosis/winRate 内联类型精确一致。
func TestSkewnessByFrequencyJSONTags(t *testing.T) {
	assertJSONFields(t, reflect.TypeOf(SkewnessByFrequency{}), expectedSkewnessByFrequencyFields, nil, true, "SkewnessByFrequency")
}
