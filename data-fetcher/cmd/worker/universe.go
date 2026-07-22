package main

type TickerMeta struct {
	Ticker   string
	Name     string
	Market   string
	Category string
}

var DefaultETFUniverse = []TickerMeta{
	{Ticker: "SHY", Name: "1-3 Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "IEI", Name: "3-7 Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "IEF", Name: "7-10 Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "TLT", Name: "20+ Year Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "TIP", Name: "TIPS Bond", Market: "US", Category: "Bond"},
	{Ticker: "GOVT", Name: "US Treasury Bond", Market: "US", Category: "Bond"},
	{Ticker: "MBB", Name: "MBS Bond", Market: "US", Category: "Bond"},
	{Ticker: "LQD", Name: "Investment Grade Corporate Bond", Market: "US", Category: "Bond"},
	{Ticker: "HYG", Name: "High Yield Corporate Bond", Market: "US", Category: "Bond"},
	{Ticker: "BND", Name: "Total Bond Market", Market: "US", Category: "Bond"},
	{Ticker: "AGG", Name: "US Aggregate Bond", Market: "US", Category: "Bond"},

	{Ticker: "SPY", Name: "S&P 500", Market: "US", Category: "US Equity"},
	{Ticker: "VOO", Name: "Vanguard S&P 500", Market: "US", Category: "US Equity"},
	{Ticker: "IVV", Name: "iShares Core S&P 500", Market: "US", Category: "US Equity"},
	{Ticker: "VTI", Name: "Total Stock Market", Market: "US", Category: "US Equity"},
	{Ticker: "VTV", Name: "Value", Market: "US", Category: "US Equity"},
	{Ticker: "VUG", Name: "Growth", Market: "US", Category: "US Equity"},
	{Ticker: "VO", Name: "Mid-Cap", Market: "US", Category: "US Equity"},
	{Ticker: "VV", Name: "Large-Cap", Market: "US", Category: "US Equity"},
	{Ticker: "QQQ", Name: "Nasdaq 100", Market: "US", Category: "US Equity"},
	{Ticker: "DIA", Name: "Dow Jones", Market: "US", Category: "US Equity"},
	{Ticker: "IWM", Name: "Russell 2000", Market: "US", Category: "US Equity"},
	{Ticker: "IJR", Name: "S&P Small-Cap 600", Market: "US", Category: "US Equity"},
	{Ticker: "SCHD", Name: "US Dividend Equity", Market: "US", Category: "US Equity"},

	{Ticker: "VEA", Name: "Developed Markets", Market: "US", Category: "International"},
	{Ticker: "VWO", Name: "Emerging Markets", Market: "US", Category: "International"},
	{Ticker: "VXUS", Name: "Total International", Market: "US", Category: "International"},
	{Ticker: "EEM", Name: "Emerging Markets", Market: "US", Category: "International"},
	{Ticker: "VT", Name: "Total World", Market: "US", Category: "International"},
	{Ticker: "IEMB", Name: "Emerging Markets Bond", Market: "US", Category: "Bond"},

	{Ticker: "GLD", Name: "Gold", Market: "US", Category: "Commodity"},
	{Ticker: "SLV", Name: "Silver", Market: "US", Category: "Commodity"},
	{Ticker: "DBC", Name: "Commodity Index", Market: "US", Category: "Commodity"},
	{Ticker: "USO", Name: "Crude Oil", Market: "US", Category: "Commodity"},
	{Ticker: "DGL", Name: "Gold", Market: "US", Category: "Commodity"},
	{Ticker: "GSG", Name: "Commodity", Market: "US", Category: "Commodity"},

	{Ticker: "XLK", Name: "Technology", Market: "US", Category: "Sector"},
	{Ticker: "XLF", Name: "Financials", Market: "US", Category: "Sector"},
	{Ticker: "XLE", Name: "Energy", Market: "US", Category: "Sector"},
	{Ticker: "XLV", Name: "Health Care", Market: "US", Category: "Sector"},
	{Ticker: "XLI", Name: "Industrials", Market: "US", Category: "Sector"},
	{Ticker: "XLP", Name: "Consumer Staples", Market: "US", Category: "Sector"},
	{Ticker: "XLY", Name: "Consumer Discretionary", Market: "US", Category: "Sector"},
	{Ticker: "XLU", Name: "Utilities", Market: "US", Category: "Sector"},
	{Ticker: "XLB", Name: "Materials", Market: "US", Category: "Sector"},
	{Ticker: "XLRE", Name: "Real Estate", Market: "US", Category: "Sector"},
	{Ticker: "XLC", Name: "Communication Services", Market: "US", Category: "Sector"},

	{Ticker: "VNQ", Name: "REIT", Market: "US", Category: "Real Estate"},
	{Ticker: "ARKK", Name: "Innovation", Market: "US", Category: "US Equity"},
	{Ticker: "BITO", Name: "Bitcoin Strategy", Market: "US", Category: "Alternative"},
}
