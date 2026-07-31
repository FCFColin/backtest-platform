// Package registry 提供默认数据源注册表构造（含优先级环境变量解析）。
package registry

import (
	"data-fetcher/internal/akshare"
	"data-fetcher/internal/finnhub"
	"data-fetcher/internal/provider"
	"data-fetcher/internal/twelvedata"
	"data-fetcher/internal/yfinance"
	"os"
	"strings"
)

// New 按 DATA_PROVIDER_PRIORITY 环境变量（逗号分隔，缺省 yfinance,finnhub,twelvedata,akshare）
// 构建并注册所有数据源 provider。
func New() *provider.Registry {
	prio := os.Getenv("DATA_PROVIDER_PRIORITY")
	var priorities []string
	if prio != "" {
		priorities = strings.Split(prio, ",")
	} else {
		priorities = []string{"yfinance", "finnhub", "twelvedata", "akshare"}
	}
	reg := provider.NewRegistry(priorities)
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
	return reg
}
