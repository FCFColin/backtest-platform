package http

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestNewProblem_RFC7807Shape(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/fail", func(c *gin.Context) {
		NewProblem(c, http.StatusUnprocessableEntity, "BAD_REQUEST", "参数错误", "ticker 不能为空")
	})

	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/fail", nil))

	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("期望 422，实际 %d", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json; charset=utf-8" {
		t.Fatalf("Content-Type 异常: %s", ct)
	}

	var body Problem
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("响应不是合法 JSON: %v", err)
	}
	if body.Type != "https://backtest.platform/errors/BAD_REQUEST" {
		t.Errorf("Type 期望错误 URI，实际 %q", body.Type)
	}
	if body.Status != http.StatusUnprocessableEntity || body.Code != "BAD_REQUEST" {
		t.Errorf("Status/Code 异常: %+v", body)
	}
	if body.Title != "参数错误" || body.Detail != "ticker 不能为空" {
		t.Errorf("Title/Detail 异常: %+v", body)
	}
}
