package engine

import "time"

// 企业理由：回撤事件检测是风险分析的核心功能。投资者需要了解历史回撤的
// 深度、持续时间和恢复速度，以评估策略的风险承受能力。
// 5% 阈值过滤噪音，只关注有意义的回撤事件。

const drawdownThreshold = 0.05 // 5% 回撤阈值

// detectDrawdownEpisodes 检测所有超过阈值的回撤事件
//
// 算法：单遍扫描增长曲线，跟踪峰值和谷值。当回撤超过阈值时
// 记录为一个事件，当价值恢复到峰值时标记恢复日期。
func detectDrawdownEpisodes(curve []DataPoint) []DrawdownEpisode {
	if len(curve) < 2 {
		return nil
	}

	var episodes []DrawdownEpisode
	peakValue := curve[0].Value
	peakDate := curve[0].Date
	troughValue := curve[0].Value
	troughDate := curve[0].Date
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
					episodes = append(episodes, DrawdownEpisode{
						PeakDate:     peakDate,
						TroughDate:   troughDate,
						RecoveryDate: currentDate,
						Drawdown:     drawdown,
						Duration:     daysBetween(peakDate, currentDate),
					})
				}
				inDrawdown = false
			}
			peakValue = currentValue
			peakDate = currentDate
			troughValue = currentValue
			troughDate = currentDate
		} else {
			// 低于峰值
			if currentValue < troughValue {
				troughValue = currentValue
				troughDate = currentDate
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
			episodes = append(episodes, DrawdownEpisode{
				PeakDate:     peakDate,
				TroughDate:   troughDate,
				RecoveryDate: "",
				Drawdown:     drawdown,
				Duration:     daysBetween(peakDate, curve[len(curve)-1].Date),
			})
		}
	}

	return episodes
}

// computeDrawdownCurve 计算每日回撤曲线
//
// 企业理由：回撤曲线可视化展示组合从峰值的回撤程度，
// 是投资者理解策略风险的关键图表。
func computeDrawdownCurve(curve []DataPoint) []DrawdownPoint {
	if len(curve) == 0 {
		return nil
	}
	result := make([]DrawdownPoint, len(curve))
	peak := curve[0].Value
	for i, dp := range curve {
		if dp.Value > peak {
			peak = dp.Value
		}
		dd := 0.0
		if peak > 0 {
			dd = (peak - dp.Value) / peak
		}
		result[i] = DrawdownPoint{Date: dp.Date, Drawdown: dd}
	}
	return result
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
