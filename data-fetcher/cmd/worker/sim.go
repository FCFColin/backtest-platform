package main

import (
	"context"
	"data-fetcher/internal/provider"
	"fmt"
	"github.com/jackc/pgx/v5/pgxpool"
	"log/slog"
	"sort"
)

type SIMSegmentType string

const (
	SegmentYahoo     SIMSegmentType = "yahoo"
	SegmentCSV       SIMSegmentType = "csv"
	SegmentKenFrench SIMSegmentType = "kenfrench"
)

type SIMSegment struct {
	Type         SIMSegmentType
	Source       string
	StartDate    string
	EndDate      string
	ExpenseRatio float64
	Transform    string
}
type SIMTickerDefinition struct {
	Ticker      string
	Name        string
	Category    string
	Description string
	Segments    []SIMSegment
}

const simEndDate = "2099-12-31"

func simSeg(source, start string, expense float64) SIMSegment {
	return SIMSegment{Type: SegmentYahoo, Source: source, StartDate: start, EndDate: simEndDate, ExpenseRatio: expense}
}
func simSegRange(source, start, end string, expense float64) SIMSegment {
	return SIMSegment{Type: SegmentYahoo, Source: source, StartDate: start, EndDate: end, ExpenseRatio: expense}
}
func simDef(ticker, name, category, desc string, segs ...SIMSegment) SIMTickerDefinition {
	return SIMTickerDefinition{Ticker: ticker, Name: name, Category: category, Description: desc, Segments: segs}
}

var simDefinitions = map[string]SIMTickerDefinition{
	"IEFSIM":   simDef("IEFSIM", "中期国债 (Total Return)", "Bond", "中期美国国债全回报指数。2002年前使用国债利率推算，2002年后使用 IEF。", simSeg("IEF", "2002-07-26", 0.0015)),
	"SHVSIM":   simDef("SHVSIM", "短期国债 (Total Return)", "Bond", "短期美国国债全回报指数。2007年后使用 SHV。", simSeg("SHV", "2007-01-11", 0.0015)),
	"VXUSSIM":  simDef("VXUSSIM", "国际股票 (Total Return)", "Equity", "国际股票全回报指数。2011年前使用 EAFE，2011年后使用 VXUS。", simSegRange("EFA", "2001-08-20", "2011-01-26", 0.0032), simSeg("VXUS", "2011-01-27", 0.0007)),
	"VNQSIM":   simDef("VNQSIM", "REIT (Total Return)", "RealEstate", "房地产投资信托全回报指数。2004年后使用 VNQ。", simSeg("VNQ", "2004-09-29", 0.0012)),
	"IWMSIM":   simDef("IWMSIM", "罗素 2000 (Total Return)", "Equity", "罗素 2000 小盘股全回报指数。2000年前使用 IWN，2000年后使用 IWM。", simSeg("IWM", "2000-05-22", 0.0019)),
	"EFASIM":   simDef("EFASIM", "MSCI EAFE (Total Return)", "Equity", "MSCI EAFE 发达市场全回报指数。2001年后使用 EFA。", simSeg("EFA", "2001-08-20", 0.0032)),
	"EEMSIM":   simDef("EEMSIM", "新兴市场 (Total Return)", "Equity", "新兴市场全回报指数。2003年后使用 EEM。", simSeg("EEM", "2003-04-11", 0.0070)),
	"TIPSIM":   simDef("TIPSIM", "TIPS (Total Return)", "Bond", "通胀保护债券全回报指数。2003年后使用 TIP。", simSeg("TIP", "2003-12-05", 0.0019)),
	"AGGSIM":   simDef("AGGSIM", "美国综合债券 (Total Return)", "Bond", "美国综合债券全回报指数。2003年后使用 AGG。", simSeg("AGG", "2003-09-29", 0.0004)),
	"SCHBSIM":  simDef("SCHBSIM", "宽基债券 (Total Return)", "Bond", "宽基美国债券全回报指数。2010年后使用 SCHB。", simSeg("SCHB", "2010-01-14", 0.0004)),
	"VTVOXSIM": simDef("VTVOXSIM", "中期债券 (Total Return)", "Bond", "中期美国债券全回报指数。2009年后使用 BIV。", simSeg("BIV", "2009-04-06", 0.0007)),
	"BSVSIM":   simDef("BSVSIM", "短期国债 (Total Return)", "Bond", "短期美国国债全回报指数。2007年后使用 BSV。", simSeg("BSV", "2007-04-05", 0.0007)),
	"VTESIM":   simDef("VTESIM", "免税债券 (Total Return)", "Bond", "市政债券全回报指数。2007年后使用 VTEB。", simSeg("VTEB", "2007-12-07", 0.0006)),
	"SPYSIM":   simDef("SPYSIM", "S&P 500 指数 (Total Return)", "Index", "S&P 500 全回报指数。1993年前使用历史重建数据，1993年后使用 SPY adjusted close。", simSeg("SPY", "1993-01-29", 0.000945)),
	"VTISIM":   simDef("VTISIM", "美国全市场 (Total Return)", "Index", "美国全市场全回报指数。1992年前使用 Fama-French 市场因子，1992-2001使用 VTSMX，2001年后使用 VTI。", simSegRange("VTSMX", "1992-11-03", "2001-06-14", 0.0014), simSeg("VTI", "2001-05-31", 0.0003)),
	"QQQSIM":   simDef("QQQSIM", "纳斯达克 100 (Total Return)", "Index", "纳斯达克 100 全回报指数。1994年前使用指数数据，1994-1999使用 RYOCX，1999年后使用 QQQ。", simSegRange("RYOCX", "1994-03-11", "1999-03-18", 0.0112), simSeg("QQQ", "1999-03-10", 0.0020)),
	"BNDSIM":   simDef("BNDSIM", "美国综合债券 (Total Return)", "Bond", "美国综合债券全回报指数。2007年前使用 VBMFX，2007年后使用 BND。", simSegRange("VBMFX", "1986-12-18", "2007-04-02", 0.0012), simSeg("BND", "2007-04-03", 0.0003)),
	"GLDSIM":   simDef("GLDSIM", "黄金 (Total Return)", "Commodity", "黄金全回报指数。2004年前使用 LBMA 黄金价格，2004年后使用 GLD。", simSeg("GLD", "2004-11-18", 0.0040)),
	"TLTSIM":   simDef("TLTSIM", "长期美国国债 (Total Return)", "Bond", "长期美国国债全回报指数。2002年前使用国债利率推算，2002年后使用 TLT。", simSeg("TLT", "2002-07-22", 0.0015)),
}

func IsSIMTicker(ticker string) bool {
	_, ok := simDefinitions[ticker]
	return ok
}
func GetSIMDefinition(ticker string) *SIMTickerDefinition {
	if def, ok := simDefinitions[ticker]; ok {
		return &def
	}
	return nil
}
func GetAllSIMTickers() []string {
	tickers := make([]string, 0, len(simDefinitions))
	for t := range simDefinitions {
		tickers = append(tickers, t)
	}
	sort.Strings(tickers)
	return tickers
}
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

type segmentData struct {
	seg    *SIMSegment
	prices []dailyPrice
}

func spliceSIMData(ctx context.Context, pool *pgxpool.Pool, def *SIMTickerDefinition, startDate, endDate string) error {
	slog.Info("开始拼接 SIM 数据", "ticker", def.Ticker, "segments", len(def.Segments))
	var segments []segmentData
	for i := range def.Segments {
		seg := &def.Segments[i]
		if seg.EndDate < startDate || seg.StartDate > endDate {
			continue
		}
		actualStart := max(startDate, seg.StartDate)
		actualEnd := min(endDate, seg.EndDate)
		prices, err := fetchSegmentData(ctx, pool, seg, actualStart, actualEnd)
		if err != nil {
			slog.Warn("获取 Segment 数据失败", "ticker", def.Ticker, "source", seg.Source, "error", err)
			continue
		}
		if len(prices) == 0 {
			slog.Warn("Segment 无数据", "ticker", def.Ticker, "source", seg.Source)
			continue
		}
		if seg.ExpenseRatio > 0 {
			prices = applyExpenseRatio(prices, seg.ExpenseRatio)
		}
		segments = append(segments, segmentData{seg: seg, prices: prices})
		slog.Info("Segment 获取完成", "ticker", def.Ticker, "source", seg.Source, "count", len(prices))
	}
	if len(segments) == 0 {
		return fmt.Errorf("所有 Segment 均无数据")
	}
	allPrices := normalizeAndMergeSegments(segments)
	slog.Info("SIM 数据拼接完成", "ticker", def.Ticker, "total_rows", len(allPrices), "segments_used", len(segments))
	return writePricesToDB(ctx, pool, def.Ticker, allPrices)
}
func fetchSegmentData(ctx context.Context, pool *pgxpool.Pool, seg *SIMSegment, startDate, endDate string) ([]dailyPrice, error) {
	switch seg.Type {
	case SegmentYahoo:
		return fetchYahooSegment(seg.Source, startDate, endDate)
	default:
		return nil, fmt.Errorf("不支持的 Segment 类型: %s", seg.Type)
	}
}
func normalizeAndMergeSegments(segments []segmentData) []dailyPrice {
	if len(segments) == 0 {
		return nil
	}
	var result []dailyPrice
	for _, seg := range segments {
		prices := seg.prices
		if len(result) == 0 {
			result = append(result, prices...)
			continue
		}
		if len(prices) > 0 && prices[0].Close > 0 {
			ratio := result[len(result)-1].Close / prices[0].Close
			normalized := make([]dailyPrice, len(prices))
			for j, p := range prices {
				normalized[j] = dailyPrice{
					Date:          p.Date,
					Open:          p.Open * ratio,
					High:          p.High * ratio,
					Low:           p.Low * ratio,
					Close:         p.Close * ratio,
					Volume:        p.Volume,
					AdjustedClose: p.AdjustedClose * ratio,
				}
			}
			prices = normalized
		}
		if len(prices) > 1 {
			result = append(result, prices[1:]...)
		}
	}
	return result
}
func fetchYahooSegment(ticker, startDate, endDate string) ([]dailyPrice, error) {
	providers := reg.ForTicker(ticker)
	if len(providers) == 0 {
		return nil, fmt.Errorf("没有可用的数据源: %s", ticker)
	}
	prices, _, err := provider.FetchWithFallback(providers, ticker, startDate, endDate)
	if err != nil {
		return nil, err
	}
	result := make([]dailyPrice, len(prices))
	for i, p := range prices {
		result[i] = dailyPrice{
			Date:          p.Date,
			Open:          p.Open,
			High:          p.High,
			Low:           p.Low,
			Close:         p.AdjustedClose,
			Volume:        p.Volume,
			AdjustedClose: p.AdjustedClose,
		}
	}
	return result, nil
}
func applyExpenseRatio(prices []dailyPrice, expenseRatio float64) []dailyPrice {
	if len(prices) == 0 {
		return prices
	}
	dailyDrag := expenseRatio / 252.0
	result := make([]dailyPrice, len(prices))
	result[0] = prices[0]
	for i := 1; i < len(prices); i++ {
		prevClose := result[i-1].Close
		if prevClose <= 0 {
			result[i] = prices[i]
			continue
		}
		newClose := prevClose * (prices[i].Close / prevClose) * (1 - dailyDrag)
		ratio := newClose / prices[i].Close
		result[i] = dailyPrice{
			Date:          prices[i].Date,
			Open:          prices[i].Open * ratio,
			High:          prices[i].High * ratio,
			Low:           prices[i].Low * ratio,
			Close:         newClose,
			Volume:        prices[i].Volume,
			AdjustedClose: newClose,
		}
	}
	return result
}
