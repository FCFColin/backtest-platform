package engine

import (
	"math"
	"time"
)

// 企业理由：回撤事件检测是风险分析的核心功能。投资者需要了解历史回撤的
// 深度、持续时间和恢复速度，以评估策略的风险承受能力。
// 5% 阈值过滤噪音，只关注有意义的回撤事件。

const drawdownThreshold = 0.05 // 5% 回撤阈值

// detectDrawdownEpisodes 检测所有超过阈值的回撤事件
//
// 算法：单遍扫描增长曲线，跟踪峰值和谷值。当回撤超过阈值时
// 记录为一个事件，当价值恢复到峰值时标记恢复日期。
// 每个事件包含：depth（回撤深度）、timeToTrough（跌至谷底天数）、
// recoveryTime（恢复天数）、totalTimeDurationDays（总持续天数）、
// recoveryFactor（恢复因子）、cagrDuring（期间CAGR）、ulcerDuring（期间Ulcer指数）。
func detectDrawdownEpisodes(curve []DataPoint) []DrawdownEpisode {
	if len(curve) < 2 {
		return nil
	}

	var episodes []DrawdownEpisode
	peakValue := curve[0].Value
	peakDate := curve[0].Date
	peakIdx := 0
	troughValue := curve[0].Value
	troughDate := curve[0].Date
	troughIdx := 0
	inDrawdown := false

	for i := 1; i < len(curve); i++ {
		currentValue := curve[i].Value
		currentDate := curve[i].Date

		if currentValue >= peakValue {
			// 新高点
			if inDrawdown {
				// 企业理由：恢复到前高，结束当前回撤事件
				drawdown := (peakValue - troughValue) / peakValue
				if drawdown >= drawdownThreshold {
					ep := buildDrawdownEpisode(
						curve, peakIdx, troughIdx, i,
						peakDate, troughDate, currentDate,
						peakValue, troughValue, currentValue,
					)
					episodes = append(episodes, ep)
				}
				inDrawdown = false
			}
			peakValue = currentValue
			peakDate = currentDate
			peakIdx = i
			troughValue = currentValue
			troughDate = currentDate
			troughIdx = i
		} else {
			// 低于峰值
			if currentValue < troughValue {
				troughValue = currentValue
				troughDate = currentDate
				troughIdx = i
			}
			drawdown := (peakValue - currentValue) / peakValue
			if drawdown >= drawdownThreshold {
				inDrawdown = true
			}
		}
	}

	// 企业理由：如果回测结束时仍在回撤中，也记录该事件（recoveryDate 为空）
	if inDrawdown {
		drawdown := (peakValue - troughValue) / peakValue
		if drawdown >= drawdownThreshold {
			lastIdx := len(curve) - 1
			ep := buildDrawdownEpisode(
				curve, peakIdx, troughIdx, lastIdx,
				peakDate, troughDate, "",
				peakValue, troughValue, curve[lastIdx].Value,
			)
			episodes = append(episodes, ep)
		}
	}

	return episodes
}

// buildDrawdownEpisode 构建一个完整的 DrawdownEpisode，包含所有衍生字段。
//
// 参数：
//   - curve: 完整增长曲线
//   - peakIdx, troughIdx, recoveryIdx: 峰值、谷值、恢复点在曲线中的索引
//   - peakDate, troughDate, recoveryDate: 对应日期字符串
//   - peakValue, troughValue, recoveryValue: 对应数值
//
// 计算字段：
//   - timeToTrough: 峰值到谷值的天数
//   - recoveryTime: 谷值到恢复的天数（未恢复时为 0）
//   - totalTimeDurationDays: 峰值到恢复（或结束）的总天数
//   - recoveryFactor: 恢复时间 / 跌至谷底时间（比率）
//   - cagrDuring: 从峰值到恢复的年化收益率（未恢复时为峰值到结束）
//   - ulcerDuring: 该回撤片段内的 Ulcer Index = sqrt(mean(drawdown^2))
//   - returnFromPeakToTrough: (troughValue - peakValue) / peakValue
//   - returnFromTroughToRecovery: (recoveryValue - troughValue) / troughValue
func buildDrawdownEpisode(
	curve []DataPoint,
	peakIdx, troughIdx, recoveryIdx int,
	peakDate, troughDate, recoveryDate string,
	peakValue, troughValue, recoveryValue float64,
) DrawdownEpisode {
	timeToTrough := daysBetween(peakDate, troughDate)
	totalDays := daysBetween(peakDate, recoveryDate)
	if recoveryDate == "" {
		totalDays = daysBetween(peakDate, curve[recoveryIdx].Date)
	}

	var recoveryTime int
	var recoveryFactor float64
	if recoveryDate != "" && timeToTrough > 0 {
		recoveryTime = daysBetween(troughDate, recoveryDate)
		recoveryFactor = float64(recoveryTime) / float64(timeToTrough)
	}

	// 期间 CAGR：从峰值到恢复（或结束）的年化收益率
	cagrDuring := calcCagrBetween(peakValue, recoveryValue, totalDays)

	// 期间 Ulcer Index：遍历峰值到恢复（或结束）的每个点，计算 drawdown 序列
	ulcerDuring := calcUlcerDuring(curve, peakIdx, recoveryIdx, peakValue)

	// 峰值到谷值的收益率
	returnFromPeakToTrough := 0.0
	if peakValue > 0 {
		returnFromPeakToTrough = (troughValue - peakValue) / peakValue
	}

	ep := DrawdownEpisode{
		PeakDate:               peakDate,
		TroughDate:             troughDate,
		RecoveryDate:           recoveryDate,
		Depth:                  (peakValue - troughValue) / peakValue,
		TimeToTrough:           timeToTrough,
		RecoveryTime:           recoveryTime,
		TotalTimeDurationDays:  totalDays,
		RecoveryFactor:         recoveryFactor,
		CagrDuring:             cagrDuring,
		UlcerDuring:            ulcerDuring,
		ReturnFromPeakToTrough: returnFromPeakToTrough,
	}

	// 恢复收益率仅在已恢复时计算
	if recoveryDate != "" && troughValue > 0 {
		retFromTrough := (recoveryValue - troughValue) / troughValue
		ep.ReturnFromTroughToRecovery = &retFromTrough
	}

	return ep
}

// calcCagrBetween 计算两个值之间的年化收益率。
// days 为两期间的天数。使用 CAGR = (end/start)^(365/days) - 1 公式。
func calcCagrBetween(startValue, endValue float64, days int) float64 {
	if days <= 0 || startValue <= 0 {
		return 0
	}
	years := float64(days) / 365.0
	if endValue <= 0 {
		return -1
	}
	return math.Pow(endValue/startValue, 1.0/years) - 1
}

// calcUlcerDuring 计算回撤片段内的 Ulcer Index。
// Ulcer Index = sqrt( sum(drawdown_i^2) / n )
// 其中 drawdown_i = (peak - value_i) / peak，遍历峰值到恢复（或结束）的所有点。
func calcUlcerDuring(curve []DataPoint, peakIdx, endIdx int, peakValue float64) float64 {
	if peakValue <= 0 || endIdx <= peakIdx {
		return 0
	}
	var sumSquaredDD float64
	count := 0
	for i := peakIdx; i <= endIdx && i < len(curve); i++ {
		v := curve[i].Value
		dd := (peakValue - v) / peakValue
		if dd < 0 {
			dd = 0
		}
		sumSquaredDD += dd * dd
		count++
	}
	if count == 0 {
		return 0
	}
	return math.Sqrt(sumSquaredDD / float64(count))
}

// daysBetween 计算两个日期字符串之间的天数
func daysBetween(dateStr1, dateStr2 string) int {
	t1, err1 := time.Parse("2006-01-02", dateStr1)
	t2, err2 := time.Parse("2006-01-02", dateStr2)
	if err1 != nil || err2 != nil {
		return 0
	}
	days := int(t2.Sub(t1).Hours() / 24)
	if days < 0 {
		return -days
	}
	return days
}
