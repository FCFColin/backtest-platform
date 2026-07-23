// Package server 提供 HTTP 路由和处理器。
// 此文件包含组合优化、有效前沿、蒙特卡洛模拟与目标优化相关处理器。
package server

import (
	"context"
	"net/http"

	"engine-go/internal/goaloptimizer"
	"engine-go/internal/montecarlo"
	"engine-go/internal/optimizer"

	"github.com/gin-gonic/gin"
)

// handleOptimize 组合优化处理器（T-ARCH-2.4）
//
// 企业理由：根据用户选择的目标（最大夏普比/最小波动率/最大收益），
// 计算最优资产权重配置。闭式解优先，失败时回退到随机搜索。
func handleOptimize(c *gin.Context) {
	var req optimizer.OptimizeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "OPTIMIZE_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	withComputeHandler(c, "优化计算失败", func(ctx context.Context) (*optimizer.OptimizeResponse, error) {
		return optimizer.Optimize(ctx, req)
	})
}

// handleEfficientFrontier 有效前沿处理器（T-ARCH-2.4）
//
// 企业理由：计算有效前沿曲线，前端绘制风险-收益散点图，
// 帮助用户直观理解不同配置下的收益与波动关系。
func handleEfficientFrontier(c *gin.Context) {
	var req optimizer.FrontierRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "FRONTIER_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	withComputeHandler(c, "有效前沿计算失败", func(ctx context.Context) (*optimizer.FrontierResponse, error) {
		return optimizer.ComputeEfficientFrontier(ctx, req)
	})
}

// handleMonteCarlo 蒙特卡洛模拟处理器（T-ARCH-2.3）
func handleMonteCarlo(c *gin.Context) {
	var req montecarlo.MonteCarloRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "MONTE_CARLO_BAD_REQUEST", "Bad Request", "请求解析失败，请检查请求格式")
		return
	}

	withComputeHandler(c, "蒙特卡洛模拟失败", func(ctx context.Context) (*montecarlo.MonteCarloResult, error) {
		return montecarlo.RunMonteCarlo(ctx, req)
	})
}

// handleGoalOptimize 目标优化处理器。
func handleGoalOptimize(c *gin.Context) {
	var req goaloptimizer.GoalOptimizerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "GOAL_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	withComputeHandler(c, "目标优化计算失败", func(ctx context.Context) (*goaloptimizer.GoalOptimizerResult, error) {
		return goaloptimizer.OptimizeGoals(req)
	})
}
