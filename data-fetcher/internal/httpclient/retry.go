// Package httpclient 提供 HTTP 客户端、重试模板与熔断器集成的请求执行器。
package httpclient

import (
	"fmt"

	"github.com/sony/gobreaker"
)

// DoGetWithBreaker 在熔断器保护下执行 HTTP GET 并解析响应。
//
// breaker 为熔断器（nil 时跳过熔断保护，仅做 GET + parse）；
// client 为 HTTP 客户端；url 为请求地址；
// parse 为响应解析函数，将 body 转为目标类型。
//
// 模板抽取自 yfinance/akshare/twelvedata/finnhub 4 个 provider 的重复模式：
//   - httpClient.Get + parse（doWithRetry/doSearchRetry）
//   - breaker.Execute + httpClient.Get + parse（twelvedata/finnhub 内联）
//
// 失败语义：HTTP 错误或解析错误均会触发熔断器计数；类型断言失败视为内部错误。
func DoGetWithBreaker[T any](
	breaker *gobreaker.CircuitBreaker,
	client *Client,
	url string,
	parse func([]byte) (T, error),
) (T, error) {
	var zero T
	if breaker == nil {
		body, err := client.Get(url)
		if err != nil {
			return zero, err
		}
		return parse(body)
	}
	result, err := breaker.Execute(func() (interface{}, error) {
		body, err := client.Get(url)
		if err != nil {
			return nil, err
		}
		return parse(body)
	})
	if err != nil {
		return zero, err
	}
	parsed, ok := result.(T)
	if !ok {
		return zero, fmt.Errorf("DoGetWithBreaker: unexpected result type %T", result)
	}
	return parsed, nil
}
