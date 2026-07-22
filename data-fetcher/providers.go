package main

import (
	"os"
	"strings"

	"data-fetcher/internal/akshare"
	"data-fetcher/internal/finnhub"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/twelvedata"
	"data-fetcher/internal/yfinance"
)

var dataReg *provider.Registry

func init() {
	prio := os.Getenv("DATA_PROVIDER_PRIORITY")
	var priorities []string
	if prio != "" {
		priorities = strings.Split(prio, ",")
	} else {
		priorities = []string{"yfinance", "finnhub", "twelvedata", "akshare"}
	}
	dataReg = provider.NewRegistry(priorities)
	for _, p := range []provider.Provider{
		yfinance.NewProvider(),
		finnhub.NewProvider(),
		twelvedata.NewProvider(),
		akshare.NewProvider(),
	} {
		if p != nil {
			dataReg.Register(p)
		}
	}
}
