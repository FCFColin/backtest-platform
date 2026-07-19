// Package server 提供 HTTP 路由和处理器。
// 此文件包含组合回测与统计指标相关处理器。
package server

import (
	"context"
	"net/http"

	"engine-go/internal/engine"

	"github.com/gin-gonic/gin"
)

// handleBacktest 组合回测处理器（ADR-008）。
//
// 企业理由：Go 引擎作为主回测引擎暴露 HTTP 接口，接收前端/API 传入的
// priceData、portfolios 与 params，调用 engine.RunBacktest 计算净值曲线、
// 统计指标、回撤与相关性。无状态设计（priceData 由调用方传入）便于水平扩展，
// 接口与 /api/engine/backtest 兼容，确保降级链路一致。
func handleBacktest(c *gin.Context) {
	var req engine.BacktestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "BACKTEST_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	if len(req.Portfolios) == 0 {
		newProblem(c, http.StatusBadRequest, "BACKTEST_EMPTY_PORTFOLIOS", "Bad Request", "portfolios 不能为空")
		return
	}

	if req.PriceData == nil {
		newProblem(c, http.StatusBadRequest, "BACKTEST_EMPTY_PRICE_DATA", "Bad Request", "priceData 不能为空")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := engine.RunBacktest(ctx, req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   "回测计算失败",
		})
		return
	}

	c.JSON(http.StatusOK, result)
}

// handleStatistics 统计指标计算处理器。
// tactical/signal 等内部路径通过 Go 函数直接调用 engine.CalculateStatisticsFromRequest，
// 本端点供外部 HTTP 调用方使用。
func handleStatistics(c *gin.Context) {
	var req engine.StatisticsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "STATISTICS_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	if len(req.Values) < 2 {
		newProblem(c, http.StatusBadRequest, "STATISTICS_INSUFFICIENT_DATA", "Bad Request", "values 至少需要 2 个数据点")
		return
	}

	result := engine.CalculateStatisticsFromRequest(req)

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    result,
	})
}
