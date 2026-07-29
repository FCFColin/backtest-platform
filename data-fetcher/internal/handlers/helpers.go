// Package handlers 提供 data-fetcher 服务的 HTTP 处理器。
// 此文件包含处理器共享的 helper：RFC 7807 错误响应（D4-008 修复）。
package handlers

import "github.com/gin-gonic/gin"

// Problem RFC 7807 错误响应（AGENTS.md 第 6 条：所有 API 错误使用 RFC 7807）。
// 与 engine-go/internal/server/helpers.go 的 Problem 结构体保持一致，
// 便于 Node 端 httpClient.ts 的 parseUpstreamProblem 统一解析。
type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Code   string `json:"code"`
	Detail string `json:"detail"`
}

// newProblem 发送 RFC 7807 Problem Details JSON 错误响应。
// code 为应用特定错误码，对应 TS 端 UpstreamProblemError.code 字段。
// detail 为面向用户的可读错误说明（可包含上下文信息）。
func newProblem(c *gin.Context, status int, code, title, detail string) {
	c.JSON(status, Problem{
		Type:   "https://backtest.platform/errors/" + code,
		Title:  title,
		Status: status,
		Code:   code,
		Detail: detail,
	})
}