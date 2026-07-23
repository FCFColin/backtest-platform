package main

// SIM 数据拼接引擎。
// 负责获取多个 Segment 的数据并拼接成完整的 total return 序列。

import (
	"context"
	"fmt"
	"log/slog"
	"math"
	"sort"

	"data-fetcher/internal/provider"

	"github.com/jackc/pgx/v5/pgxpool"
)

// segmentData 保存单个 Segment 的数据
type segmentData struct {
	seg    *SIMSegment
	prices []dailyPrice
}

// spliceSIMData 拼接 SIM Ticker 的多个数据段。
// 按时间顺序获取每个 Segment 的数据，应用费用比率调整，然后合并。
// 在 Segment 切换点进行价格归一化，确保连续性。
func spliceSIMData(ctx context.Context, pool *pgxpool.Pool, def *SIMTickerDefinition, startDate, endDate string) error {
	slog.Info("开始拼接 SIM 数据", "ticker", def.Ticker, "segments", len(def.Segments))

	// 收集所有 Segment 的数据（带日期范围）
	var segments []segmentData

	for i := range def.Segments {
		seg := &def.Segments[i]

		// 跳过与请求日期范围不重叠的 Segment
		if seg.EndDate < startDate || seg.StartDate > endDate {
			continue
		}

		// 计算实际请求的日期范围（取交集）
		actualStart := startDate
		if seg.StartDate > startDate {
			actualStart = seg.StartDate
		}
		actualEnd := endDate
		if seg.EndDate < endDate {
			actualEnd = seg.EndDate
		}

		prices, err := fetchSegmentData(ctx, pool, seg, actualStart, actualEnd)
		if err != nil {
			slog.Warn("获取 Segment 数据失败", "ticker", def.Ticker, "source", seg.Source, "error", err)
			continue
		}

		if len(prices) == 0 {
			slog.Warn("Segment 无数据", "ticker", def.Ticker, "source", seg.Source)
			continue
		}

		// 应用费用比率调整
		if seg.ExpenseRatio > 0 {
			prices = applyExpenseRatio(prices, seg.ExpenseRatio)
		}

		segments = append(segments, segmentData{seg: seg, prices: prices})
		slog.Info("Segment 获取完成", "ticker", def.Ticker, "source", seg.Source, "count", len(prices))
	}

	if len(segments) == 0 {
		return fmt.Errorf("所有 Segment 均无数据")
	}

	// 归一化并合并 Segment
	allPrices := normalizeAndMergeSegments(segments)

	slog.Info("SIM 数据拼接完成", "ticker", def.Ticker, "total_rows", len(allPrices), "segments_used", len(segments))

	// 写入数据库
	return writePricesToDB(ctx, pool, def.Ticker, allPrices)
}

// fetchSegmentData 获取单个 Segment 的数据。
func fetchSegmentData(ctx context.Context, pool *pgxpool.Pool, seg *SIMSegment, startDate, endDate string) ([]dailyPrice, error) {
	switch seg.Type {
	case SegmentYahoo:
		return fetchYahooSegment(seg.Source, startDate, endDate)
	case SegmentFRED:
		return fetchFREDSegment(seg.Source, startDate, endDate, seg.Transform)
	default:
		return nil, fmt.Errorf("不支持的 Segment 类型: %s", seg.Type)
	}
}

// normalizeAndMergeSegments 归一化并合并多个 Segment。
// 在 Segment 切换点调整价格，确保连续性。
func normalizeAndMergeSegments(segments []segmentData) []dailyPrice {
	if len(segments) == 0 {
		return nil
	}

	var result []dailyPrice

	for i, seg := range segments {
		prices := seg.prices

		if i == 0 {
			// 第一个 Segment 直接使用
			result = append(result, prices...)
			continue
		}

		// 找到前一个 Segment 的最后一个日期和价格
		if len(result) == 0 {
			result = append(result, prices...)
			continue
		}

		lastPrice := result[len(result)-1]
		firstPrice := prices[0]

		// 计算归一化比率：前一段最后一日价格 / 当前段第一日价格
		if firstPrice.Close > 0 {
			normalizationRatio := lastPrice.Close / firstPrice.Close

			// 归一化当前段的所有价格
			normalized := make([]dailyPrice, len(prices))
			for j, p := range prices {
				normalized[j] = dailyPrice{
					Date:          p.Date,
					Open:          p.Open * normalizationRatio,
					High:          p.High * normalizationRatio,
					Low:           p.Low * normalizationRatio,
					Close:         p.Close * normalizationRatio,
					Volume:        p.Volume,
					AdjustedClose: p.AdjustedClose * normalizationRatio,
				}
			}
			prices = normalized
		}

		// 去掉当前段的第一个点（避免重复）
		if len(prices) > 1 {
			result = append(result, prices[1:]...)
		}
	}

	return result
}

// fetchYahooSegment 通过 Yahoo Finance 获取数据。
func fetchYahooSegment(ticker, startDate, endDate string) ([]dailyPrice, error) {
	providers := reg.ForTicker(ticker)
	if len(providers) == 0 {
		return nil, fmt.Errorf("没有可用的数据源: %s", ticker)
	}

	prices, _, err := provider.FetchWithFallback(providers, ticker, startDate, endDate)
	if err != nil {
		return nil, err
	}

	// 将 adjusted_close 作为 close 价格（total return 近似）
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

// fetchFREDSegment 从 FRED API 获取数据。
// 目前返回错误，待实现 FRED provider。
func fetchFREDSegment(seriesID, startDate, endDate, transform string) ([]dailyPrice, error) {
	return nil, fmt.Errorf("FRED 数据源暂未实现: %s", seriesID)
}

// applyExpenseRatio 按年化费用比率调整价格序列。
// 将每日收益率扣除 expenseRatio/252。
func applyExpenseRatio(prices []dailyPrice, expenseRatio float64) []dailyPrice {
	if len(prices) == 0 {
		return prices
	}

	dailyDrag := expenseRatio / 252.0
	result := make([]dailyPrice, len(prices))

	// 第一个价格不变
	result[0] = prices[0]

	// 从第二个价格开始，按日扣除费用
	for i := 1; i < len(prices); i++ {
		prevClose := result[i-1].Close
		if prevClose <= 0 {
			result[i] = prices[i]
			continue
		}

		// 计算原始日收益率
		rawReturn := prices[i].Close / prevClose

		// 扣除每日费用
		adjustedReturn := rawReturn * (1 - dailyDrag)

		// 计算新的收盘价
		newClose := prevClose * adjustedReturn

		// 按比例调整 OHLC
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

// deduplicateByDate 按日期去重，保留最后出现的记录（用于处理重叠期）。
func deduplicateByDate(prices []dailyPrice) []dailyPrice {
	if len(prices) == 0 {
		return prices
	}

	// 按日期排序
	sort.Slice(prices, func(i, j int) bool {
		return prices[i].Date < prices[j].Date
	})

	// 去重（保留最后一个）
	result := make([]dailyPrice, 0, len(prices))
	seen := make(map[string]int)
	for _, p := range prices {
		if idx, exists := seen[p.Date]; exists {
			// 更新已有记录
			result[idx] = p
		} else {
			seen[p.Date] = len(result)
			result = append(result, p)
		}
	}

	return result
}

// normalizeToTotalReturn 将价格序列转换为 total return 序列。
// 通过累积日收益率计算，确保起始价格为1。
func normalizeToTotalReturn(prices []dailyPrice) []dailyPrice {
	if len(prices) == 0 {
		return prices
	}

	result := make([]dailyPrice, len(prices))
	result[0] = prices[0]
	result[0].Close = 1.0
	result[0].AdjustedClose = 1.0

	for i := 1; i < len(prices); i++ {
		prevClose := result[i-1].Close
		if prevClose <= 0 || prices[i-1].Close <= 0 {
			result[i] = prices[i]
			result[i].Close = result[i-1].Close
			continue
		}

		// 计算日收益率
		dailyReturn := prices[i].Close / prices[i-1].Close

		// 累积到 normalized 价格
		newClose := prevClose * dailyReturn

		result[i] = dailyPrice{
			Date:          prices[i].Date,
			Open:          newClose, // 简化：使用 close 作为 OHLC
			High:          newClose,
			Low:           newClose,
			Close:         newClose,
			Volume:        prices[i].Volume,
			AdjustedClose: newClose,
		}
	}

	return result
}

// adjustForSplit 处理拆股调整。
// 如果某日发生拆股，按比例调整之前的所有价格。
func adjustForSplit(prices []dailyPrice, splitDate string, splitRatio float64) []dailyPrice {
	result := make([]dailyPrice, len(prices))
	copy(result, prices)

	splitIdx := -1
	for i, p := range prices {
		if p.Date >= splitDate {
			splitIdx = i
			break
		}
	}

	// 调整拆股日之前的所有价格
	if splitIdx > 0 {
		for i := 0; i < splitIdx; i++ {
			result[i].Open /= splitRatio
			result[i].High /= splitRatio
			result[i].Low /= splitRatio
			result[i].Close /= splitRatio
			result[i].AdjustedClose /= splitRatio
		}
	}

	return result
}

// calculateCumulativeReturn 计算累积收益率序列。
func calculateCumulativeReturn(prices []dailyPrice) []dailyPrice {
	if len(prices) == 0 {
		return prices
	}

	result := make([]dailyPrice, len(prices))
	result[0] = prices[0]
	result[0].Close = 0.0
	result[0].AdjustedClose = 0.0

	for i := 1; i < len(prices); i++ {
		if prices[i-1].Close <= 0 {
			result[i] = prices[i]
			result[i].Close = result[i-1].Close
			continue
		}

		cumReturn := (prices[i].Close / prices[i-1].Close) - 1.0

		result[i] = dailyPrice{
			Date:          prices[i].Date,
			Open:          cumReturn,
			High:          cumReturn,
			Low:           cumReturn,
			Close:         cumReturn,
			Volume:        prices[i].Volume,
			AdjustedClose: cumReturn,
		}
	}

	return result
}

// clampValue 将值限制在指定范围内。
func clampValue(value, min, max float64) float64 {
	return math.Max(min, math.Min(max, value))
}
