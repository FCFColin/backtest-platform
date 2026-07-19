package signal

import (
	"math"

	"engine-go/internal/engine"
	"engine-go/internal/engineutil"
)

// ===== 常量 =====

const (
	initialCapital     = 10000.0
	tradingDaysPerYear = engineutil.TradingDaysPerYear
)

// ===== 统计与权益曲线 =====

// calcStatistics 计算信号统计（胜率、平均收益）。
func calcStatistics(signals []SignalPoint) SignalStats {
	totalSignals := len(signals)
	wins := 0
	completedTrades := 0
	returnSum := 0.0

	var pendingBuy *float64
	for _, s := range signals {
		if s.Type == SignalBuy {
			p := s.Price
			pendingBuy = &p
		} else if s.Type == SignalSell && pendingBuy != nil {
			ret := (s.Price - *pendingBuy) / *pendingBuy
			returnSum += ret
			completedTrades++
			if ret > 0 {
				wins++
			}
			pendingBuy = nil
		}
	}

	winRate := 0.0
	avgReturn := 0.0
	if completedTrades > 0 {
		winRate = float64(wins) / float64(completedTrades)
		avgReturn = returnSum / float64(completedTrades)
	}

	return SignalStats{
		TotalSignals: totalSignals,
		WinRate:      winRate,
		AvgReturn:    avgReturn,
		MaxDrawdown:  0,
		Sharpe:       0,
	}
}

// calcEquityCurve 模拟仅做多权益曲线。
//
// 最大回撤与夏普比率统一调用 engine 包实现，确保统计口径与回测引擎一致
// （spec Wave 1 Task 1.2：消除 signal 与 engine 间的口径分裂）。
// 夏普口径：engine.CalcSharpe(cagr, annualizedStdev) = (cagr - riskFreeRate) / stdev，
// 其中 riskFreeRate = 0.02、cagr 由权益曲线首末值与年数推导、stdev 由日收益年化。
func calcEquityCurve(signals []SignalPoint, data []PricePoint) (equityCurve []EquityPoint, maxDrawdown, sharpe float64) {
	signalMap := make(map[string]SignalDir)
	for _, s := range signals {
		signalMap[s.Date] = s.Type
	}

	capital := initialCapital
	shares := 0.0
	inPosition := false
	var dailyReturns []float64
	prevEquity := initialCapital

	for _, point := range data {
		sig, ok := signalMap[point.Date]
		if ok {
			if sig == SignalBuy && !inPosition {
				shares = capital / point.Price
				inPosition = true
			} else if sig == SignalSell && inPosition {
				capital = shares * point.Price
				shares = 0
				inPosition = false
			}
		}
		equity := capital
		if inPosition {
			equity = shares * point.Price
		}
		equityCurve = append(equityCurve, EquityPoint{
			Date:  point.Date,
			Value: math.Round(equity*100) / 100,
		})
		if prevEquity > 0 {
			dailyReturns = append(dailyReturns, (equity-prevEquity)/prevEquity)
		}
		prevEquity = equity
	}

	values := make([]float64, len(equityCurve))
	for i, p := range equityCurve {
		values[i] = p.Value
	}
	maxDrawdown = engine.CalcMaxDrawdown(values).MaxDrawdown

	stdev := engine.CalcAnnualizedStdev(dailyReturns)
	if len(equityCurve) >= 2 {
		years := float64(len(equityCurve)-1) / tradingDaysPerYear
		cagr := engine.CalcCAGR(equityCurve[0].Value, equityCurve[len(equityCurve)-1].Value, years)
		sharpe = engine.CalcSharpe(cagr, stdev)
	}
	return
}
