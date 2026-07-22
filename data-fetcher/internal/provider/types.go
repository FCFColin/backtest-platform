package provider

// DailyPrice 日线行情数据（所有数据源共用）
type DailyPrice struct {
	Date          string
	Open          float64
	High          float64
	Low           float64
	Close         float64
	Volume        int64
	AdjustedClose float64
}

// TickerInfo 标的搜索结果（所有数据源共用）
type TickerInfo struct {
	Ticker   string
	Name     string
	Market   string
	Exchange string
}

// Provider 数据源接口
type Provider interface {
	Name() string
	FetchStockDaily(ticker, startDate, endDate string) ([]DailyPrice, error)
	SearchTicker(query string) ([]TickerInfo, error)
}
