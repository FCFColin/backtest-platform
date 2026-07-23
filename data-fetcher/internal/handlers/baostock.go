package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"time"

	"data-fetcher/baostock"
	"data-fetcher/internal/provider"

	"github.com/gin-gonic/gin"
	"github.com/sony/gobreaker"
)

var stockCodePattern = regexp.MustCompile(`^(sh|sz)\.\d{6}$`)

// ============================================================
// BaoStock Handlers
// ============================================================

var baoStockBreaker = provider.NewProviderBreaker("baostock", 5)

func withBaoStockClient(fn func(*baostock.Client, *gin.Context)) gin.HandlerFunc {
	return func(c *gin.Context) {
		result, err := baoStockBreaker.Execute(func() (interface{}, error) {
			client := baostock.NewClient()
			defer client.Close()

			if err := client.Connect(); err != nil {
				return nil, fmt.Errorf("连接baostock失败: %w", err)
			}
			if err := client.Login(); err != nil {
				return nil, fmt.Errorf("登录baostock失败: %w", err)
			}
			fn(client, c)
			return nil, nil
		})

		if err != nil {
			if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"success": false,
					"error":   "baostock 服务暂时不可用（熔断器已开启），请稍后重试",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "baostock 服务内部错误"})
			return
		}
		_ = result
	}
}

func HandleBaoStockTest() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		start := time.Now()
		data, err := client.QueryHistoryKDataPlus(
			"sh.600000", "date,open,high,low,close,volume",
			"2025-01-01", "2025-12-31", "d", "3",
		)
		elapsed := time.Since(start).Milliseconds()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "baostock 测试请求失败", "elapsed_ms": elapsed})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true, "count": len(data), "elapsed_ms": elapsed,
		})
	})
}

func HandleBaoStockKLine() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		code := c.Query("code")
		if code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少code参数"})
			return
		}
		if !stockCodePattern.MatchString(code) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code参数格式错误，应为 sh.XXXXXX 或 sz.XXXXXX"})
			return
		}
		startDate := c.DefaultQuery("start", "2020-01-01")
		endDate := c.DefaultQuery("end", time.Now().Format("2006-01-02"))
		frequency := c.DefaultQuery("freq", "d")
		adjustFlag := c.DefaultQuery("adjust", "2")
		fields := c.DefaultQuery("fields", "date,open,high,low,close,volume,amount,turn")

		data, err := client.QueryHistoryKDataPlus(code, fields, startDate, endDate, frequency, adjustFlag)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "K线数据获取失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": data, "count": len(data)})
	})
}

func HandleBaoStockAllStock() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))

		stocks, err := client.QueryAllStock(date)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "股票列表获取失败"})
			return
		}

		result := make([]map[string]string, 0, len(stocks))
		for _, s := range stocks {
			if s.TradeStatus == "1" {
				result = append(result, map[string]string{
					"code": s.Code, "name": s.CodeName, "market": "A股",
				})
			}
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": result, "count": len(result)})
	})
}

func HandleBaoStockTradeDates() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) {
		startDate := c.DefaultQuery("start", "2020-01-01")
		endDate := c.DefaultQuery("end", time.Now().Format("2006-01-02"))

		dates, err := client.QueryTradeDates(startDate, endDate)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": "交易日数据获取失败"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": dates, "count": len(dates)})
	})
}
