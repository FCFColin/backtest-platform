package main

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

func handleSearch(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := c.Query("q")
		if query == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少查询参数 q"})
			return
		}
		limit := 20
		results, err := ds.SearchTickers(c.Request.Context(), query, limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "搜索失败: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": results})
	}
}

func handlePriceData(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		ticker := c.Param("ticker")
		if !isValidTicker(ticker) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法，仅允许大写字母、数字、点、下划线、连字符，长度1-20"})
			return
		}

		startDate := c.Query("start")
		endDate := c.Query("end")

		prices, err := ds.GetPriceData(c.Request.Context(), ticker, startDate, endDate)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "标的数据不存在"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": prices})
	}
}

// BatchRequest 批量查询价格请求
type BatchRequest struct {
	Tickers   []string `json:"tickers"`
	StartDate string   `json:"startDate"`
	EndDate   string   `json:"endDate"`
}

func handleBatchPriceData(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req BatchRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
			return
		}

		for _, t := range req.Tickers {
			if !isValidTicker(t) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法: " + t})
				return
			}
		}

		result := make(map[string]interface{}, len(req.Tickers))
		var mu sync.Mutex
		var wg sync.WaitGroup

		type job struct {
			ticker string
		}
		jobs := make(chan job, len(req.Tickers))
		numWorkers := 10
		if len(req.Tickers) < numWorkers {
			numWorkers = len(req.Tickers)
		}

		for w := 0; w < numWorkers; w++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for j := range jobs {
					prices, err := ds.GetPriceData(c.Request.Context(), j.ticker, req.StartDate, req.EndDate)
					mu.Lock()
					if err != nil {
						result[j.ticker] = map[string]string{"error": "标的数据不可用"}
					} else {
						result[j.ticker] = prices
					}
					mu.Unlock()
				}
			}()
		}

		for _, ticker := range req.Tickers {
			jobs <- job{ticker: ticker}
		}
		close(jobs)
		wg.Wait()

		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	}
}

// ValidateRequest 批量验证 ticker 请求
type ValidateRequest struct {
	Tickers []string `json:"tickers"`
}

func handleValidateTickers(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req ValidateRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
			return
		}

		for _, t := range req.Tickers {
			if !isValidTicker(t) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "ticker参数格式非法: " + t})
				return
			}
		}

		valid, invalid, err := ds.BatchValidateTickers(c.Request.Context(), req.Tickers)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "校验失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"data": gin.H{
				"valid":   valid,
				"invalid": invalid,
			},
		})
	}
}

func handleCPI(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		country := c.Param("country")
		if country != "us" && country != "cn" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "目前仅支持美国(us)和中国(cn)CPI数据"})
			return
		}

		rows, err := ds.pool.Query(c.Request.Context(), `
			SELECT date, value FROM cpi_data
			WHERE country = $1
			ORDER BY date
		`, strings.ToUpper(country))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "查询CPI数据失败"})
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
				c.JSON(http.StatusInternalServerError, gin.H{"error": "解析CPI数据失败"})
				return
			}
			e.Date = date.Format("2006-01-02")
			cpiData = append(cpiData, e)
		}

		if len(cpiData) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "CPI数据不存在: " + country})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": cpiData})
	}
}

func handleHealth(ds *DataStore) gin.HandlerFunc {
	return func(c *gin.Context) {
		var tickerCount, priceCount int
		if err := ds.pool.QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM tickers").Scan(&tickerCount); err != nil {
			c.JSON(http.StatusOK, gin.H{
				"status":  "degraded",
				"engine":  "go",
				"version": "0.1.0",
				"error":   "查询标的数失败",
			})
			return
		}
		if err := ds.pool.QueryRow(c.Request.Context(), "SELECT COUNT(*) FROM prices").Scan(&priceCount); err != nil {
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
