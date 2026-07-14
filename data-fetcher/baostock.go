package main

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"data-fetcher/baostock"

	"github.com/gin-gonic/gin"
	"github.com/sony/gobreaker"
)

var baoStockBreaker = gobreaker.NewCircuitBreaker(gobreaker.Settings{
	Name:        "baostock",
	MaxRequests: 5,
	Interval:    60 * time.Second,
	Timeout:     30 * time.Second,
	ReadyToTrip: func(counts gobreaker.Counts) bool {
		return counts.ConsecutiveFailures >= 5 ||
			(counts.Requests >= 5 && float64(counts.TotalFailures)/float64(counts.Requests) > 0.5)
	},
	OnStateChange: func(name string, from, to gobreaker.State) {
		slog.Warn("baostock 熔断器状态变更", "name", name, "from", from.String(), "to", to.String())
	},
})

func withBaoStockClient(fn func(*baostock.Client, *gin.Context) error) gin.HandlerFunc {
	return func(c *gin.Context) {
		_, err := baoStockBreaker.Execute(func() (interface{}, error) {
			client := baostock.NewClient()
			defer client.Close()

			if err := client.Connect(); err != nil {
				return nil, fmt.Errorf("连接baostock失败: %w", err)
			}
			if err := client.Login(); err != nil {
				return nil, fmt.Errorf("登录baostock失败: %w", err)
			}
			return nil, fn(client, c)
		})

		if err != nil {
			if err == gobreaker.ErrOpenState || err == gobreaker.ErrTooManyRequests {
				c.JSON(http.StatusServiceUnavailable, gin.H{
					"success": false,
					"error":   "baostock 服务暂时不可用（熔断器已开启），请稍后重试",
				})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": err.Error()})
			return
		}
	}
}

func handleBaoStockTest() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) error {
		start := time.Now()
		data, err := client.QueryHistoryKDataPlus(
			"sh.600000", "date,open,high,low,close,volume",
			"2025-01-01", "2025-12-31", "d", "3",
		)
		elapsed := time.Since(start).Milliseconds()
		if err != nil {
			return fmt.Errorf("baostock 测试请求失败: %w", err)
		}
		c.JSON(http.StatusOK, gin.H{
			"success": true, "count": len(data), "elapsed_ms": elapsed,
		})
		return nil
	})
}

func handleBaoStockKLine() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) error {
		code := c.Query("code")
		if code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "缺少code参数"})
			return nil
		}
		if !stockCodePattern.MatchString(code) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "code参数格式错误，应为 sh.XXXXXX 或 sz.XXXXXX"})
			return nil
		}
		startDate := c.DefaultQuery("start", "2020-01-01")
		endDate := c.DefaultQuery("end", time.Now().Format("2006-01-02"))
		frequency := c.DefaultQuery("freq", "d")
		adjustFlag := c.DefaultQuery("adjust", "2")
		fields := c.DefaultQuery("fields", "date,open,high,low,close,volume,amount,turn")

		data, err := client.QueryHistoryKDataPlus(code, fields, startDate, endDate, frequency, adjustFlag)
		if err != nil {
			return fmt.Errorf("K线数据获取失败: %w", err)
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": data, "count": len(data)})
		return nil
	})
}

func handleBaoStockAllStock() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) error {
		date := c.DefaultQuery("date", time.Now().Format("2006-01-02"))

		stocks, err := client.QueryAllStock(date)
		if err != nil {
			return fmt.Errorf("股票列表获取失败: %w", err)
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
		return nil
	})
}

func handleBaoStockTradeDates() gin.HandlerFunc {
	return withBaoStockClient(func(client *baostock.Client, c *gin.Context) error {
		startDate := c.DefaultQuery("start", "2020-01-01")
		endDate := c.DefaultQuery("end", time.Now().Format("2006-01-02"))

		dates, err := client.QueryTradeDates(startDate, endDate)
		if err != nil {
			return fmt.Errorf("交易日数据获取失败: %w", err)
		}

		c.JSON(http.StatusOK, gin.H{"success": true, "data": dates, "count": len(dates)})
		return nil
	})
}
