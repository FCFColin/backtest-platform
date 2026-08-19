package handlers

import (
	"context"
	"data-fetcher/internal/store"
	"data-fetcher/internal/version"
	"errors"
	"fmt"
	sharedhttp "github.com/backtest/go-shared/http"
	"github.com/gin-gonic/gin"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
)

var tickerPattern = regexp.MustCompile(`^[A-Z0-9._-]{1,20}$`)

func IsValidTicker(ticker string) bool {
	if ticker == "" || len(ticker) > 20 {
		return false
	}
	if strings.Contains(ticker, "..") || strings.ContainsAny(ticker, `/\`) {
		return false
	}
	return tickerPattern.MatchString(ticker)
}
func validateTickers(c *gin.Context, tickers []string) bool {
	for _, t := range tickers {
		if !IsValidTicker(t) {
			sharedhttp.NewProblem(c, http.StatusBadRequest, "INVALID_TICKER", "Invalid Ticker", "ticker参数格式非法: "+t)
			return false
		}
	}
	return true
}
func HandleSearch(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			sharedhttp.NewProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "缺少查询参数 q")
			return
		}
		results, err := ds.SearchTickers(c.Request.Context(), query, 20)
		if err != nil {
			sharedhttp.NewProblem(c, http.StatusInternalServerError, "SEARCH_FAILED", "Search Failed", "搜索失败: "+err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
	}
}
func HandlePriceData(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		ticker := c.Param("ticker")
		if !IsValidTicker(ticker) {
			sharedhttp.NewProblem(c, http.StatusBadRequest, "INVALID_TICKER", "Invalid Ticker", "ticker参数格式非法，仅允许大写字母、数字、点、下划线、连字符，长度1-20")
			return
		}
		startDate := c.Query("start")
		endDate := c.Query("end")
		prices, degraded, err := ds.GetPriceData(c.Request.Context(), ticker, startDate, endDate)
		if err != nil {
			switch {
			case errors.Is(err, store.ErrDBQuery):
				sharedhttp.NewProblem(c, http.StatusInternalServerError, "DATA_QUERY_FAILED", "Data Query Failed", "查询价格数据失败")
			case errors.Is(err, store.ErrProviderUnavailable):
				slog.Warn("实时数据源抓取失败，上游暂不可用", "ticker", ticker, "error", err)
				sharedhttp.NewDegradedProblem(c, http.StatusServiceUnavailable, "DATA_PROVIDER_UNAVAILABLE", "Data Provider Unavailable", "实时数据源暂不可用，请稍后重试")
			default:
				sharedhttp.NewProblem(c, http.StatusNotFound, "DATA_NOT_FOUND", "Data Not Found", "标的数据不存在")
			}
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": prices, "degraded": degraded})
	}
}

// 批量刷新为数据更新任务的唯一调用方（全量/增量），语义是强制从 provider 实时抓取。
// M4 安全限制：限制请求体大小与 ticker 数量，防止持有服务令牌的内部调用方打爆内存。

func HandleBatchPriceData(ds *store.DataStore) gin.HandlerFunc {
	type BatchRequest struct {
		Tickers   []string `json:"tickers"`
		StartDate string   `json:"startDate"`
		EndDate   string   `json:"endDate"`
	}
	return func(c *gin.Context) {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 1<<20)
		var req BatchRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			sharedhttp.NewProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "请求格式错误")
			return
		}
		if len(req.Tickers) > 100 {
			sharedhttp.NewProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "tickers 数量不能超过 100")
			return
		}
		if !validateTickers(c, req.Tickers) {
			return
		}
		result := make(map[string]interface{})
		var mu sync.Mutex
		var wg sync.WaitGroup
		var degradedCount int
		sem := make(chan struct{}, 10)
		for _, ticker := range req.Tickers {
			wg.Add(1)
			go func(t string) {
				defer func() {
					if r := recover(); r != nil {
						slog.Error("batch price data goroutine panic", "ticker", t, "panic", r)
						mu.Lock()
						result[t] = map[string]interface{}{"error": fmt.Sprintf("内部错误: %v", r), "degraded": true}
						mu.Unlock()
					}
				}()
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				prices, err := ds.RefreshPriceData(c.Request.Context(), t, req.StartDate, req.EndDate)
				mu.Lock()
				if err != nil {
					if errors.Is(err, store.ErrProviderUnavailable) {
						slog.Warn("批量刷新失败，上游暂不可用", "ticker", t, "error", err)
						result[t] = map[string]interface{}{"error": "实时数据源暂不可用", "degraded": true}
						degradedCount++
					} else {
						result[t] = map[string]string{"error": "标的数据不存在"}
					}
				} else {
					result[t] = prices
				}
				mu.Unlock()
			}(ticker)
		}
		wg.Wait()
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "degraded": degradedCount > 0})
	}
}
func HandleCPI(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		country := c.Param("country")
		if country != "us" && country != "cn" {
			sharedhttp.NewProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "目前仅支持美国(us)和中国(cn)CPI数据")
			return
		}
		data, err := ds.GetCPI(c.Request.Context(), strings.ToUpper(country))
		if err != nil {
			sharedhttp.NewProblem(c, http.StatusInternalServerError, "CPI_QUERY_FAILED", "CPI Query Failed", "查询CPI数据失败")
			return
		}
		if len(data) == 0 {
			sharedhttp.NewProblem(c, http.StatusNotFound, "DATA_NOT_FOUND", "Data Not Found", "CPI数据不存在: "+country)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": data})
	}
}
func HandleHealth(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tickerCount, priceCount int
		if err := ds.Pool().QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM tickers").Scan(&tickerCount); err != nil {
			c.JSON(http.StatusOK, gin.H{"status": "degraded", "engine": "go", "version": version.String, "error": "查询标的数失败"})
			return
		}
		if err := ds.Pool().QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM prices").Scan(&priceCount); err != nil {
			priceCount = 0
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "engine": "go", "version": version.String, "ticker_count": tickerCount, "price_count": priceCount})
	}
}

type pinger interface {
	Ping(ctx context.Context) error
}

func HandleReady(p pinger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := p.Ping(c.Request.Context()); err != nil {
			slog.Warn("readiness 检查失败", "module", "handlers", "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unavailable", "engine": "go", "service": "data-fetcher", "error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready", "engine": "go", "service": "data-fetcher"})
	}
}
