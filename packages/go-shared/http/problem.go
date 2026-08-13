// Package http 提供 HTTP 服务器与诊断端点的跨服务共享启动逻辑。
// 此文件提供 RFC 7807 Problem Details 错误响应的统一类型与构造函数，
// 收口 engine-go 与 data-fetcher 原各自维护的重复 Problem 定义，
// 便于 Node 端 httpClient.ts 的 parseUpstreamProblem 统一解析（AGENTS.md 第 6 条）。
package http

import "github.com/gin-gonic/gin"

// Problem RFC 7807 错误响应（AGENTS.md 第 6 条：所有 API 错误使用 RFC 7807）。
type Problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Code   string `json:"code"`
	Detail string `json:"detail"`
	// Degraded 表示请求因上游降级/不可用而失败（区别于客户端请求错误）。
	Degraded bool `json:"degraded,omitempty"`
}

// NewProblem 发送 RFC 7807 Problem Details JSON 错误响应。
//
// code 为应用特定错误码，对应 TS 端 UpstreamProblemError.code 字段。
// detail 为面向用户的可读错误说明（可包含上下文信息）。
//
// 企业理由：engine-go 与 data-fetcher 原各自维护完全相同的 Problem 结构体与
// newProblem 函数，DRY 收口到 go-shared 后两服务调用方仅需 import 一处。
func NewProblem(c *gin.Context, status int, code, title, detail string) {
	c.JSON(status, Problem{
		Type:   "https://backtest.platform/errors/" + code,
		Title:  title,
		Status: status,
		Code:   code,
		Detail: detail,
	})
}

// NewDegradedProblem 同 NewProblem，但带 degraded 标记（上游数据源不可用等降级失败）。
func NewDegradedProblem(c *gin.Context, status int, code, title, detail string) {
	c.JSON(status, Problem{
		Type:     "https://backtest.platform/errors/" + code,
		Title:    title,
		Status:   status,
		Code:     code,
		Detail:   detail,
		Degraded: true,
	})
}
