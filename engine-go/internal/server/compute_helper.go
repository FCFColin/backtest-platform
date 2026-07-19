// Package server 提供 HTTP 路由和处理器。
// 此文件包含计算类处理器共享的 helper，统一 ctx + 错误/成功响应包装逻辑。
package server

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
)

// withComputeHandler 包装计算类处理器通用逻辑：创建带 computeTimeout 超时的 context，
// 调用 fn(ctx) 执行实际计算，并按统一格式返回 JSON 响应。
//
// 企业理由（W3-6）：6 个 handler 重复同一段 ctx.WithTimeout + 500/200 包装代码，
// 抽取后调用方只需关注 bind 与业务调用本身。
//
// 失败响应：HTTP 500 + {"success": false, "error": errMsg}
// 成功响应：HTTP 200 + {"success": true, "data": result}
func withComputeHandler[T any](
	c *gin.Context,
	errMsg string,
	fn func(ctx context.Context) (T, error),
) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := fn(ctx)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": errMsg})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
