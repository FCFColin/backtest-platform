// Package middleware 提供跨服务共享的 Gin 中间件。
package middleware

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// SharedTokenAuthMiddleware 构造一个基于静态共享 token 的认证中间件：
// 从 headerName 读取请求 token，与 envVarName 环境变量做常量时间比对，不匹配返回 401。
//
// 企业理由：engine-go 与 data-fetcher 原各自维护完全相同的 token 校验逻辑，
// 收口到 go-shared 后仅需按服务传入 header/env 名称与提示文案。
// 使用常量时间比较防止时序侧信道泄露 token 信息。
//
// 参数：
//   - headerName: 承载 token 的请求头名称（如 "X-Engine-Auth"）
//   - envVarName: 存储期望 token 的环境变量名（如 "ENGINE_AUTH_TOKEN"）
//   - missingHeaderMsg: 请求头缺失时返回的错误提示
//   - noTokenMsg: 服务端未配置 token 时返回的错误提示
//
// 返回：gin.HandlerFunc，未通过认证时以 401 中断请求。
func SharedTokenAuthMiddleware(headerName, envVarName, missingHeaderMsg, noTokenMsg string) gin.HandlerFunc {
	return func(c *gin.Context) {
		expected := strings.TrimSpace(os.Getenv(envVarName))
		// 未配置 token 时拒绝所有请求，避免无认证暴露
		if expected == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": noTokenMsg,
			})
			return
		}

		provided := c.GetHeader(headerName)
		if provided == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": missingHeaderMsg,
			})
			return
		}

		// 常量时间比较，防止时序攻击
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "认证失败",
			})
			return
		}

		c.Next()
	}
}
