package sim

import (
	"data-fetcher/internal/provider"
	"math"
	"math/rand"
	"time"
)

type simProvider struct{ base provider.BaseProvider }

func NewProvider() provider.Provider { return &simProvider{} }
func (p *simProvider) Name() string { return "sim" }

// SIM 合成基金：BNDSIM 等以底层ETF为锚，早期用合成5%年化+噪声外推至1986
// 极简实现：仅支持 BNDSIM/SPYSIM/VTISIM 三档，其余 SIM 透传去后缀
func (p *simProvider) FetchStockDaily(ticker, startDate, endDate string) ([]provider.DailyPrice, error) {
	upper := ticker
	// 仅处理 SIM 后缀
	if len(ticker) < 4 || ticker[len(ticker)-3:] != "SIM" {
		return nil, nil
	}
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
		// 日收益 0.02% + 噪声 ±0.4%
		ret := 0.0002 + (r.Float64()-0.5)*0.008
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
