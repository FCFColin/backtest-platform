// Package server 提供 HTTP 路由和处理器。
// 此文件包含信号分析相关处理器。
package server

import (
	"context"
	"net/http"

	"engine-go/internal/signal"

	"github.com/gin-gonic/gin"
)

// handleSignalAnalyze 信号分析处理器。
// 企业理由：信号生成逻辑独立实现于 Go 引擎，统一计算入口（ADR-031）。
// 支持单信号、双信号、多信号三种模式。
// priceData 由调用方传入，保持无状态设计。
func handleSignalAnalyze(c *gin.Context) {
	var req struct {
		Mode      string                        `json:"mode"` // "single" | "dual" | "multi"
		Single    *signal.SignalAnalysisRequest `json:"single,omitempty"`
		Dual      *signal.DualSignalConfig      `json:"dual,omitempty"`
		Multi     *signal.MultiSignalConfig     `json:"multi,omitempty"`
		PriceData map[string]map[string]float64 `json:"priceData"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "SIGNAL_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	switch req.Mode {
	case "single":
		if req.Single == nil {
			newProblem(c, http.StatusBadRequest, "SIGNAL_MISSING_SINGLE", "Bad Request", "single 模式需要 single 参数")
			return
		}
		tickerData, ok := req.PriceData[req.Single.Ticker]
		if !ok {
			newProblem(c, http.StatusBadRequest, "SIGNAL_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
		data := signal.ToPricePoints(tickerData)
		result := signal.AnalyzeSignal(*req.Single, data)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})

	case "dual":
		if req.Dual == nil {
			newProblem(c, http.StatusBadRequest, "SIGNAL_MISSING_DUAL", "Bad Request", "dual 模式需要 dual 参数")
			return
		}
		td1, ok1 := req.PriceData[req.Dual.Signal1.Ticker]
		td2, ok2 := req.PriceData[req.Dual.Signal2.Ticker]
		if !ok1 || !ok2 {
			newProblem(c, http.StatusBadRequest, "SIGNAL_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
		data1 := signal.ToPricePoints(td1)
		data2 := signal.ToPricePoints(td2)
		result := signal.AnalyzeDualSignal(req.Dual.Signal1, req.Dual.Signal2, data1, data2, req.Dual.CombinationMethod)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})

	case "multi":
		if req.Multi == nil || len(req.Multi.Signals) == 0 {
			newProblem(c, http.StatusBadRequest, "SIGNAL_MISSING_MULTI", "Bad Request", "multi 模式需要 multi.signals 参数")
			return
		}
		ticker := req.Multi.Signals[0].Ticker
		td, ok := req.PriceData[ticker]
		if !ok {
			newProblem(c, http.StatusBadRequest, "SIGNAL_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
		data := signal.ToPricePoints(td)
		result := signal.AnalyzeMultiSignal(ctx, req.Multi.Signals, data, req.Multi.AggregationMethod, req.Multi.Weights)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})

	default:
		newProblem(c, http.StatusBadRequest, "SIGNAL_INVALID_MODE", "Bad Request", "mode 必须是 single/dual/multi")
	}
}
