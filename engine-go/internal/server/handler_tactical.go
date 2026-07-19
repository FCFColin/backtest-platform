// Package server 提供 HTTP 路由和处理器。
// 此文件包含战术分配回测与网格搜索相关处理器。
package server

import (
	"context"
	"net/http"

	"engine-go/internal/engine/tactical"

	"github.com/gin-gonic/gin"
)

// handleTacticalBacktest 战术分配回测处理器。
func handleTacticalBacktest(c *gin.Context) {
	var req tactical.TacticalBacktestRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "TACTICAL_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	withComputeHandler(c, "战术回测计算失败", func(ctx context.Context) (*tactical.TacticalBacktestResult, error) {
		return tactical.RunTacticalBacktest(ctx, req)
	})
}

// handleTacticalGridSearch 战术网格搜索处理器。
func handleTacticalGridSearch(c *gin.Context) {
	var req tactical.TacticalGridRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "GRID_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	withComputeHandler(c, "网格搜索计算失败", func(ctx context.Context) (*tactical.TacticalGridResponse, error) {
		return tactical.RunGridSearch(ctx, req)
	})
}
