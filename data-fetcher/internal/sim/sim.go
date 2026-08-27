package sim

import (
	"data-fetcher/internal/provider"
	"math"
	"math/rand"
	"time"
)

type simProvider struct{ base provider.BaseProvider }

func NewProvider() provider.Provider { return &simProvider{} }
func (p *simProvider) Name() string  { return "sim" }

// SIM 合成基金框架（M-2）：BNDSIM 等以底层ETF为锚，早期用合成年化+噪声外推至1986
// 支持任意 XXXSIM  ticker，按前缀映射年化/波动：BND 3%/3% SPY/VTI 10%/15% QQQ 12%/20% GLD 4%/18% 默认 5%/10%
func simParams(ticker string) (annualReturn, dailyVol float64) {
	switch {
	case len(ticker) >= 6 && ticker[:3] == "BND":
		return 0.03, 0.03
	case ticker == "SPYSIM" || ticker == "VTISIM":
		return 0.10, 0.15
	case ticker == "QQQSIM":
		return 0.12, 0.20
	case ticker == "GLDSIM":
		return 0.04, 0.18
	default:
		return 0.05, 0.10
	}
}
func (p *simProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	if len(ticker) < 4 || ticker[len(ticker)-3:] != "SIM" {
		return nil, nil
	}
	annualReturn, annualVol := simParams(ticker)
	// 合成历史起点固定 1986-01-02
	simStart := "1986-01-02"
	if startDate > simStart {
		simStart = startDate
	}
	if simStart > endDate {
		return nil, nil
	}
	// 生成合成日线：起点价 10，年化 5% 日化 ~0.0197%
	start, _ := time.Parse("2006-01-02", simStart)
	end, _ := time.Parse("2006-01-02", endDate)
	if end.Before(start) {
		return nil, nil
	}
	days := int(end.Sub(start).Hours() / 24)
	if days <= 0 {
		return nil, nil
	}
	r := rand.New(rand.NewSource(int64(len(ticker)) * 7919))
	price := 10.0
	var out []provider.DailyPrice
	for i := 0; i <= days; i++ {
		d := start.AddDate(0, 0, i)
		// 跳过周末
		if d.Weekday() == time.Saturday || d.Weekday() == time.Sunday {
			continue
		}
		ret := annualReturn/252 + (r.Float64()-0.5)*annualVol/16
		price = price * (1 + ret)
		price = math.Round(price*100) / 100
		if price < 1 {
			price = 1
		}
		p := provider.DailyPrice{
			Date:   d.Format("2006-01-02"),
			Open:   price,
			High:   price * 1.005,
			Low:    price * 0.995,
			Close:  price,
			Volume: 1_000_000,
		}
		adj := price
		p.AdjustedClose = &adj
		out = append(out, p)
	}
	return out, nil
}
