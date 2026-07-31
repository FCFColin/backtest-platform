package engine

import (
	"math"
	"time"
)

const drawdownThreshold = 0.05 // 5% 回撤阈值

func detectDrawdownEpisodes(curve []DataPoint) []DrawdownEpisode {
	if len(curve) < 2 {
		return nil
	}
	var episodes []DrawdownEpisode
	peakValue, troughValue := curve[0].Value, curve[0].Value
	peakDate, troughDate := curve[0].Date, curve[0].Date
	peakIdx, troughIdx := 0, 0
	inDrawdown := false
	for i := 1; i < len(curve); i++ {
		currentValue, currentDate := curve[i].Value, curve[i].Date
		if currentValue >= peakValue {
			if inDrawdown {
				episodes = appendEpisode(episodes, curve, peakIdx, troughIdx, i, peakDate, troughDate, currentDate, peakValue, troughValue, currentValue)
				inDrawdown = false
			}
			peakValue = currentValue
			peakDate = currentDate
			peakIdx = i
			troughValue = currentValue
			troughDate = currentDate
			troughIdx = i
		} else {
			if currentValue < troughValue {
				troughValue = currentValue
				troughDate = currentDate
				troughIdx = i
			}
			if (peakValue-currentValue)/peakValue >= drawdownThreshold {
				inDrawdown = true
			}
		}
	}
	if inDrawdown {
		lastIdx := len(curve) - 1
		episodes = appendEpisode(episodes, curve, peakIdx, troughIdx, lastIdx, peakDate, troughDate, "", peakValue, troughValue, curve[lastIdx].Value)
	}
	return episodes
}
func appendEpisode(episodes []DrawdownEpisode, curve []DataPoint, peakIdx, troughIdx, recoveryIdx int, peakDate, troughDate, recoveryDate string, peakValue, troughValue, recoveryValue float64) []DrawdownEpisode {
	if (peakValue-troughValue)/peakValue < drawdownThreshold {
		return episodes
	}
	return append(episodes, buildDrawdownEpisode(curve, peakIdx, troughIdx, recoveryIdx, peakDate, troughDate, recoveryDate, peakValue, troughValue, recoveryValue))
}
func buildDrawdownEpisode(curve []DataPoint, peakIdx, troughIdx, recoveryIdx int, peakDate, troughDate, recoveryDate string, peakValue, troughValue, recoveryValue float64) DrawdownEpisode {
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
	cagrDuring := calcCagrBetween(peakValue, recoveryValue, totalDays)
	ulcerDuring := calcUlcerDuring(curve, peakIdx, recoveryIdx, peakValue)
	returnFromPeakToTrough := 0.0
	if peakValue > 0 {
		returnFromPeakToTrough = (troughValue - peakValue) / peakValue
	}
	ep := DrawdownEpisode{PeakDate: peakDate, TroughDate: troughDate, RecoveryDate: recoveryDate, Depth: (peakValue - troughValue) / peakValue, TimeToTrough: timeToTrough, RecoveryTime: recoveryTime, TotalTimeDurationDays: totalDays, RecoveryFactor: recoveryFactor, CagrDuring: cagrDuring, UlcerDuring: ulcerDuring, ReturnFromPeakToTrough: returnFromPeakToTrough}
	if recoveryDate != "" && troughValue > 0 {
		retFromTrough := (recoveryValue - troughValue) / troughValue
		ep.ReturnFromTroughToRecovery = &retFromTrough
	}
	return ep
}
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
func calcUlcerDuring(curve []DataPoint, peakIdx, endIdx int, peakValue float64) float64 {
	if peakValue <= 0 || endIdx <= peakIdx {
		return 0
	}
	var sumSquaredDD float64
	count := 0
	for i := peakIdx; i <= endIdx && i < len(curve); i++ {
		dd := (peakValue - curve[i].Value) / peakValue
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
