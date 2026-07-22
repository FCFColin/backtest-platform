package main

// Provider 注册表初始化。
// 从 cmd/worker/main.go 抽取（Task 2.7 单一职责拆分）。

import (
	"os"
	"strings"

	"data-fetcher/internal/akshare"
	"data-fetcher/internal/finnhub"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/twelvedata"
	"data-fetcher/internal/yfinance"
)

// reg 是全局 provider 注册表，由 init() 初始化。
var reg *provider.Registry

func init() {
	prio := os.Getenv("DATA_PROVIDER_PRIORITY")
	var priorities []string
	if prio != "" {
		priorities = strings.Split(prio, ",")
	} else {
		priorities = []string{"yfinance", "finnhub", "twelvedata", "akshare"}
	}
	reg = provider.NewRegistry(priorities)
	for _, p := range []provider.Provider{
		yfinance.NewProvider(),
		finnhub.NewProvider(),
		twelvedata.NewProvider(),
		akshare.NewProvider(),
	} {
		if p != nil {
			reg.Register(p)
		}
	}
}
