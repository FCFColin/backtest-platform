package registry

import (
	"data-fetcher/internal/akshare"
	"data-fetcher/internal/finnhub"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/sim"
	"data-fetcher/internal/twelvedata"
	"data-fetcher/internal/yfinance"
	"os"
	"strings"
)

func New() *provider.Registry {
	prio := os.Getenv("DATA_PROVIDER_PRIORITY")
	if prio == "" {
		prio = "sim,yfinance,finnhub,twelvedata,akshare"
	}
	reg := provider.NewRegistry(strings.Split(prio, ","))
	for _, p := range []provider.Provider{
		sim.NewProvider(),
		yfinance.NewProvider(),
		finnhub.NewProvider(),
		twelvedata.NewProvider(),
		akshare.NewProvider(),
	} {
		if p != nil {
			reg.Register(p)
		}
	}
	return reg
}
