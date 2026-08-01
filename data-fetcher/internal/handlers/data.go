package handlers

import (
	"context"
	"data-fetcher/internal/store"
	sharedhttp "github.com/backtest/go-shared/http"
	"github.com/gin-gonic/gin"
	"log/slog"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
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
			newProblem(c, http.StatusBadRequest, "INVALID_TICKER", "Invalid Ticker", "ticker参数格式非法: "+t)
			return false
		}
	}
	return true
}
func HandleSearch(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			newProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "缺少查询参数 q")
			return
		}
		limit := 20
		results, err := ds.SearchTickers(c.Request.Context(), query, limit)
		if err != nil {
			newProblem(c, http.StatusInternalServerError, "SEARCH_FAILED", "Search Failed", "搜索失败: "+err.Error())
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
	}
}
func HandlePriceData(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		ticker := c.Param("ticker")
		if !IsValidTicker(ticker) {
			newProblem(c, http.StatusBadRequest, "INVALID_TICKER", "Invalid Ticker", "ticker参数格式非法，仅允许大写字母、数字、点、下划线、连字符，长度1-20")
			return
		}
		startDate := c.Query("start")
		endDate := c.Query("end")
		prices, degraded, err := ds.GetPriceData(c.Request.Context(), ticker, startDate, endDate)
		if err != nil {
			newProblem(c, http.StatusNotFound, "DATA_NOT_FOUND", "Data Not Found", "标的数据不存在")
			return
		}
		if degraded {
			c.Header("Retry-After", "30")
			newProblem(c, http.StatusServiceUnavailable, "DEGRADED", "Degraded", "数据从实时源获取（降级模式），请稍后重试")
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": prices})
	}
}
func HandleBatchPriceData(ds *store.DataStore) gin.HandlerFunc {
	type BatchRequest struct {
		Tickers   []string `json:"tickers"`
		StartDate string   `json:"startDate"`
		EndDate   string   `json:"endDate"`
	}
	return func(c *gin.Context) {
		var req BatchRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			newProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "请求格式错误")
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
					}
				}()
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()
				prices, degraded, err := ds.GetPriceData(c.Request.Context(), t, req.StartDate, req.EndDate)
				mu.Lock()
				if err != nil {
					result[t] = map[string]string{"error": "标的数据不可用"}
				} else {
					result[t] = prices
					if degraded {
						degradedCount++
					}
				}
				mu.Unlock()
			}(ticker)
		}
		wg.Wait()
		if degradedCount > 0 {
			c.Header("Retry-After", "30")
			newProblem(c, http.StatusServiceUnavailable, "DEGRADED", "Degraded", "部分数据从实时源获取（降级模式），请稍后重试")
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	}
}
func HandleValidateTickers(ds *store.DataStore) gin.HandlerFunc {
	type ValidateRequest struct {
		Tickers []string `json:"tickers"`
	}
	return func(c *gin.Context) {
		var req ValidateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			newProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "请求格式错误")
			return
		}
		if !validateTickers(c, req.Tickers) {
			return
		}
		valid, invalid, err := ds.BatchValidateTickers(c.Request.Context(), req.Tickers)
		if err != nil {
			newProblem(c, http.StatusInternalServerError, "VALIDATION_FAILED", "Validation Failed", "校验失败")
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"valid": valid, "invalid": invalid}})
	}
}
func HandleCPI(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		country := c.Param("country")
		if country != "us" && country != "cn" {
			newProblem(c, http.StatusBadRequest, "VALIDATION_ERROR", "Validation Error", "目前仅支持美国(us)和中国(cn)CPI数据")
			return
		}
		rows, err := ds.Pool().Query(c.Request.Context(), `
			SELECT date, value FROM cpi_data
			WHERE country = $1
			ORDER BY date
		`, strings.ToUpper(country))
		if err != nil {
			newProblem(c, http.StatusInternalServerError, "CPI_QUERY_FAILED", "CPI Query Failed", "查询CPI数据失败")
			return
		}
		defer rows.Close()
		type cpiEntry struct {
			Date  string  `json:"date"`
			Value float64 `json:"value"`
		}
		var cpiData []cpiEntry
		for rows.Next() {
			var e cpiEntry
			var date time.Time
			if err := rows.Scan(&date, &e.Value); err != nil {
				newProblem(c, http.StatusInternalServerError, "CPI_PARSE_FAILED", "CPI Parse Failed", "解析CPI数据失败")
				return
			}
			e.Date = date.Format("2006-01-02")
			cpiData = append(cpiData, e)
		}
		if len(cpiData) == 0 {
			newProblem(c, http.StatusNotFound, "DATA_NOT_FOUND", "Data Not Found", "CPI数据不存在: "+country)
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": cpiData})
	}
}
func HandleHealth(ds *store.DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tickerCount, priceCount int
		if err := ds.Pool().QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM tickers").Scan(&tickerCount); err != nil {
			c.JSON(http.StatusOK, gin.H{"status": "degraded", "engine": "go", "version": "0.1.0", "error": "查询标的数失败"})
			return
		}
		if err := ds.Pool().QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM prices").Scan(&priceCount); err != nil {
			priceCount = 0
		}
		c.JSON(http.StatusOK, gin.H{
			"status":       "ok",
			"engine":       "go",
			"version":      "0.1.0",
			"ticker_count": tickerCount,
			"price_count":  priceCount,
		})
	}
}

type Problem = sharedhttp.Problem

func newProblem(c *gin.Context, status int, code, title, detail string) {
	sharedhttp.NewProblem(c, status, code, title, detail)
}

type Pinger interface {
	Ping(ctx context.Context) error
}

func HandleReady(p Pinger) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := p.Ping(c.Request.Context()); err != nil {
			slog.Warn("readiness 检查失败", "module", "handlers", "error", err)
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"status":  "unavailable",
				"engine":  "go",
				"service": "data-fetcher",
				"error":   err.Error(),
			})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ready", "engine": "go", "service": "data-fetcher"})
	}
}
