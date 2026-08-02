package engine

import "fmt"

var cashflowFreqDays = map[string]int{"weekly": 5, "monthly": 21, "quarterly": 63, "yearly": 252}

func buildPeriodicCashflowMap(legs []CashflowLeg, dates []string) (map[string]float64, error) {
	m := make(map[string]float64)
	for _, leg := range legs {
		if leg.Amount == 0 {
			continue
		}
		amt := leg.Amount
		if leg.Type == "withdrawal" {
			amt = -amt
		}
		freqDays, ok := cashflowFreqDays[leg.Frequency]
		if !ok {
			return nil, fmt.Errorf("不支持的现金流频率 %q（支持：weekly/monthly/quarterly/yearly）", leg.Frequency)
		}
		until := leg.Until
		if until == "" {
			until = "9999-99-99"
		}
		nextIdx := 0
		for nextIdx < len(dates) {
			idx := nextIdx
			if idx+freqDays < len(dates) {
				nextIdx = idx + freqDays
			} else {
				break
			}
			if dates[nextIdx] > until {
				break
			}
			m[dates[nextIdx]] += amt
		}
	}
	return m, nil
}
