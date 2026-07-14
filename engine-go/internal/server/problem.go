package server

import (
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
