package optimizer

type OptimizeRequest struct {
	Tickers       []string                      `json:"tickers"`
	PriceData     map[string]map[string]float64 `json:"priceData"`
	Objective     string                        `json:"objective"`
	Constraints   Constraints                   `json:"constraints"`
	NumIterations int                           `json:"numIterations"`
}
type Constraints struct {
	MinWeight float64 `json:"minWeight"`
	MaxWeight float64 `json:"maxWeight"`
}
type OptimizeResponse struct {
	OptimalWeights     map[string]float64 `json:"optimalWeights"`
	ExpectedReturn     float64            `json:"expectedReturn"`
	ExpectedVolatility float64            `json:"expectedVolatility"`
	SharpeRatio        float64            `json:"sharpeRatio"`
}
type FrontierRequest struct {
	Tickers   []string                      `json:"tickers"`
	PriceData map[string]map[string]float64 `json:"priceData"`
	NumPoints int                           `json:"numPoints"`
}
type FrontierResponse struct {
	Frontier []FrontierPoint `json:"frontier"`
}
type FrontierPoint struct {
	Weights            map[string]float64 `json:"weights"`
	ExpectedReturn     float64            `json:"expectedReturn"`
	ExpectedVolatility float64            `json:"expectedVolatility"`
	SharpeRatio        float64            `json:"sharpeRatio"`
}
