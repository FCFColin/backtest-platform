// Package server 提供 HTTP 路由和处理器。
// 此文件包含单资产分析、PCA、LETF 滑点与因子回归相关处理器。
package server

import (
	"context"
	"net/http"

	"engine-go/internal/analysis"
	"engine-go/internal/factorregression"
	"engine-go/internal/letf"
	"engine-go/internal/pca"

	"github.com/gin-gonic/gin"
)

// handleAnalysis 单资产分析处理器。
// 企业理由：接收前端传入的 priceData 和参数，调用 analysis.RunAnalysis 计算结果。
// priceData 由前端传入而非 Go 服务读取文件，保持无状态设计，便于水平扩展。
func handleAnalysis(c *gin.Context) {
	var req analysis.AnalysisRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "ANALYSIS_BAD_REQUEST", "Bad Request", "请求格式错误")
		return
	}

	if len(req.Tickers) == 0 {
		newProblem(c, http.StatusBadRequest, "ANALYSIS_EMPTY_TICKERS", "Bad Request", "tickers 不能为空")
		return
	}

	if req.PriceData == nil {
		newProblem(c, http.StatusBadRequest, "ANALYSIS_EMPTY_PRICE_DATA", "Bad Request", "priceData 不能为空")
		return
	}

	for _, ticker := range req.Tickers {
		if _, ok := req.PriceData[ticker]; !ok {
			newProblem(c, http.StatusBadRequest, "ANALYSIS_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
			return
		}
	}

	withComputeHandler(c, "分析计算失败", func(ctx context.Context) (analysis.AnalysisResult, error) {
		return analysis.RunAnalysis(ctx, req)
	})
}

// handlePCA 主成分分析处理器。
func handlePCA(c *gin.Context) {
	var req pca.PCARequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "PCA_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	if len(req.Tickers) < 2 {
		newProblem(c, http.StatusBadRequest, "PCA_INSUFFICIENT_TICKERS", "Bad Request", "至少需要 2 个 ticker")
		return
	}
	withComputeHandler(c, "PCA 计算失败", func(ctx context.Context) (*pca.PCAResult, error) {
		return pca.PerformPCA(req)
	})
}

// handleLETFAnalyze LETF 滑点分析处理器。
func handleLETFAnalyze(c *gin.Context) {
	var req struct {
		LETFTicker      string                        `json:"letfTicker"`
		BenchmarkTicker string                        `json:"benchmarkTicker"`
		Leverage        float64                       `json:"leverage"`
		PriceData       map[string]map[string]float64 `json:"priceData"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "LETF_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	letfData, ok1 := req.PriceData[req.LETFTicker]
	benchData, ok2 := req.PriceData[req.BenchmarkTicker]
	if !ok1 || !ok2 {
		newProblem(c, http.StatusBadRequest, "LETF_TICKER_NOT_FOUND", "Bad Request", "ticker 在 priceData 中不存在")
		return
	}
	letfSeries := letf.ToPricePoints(letfData)
	benchSeries := letf.ToPricePoints(benchData)
	withComputeHandler(c, "LETF 滑点分析失败", func(ctx context.Context) (*letf.LETFResult, error) {
		return letf.AnalyzeSlippage(letf.LETFRequest{
			LETFSeries:  letfSeries,
			BenchSeries: benchSeries,
			Leverage:    req.Leverage,
		})
	})
}

// handleFactorRegression Fama-French 因子回归处理器。
func handleFactorRegression(c *gin.Context) {
	var req factorregression.FactorRegressionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "FR_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	withComputeHandler(c, "因子回归计算失败", func(ctx context.Context) (*factorregression.RegressionResult, error) {
		return factorregression.RunRegression(req)
	})
}
