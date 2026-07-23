// Package server 提供 HTTP 路由和处理器。
// 此文件包含处理器共享的 helper：RFC 7807 错误响应与计算类处理器通用包装逻辑。
package server

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Problem RFC 7807 错误响应（AGENTS.md 第 6 条 / RO-045 4xx 透传）
type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Code   string `json:"code"`
	Detail string `json:"detail"`
}

// newProblem 发送 RFC 7807 Problem Details JSON 错误响应。
// code 为应用特定错误码，对应 TS 端 UpstreamProblemError.code 字段。
func newProblem(c *gin.Context, status int, code, title, detail string) {
	c.JSON(status, Problem{
		Type:   "https://backtest.platform/errors/" + code,
		Title:  title,
		Status: status,
		Code:   code,
		Detail: detail,
	})
}

// withComputeHandler 包装计算类处理器通用逻辑：panic recovery + 创建带 computeTimeout 超时的 context、
// 调用 fn(ctx) 执行实际计算、错误日志记录，并按统一格式返回 JSON 响应。
//
// 企业理由（W3-6）：多个 handler 重复同一段 ctx.WithTimeout + 500/200 包装代码，
// 抽取后调用方只需关注 bind 与业务调用本身。panic recovery 确保计算 panic 时返回
// 结构化 500 响应而非 gin 默认的空体中断，错误经 slog 记录便于排查。
//
// 失败响应：HTTP 500 + {"success": false, "error": errMsg}
// 成功响应：HTTP 200 + {"success": true, "data": result}
func withComputeHandler[T any](
	c *gin.Context,
	errMsg string,
	fn func(ctx context.Context) (T, error),
) {
	defer func() {
		if r := recover(); r != nil {
			slog.Error("计算处理器 panic", "path", c.Request.URL.Path, "panic", r)
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"success": false, "error": errMsg})
		}
	}()

	ctx, cancel := context.WithTimeout(c.Request.Context(), computeTimeout)
	defer cancel()

	result, err := fn(ctx)
	if err != nil {
		slog.Error("计算处理器失败", "path", c.Request.URL.Path, "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"success": false, "error": errMsg})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
