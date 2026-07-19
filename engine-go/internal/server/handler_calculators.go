// Package server 提供 HTTP 路由和处理器。
// 此文件包含金融计算器相关处理器（CAGR/SWR/两基金前沿）。
package server

import (
	"net/http"

	"engine-go/internal/calculators"

	"github.com/gin-gonic/gin"
)

// handleCalculators 金融计算器处理器。
func handleCalculators(c *gin.Context) {
	var req struct {
		Type     string                             `json:"type"`
		CAGR     *calculators.CAGRRequest           `json:"cagr,omitempty"`
		SWR      *calculators.SWRRequest            `json:"swr,omitempty"`
		Frontier *calculators.TwoFundFrontierRequest `json:"frontier,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		newProblem(c, http.StatusBadRequest, "CALC_BAD_REQUEST", "Bad Request", "请求解析失败")
		return
	}
	switch req.Type {
	case "cagr":
		if req.CAGR == nil {
			newProblem(c, http.StatusBadRequest, "CALC_MISSING_CAGR", "Bad Request", "cagr 类型需要 cagr 参数")
			return
		}
		result := calculators.CalcCAGR(*req.CAGR)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	case "swr":
		if req.SWR == nil {
			newProblem(c, http.StatusBadRequest, "CALC_MISSING_SWR", "Bad Request", "swr 类型需要 swr 参数")
			return
		}
		result := calculators.CalcSWR(*req.SWR)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	case "frontier":
		if req.Frontier == nil {
			newProblem(c, http.StatusBadRequest, "CALC_MISSING_FRONTIER", "Bad Request", "frontier 类型需要 frontier 参数")
			return
		}
		result := calculators.CalcTwoFundFrontier(*req.Frontier)
		c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
	default:
		newProblem(c, http.StatusBadRequest, "CALC_INVALID_TYPE", "Bad Request", "type 必须是 cagr/swr/frontier")
	}
}
