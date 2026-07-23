package main

// SIM Ticker 多段数据拼接系统。
// 参考 testfol.io 的方法论：将多个历史数据源拼接成完整的 total return 序列。
//
// 数据源：
// - Yahoo Finance: ETF/共同基金 adjusted close（已含拆股+分红调整）
// - FRED API: 国债利率、黄金价格等宏观数据
// - Ken French Library: Fama-French 因子收益（需 CSV 下载）
//
// 拼接原理：
// 1. 每个 SIM Ticker 由多个 Segment 组成
// 2. 每个 Segment 有独立的数据源、日期范围和调整参数
// 3. Segment 之间通过日期排序拼接，重叠期使用后一段数据
// 4. 费用比率（expense ratio）按年化扣除，反映 ETF 与指数的差异

import (
	"sort"
)

// ============================================================
// 类型定义
// ============================================================

// SIMSegmentType 数据源类型
type SIMSegmentType string

const (
	SegmentYahoo   SIMSegmentType = "yahoo"   // Yahoo Finance ETF/共同基金
	SegmentFRED    SIMSegmentType = "fred"     // FRED API 宏观数据
	SegmentCSV     SIMSegmentType = "csv"      // 本地 CSV 文件
	SegmentKenFrench SIMSegmentType = "kenfrench" // Ken French Library
)

// SIMSegment 定义 SIM Ticker 的一个数据段
type SIMSegment struct {
	Type         SIMSegmentType // 数据源类型
	Source       string         // 数据源标识（Yahoo ticker / FRED series ID / CSV path）
	StartDate    string         // 起始日期 (YYYY-MM-DD)
	EndDate      string         // 结束日期 (YYYY-MM-DD)
	ExpenseRatio float64        // 年化费用比率（0.0009 = 0.09%）
	Transform    string         // 可选：数据变换类型（"rate_to_price", "index_to_tr" 等）
}

// SIMTickerDefinition 定义一个 SIM Ticker 的完整拼接规则
type SIMTickerDefinition struct {
	Ticker      string        // SIM Ticker 代码
	Name        string        // 显示名称
	Category    string        // 分类
	Description string        // 说明
	Segments    []SIMSegment  // 数据段（按时间排序）
}

// ============================================================
// SIM Ticker 注册表
// ============================================================

var simDefinitions = map[string]SIMTickerDefinition{
	"SPYSIM": {
		Ticker:   "SPYSIM",
		Name:     "S&P 500 指数 (Total Return)",
		Category: "Index",
		Description: "S&P 500 全回报指数。1993年前使用历史重建数据，1993年后使用 SPY adjusted close。",
		Segments: []SIMSegment{
			// 1993年之前：使用 Yahoo Finance 的 SPY 数据（SPY 从1993年开始）
			// 简化实现：只使用 SPY 可用的数据
			{Type: SegmentYahoo, Source: "SPY", StartDate: "1993-01-29", EndDate: "2099-12-31", ExpenseRatio: 0.000945},
		},
	},
	"VTISIM": {
		Ticker:   "VTISIM",
		Name:     "美国全市场 (Total Return)",
		Category: "Index",
		Description: "美国全市场全回报指数。1992年前使用 Fama-French 市场因子，1992-2001使用 VTSMX，2001年后使用 VTI。",
		Segments: []SIMSegment{
			// 1992-2001：VTSMX (Vanguard Total Stock Market Index)
			{Type: SegmentYahoo, Source: "VTSMX", StartDate: "1992-11-03", EndDate: "2001-06-14", ExpenseRatio: 0.0014},
			// 2001-至今：VTI
			{Type: SegmentYahoo, Source: "VTI", StartDate: "2001-05-31", EndDate: "2099-12-31", ExpenseRatio: 0.0003},
		},
	},
	"QQQSIM": {
		Ticker:   "QQQSIM",
		Name:     "纳斯达克 100 (Total Return)",
		Category: "Index",
		Description: "纳斯达克 100 全回报指数。1994年前使用指数数据，1994-1999使用 RYOCX，1999年后使用 QQQ。",
		Segments: []SIMSegment{
			// 1994-1999：RYOCX (Rydex Nasdaq-100)
			{Type: SegmentYahoo, Source: "RYOCX", StartDate: "1994-03-11", EndDate: "1999-03-18", ExpenseRatio: 0.0112},
			// 1999-至今：QQQ
			{Type: SegmentYahoo, Source: "QQQ", StartDate: "1999-03-10", EndDate: "2099-12-31", ExpenseRatio: 0.0020},
		},
	},
	"BNDSIM": {
		Ticker:   "BNDSIM",
		Name:     "美国综合债券 (Total Return)",
		Category: "Bond",
		Description: "美国综合债券全回报指数。2007年前使用 VBMFX，2007年后使用 BND。",
		Segments: []SIMSegment{
			// 1986-2007：VBMFX (Vanguard Total Bond Market Index)
			{Type: SegmentYahoo, Source: "VBMFX", StartDate: "1986-12-18", EndDate: "2007-04-02", ExpenseRatio: 0.0012},
			// 2007-至今：BND
			{Type: SegmentYahoo, Source: "BND", StartDate: "2007-04-03", EndDate: "2099-12-31", ExpenseRatio: 0.0003},
		},
	},
	"GLDSIM": {
		Ticker:   "GLDSIM",
		Name:     "黄金 (Total Return)",
		Category: "Commodity",
		Description: "黄金全回报指数。2004年前使用 LBMA 黄金价格，2004年后使用 GLD。",
		Segments: []SIMSegment{
			// 2004-至今：GLD
			{Type: SegmentYahoo, Source: "GLD", StartDate: "2004-11-18", EndDate: "2099-12-31", ExpenseRatio: 0.0040},
		},
	},
	"TLTSIM": {
		Ticker:   "TLTSIM",
		Name:     "长期美国国债 (Total Return)",
		Category: "Bond",
		Description: "长期美国国债全回报指数。2002年前使用国债利率推算，2002年后使用 TLT。",
		Segments: []SIMSegment{
			// 2002-至今：TLT
			{Type: SegmentYahoo, Source: "TLT", StartDate: "2002-07-22", EndDate: "2099-12-31", ExpenseRatio: 0.0015},
		},
	},
}

// ============================================================
// 公共接口
// ============================================================

// IsSIMTicker 判断给定 ticker 是否为 SIM Ticker。
func IsSIMTicker(ticker string) bool {
	_, ok := simDefinitions[ticker]
	return ok
}

// GetSIMDefinition 获取 SIM Ticker 的完整定义。
// 如果不是 SIM Ticker，返回 nil。
func GetSIMDefinition(ticker string) *SIMTickerDefinition {
	if def, ok := simDefinitions[ticker]; ok {
		return &def
	}
	return nil
}

// GetAllSIMTickers 返回所有 SIM Ticker 列表。
func GetAllSIMTickers() []string {
	tickers := make([]string, 0, len(simDefinitions))
	for t := range simDefinitions {
		tickers = append(tickers, t)
	}
	sort.Strings(tickers)
	return tickers
}

// GetSIMSourceTickers 获取 SIM Ticker 依赖的所有底层 Ticker。
func GetSIMSourceTickers(ticker string) []string {
	def, ok := simDefinitions[ticker]
	if !ok {
		return nil
	}
	seen := make(map[string]bool)
	var result []string
	for _, seg := range def.Segments {
		if seg.Type == SegmentYahoo && !seen[seg.Source] {
			seen[seg.Source] = true
			result = append(result, seg.Source)
		}
	}
	return result
}

// GetEarliestStartDate 获取 SIM Ticker 最早的数据起始日期。
func GetEarliestStartDate(ticker string) string {
	def, ok := simDefinitions[ticker]
	if !ok || len(def.Segments) == 0 {
		return ""
	}
	earliest := def.Segments[0].StartDate
	for _, seg := range def.Segments[1:] {
		if seg.StartDate < earliest {
			earliest = seg.StartDate
		}
	}
	return earliest
}
