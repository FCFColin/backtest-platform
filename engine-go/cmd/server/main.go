// Go 引擎服务入口（T-ARCH-2.5）。
// 企业理由：Go 引擎提供单资产分析 API，与 Node.js API 服务解耦。
// 独立部署可按需水平扩展，避免与前端 API 争抢计算资源。
package main

import (
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"

	"engine-go/internal/server"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)

	port := os.Getenv("ENGINE_GO_PORT")
	if port == "" {
		port = "5004"
	}

	r := server.SetupRouter()

	// Observability: pprof在线诊断端点，独立端口与业务隔离
	// 企业为何需要：生产环境无法SSH时，通过pprof诊断CPU/内存/goroutine泄漏
	// 权衡：独立端口避免暴露到公网，仅内网可访问
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/debug/pprof/", pprof.Index)
		mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
		mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
		mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
		mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
		logger.Info("pprof server starting", "port", "6061")
		if err := http.ListenAndServe(":6061", mux); err != nil {
			logger.Error("pprof server failed", "error", err)
		}
	}()

	slog.Info("Go引擎服务启动", "port", port, "version", "0.1.0")
	if err := r.Run(":" + port); err != nil {
		slog.Error("启动失败", "error", err)
		os.Exit(1)
	}
}
