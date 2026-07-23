// Go 引擎服务入口（T-ARCH-2.5）。
// 企业理由：Go 引擎承担全部组合计算与单资产分析负载，与 Node.js API 服务解耦。
// 独立部署可按需水平扩展，避免与前端 API 争抢计算资源。
// 暴露端点：backtest / analysis / optimize / efficient-frontier / monte-carlo /
// statistics / signal-analyze / pca / letf-analyze / goal-optimize /
// tactical-backtest / tactical-grid-search / factor-regression / calculators（共 14 个）。
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"engine-go/internal/server"

	gosharedhttp "github.com/backtest/go-shared/http"
	gosharedlog "github.com/backtest/go-shared/log"
	"github.com/backtest/go-shared/observability"
)

func main() {
	gosharedlog.InitDefault()

	port := os.Getenv("ENGINE_GO_PORT")
	if port == "" {
		port = "5004"
	}

	shutdownObs, metricsHandler := observability.MustInit("engine-go")
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownObs(ctx)
	}()

	r := server.SetupRouter(metricsHandler)

	// pprof 在线诊断端点（go-shared 启动）：
	// 默认仅绑定回环地址，需显式 ENABLE_PPROF=true 才启动。
	// 生产如需远程采集，应经由 sidecar/端口转发或前置鉴权代理。
	gosharedhttp.StartPprofServerIfEnabled("127.0.0.1:6061")

	slog.Info("Go引擎服务启动", "port", port, "version", "0.1.0")
	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           r,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      120 * time.Second,
		ReadHeaderTimeout: 10 * time.Second,
	}
	gosharedhttp.RunServer(srv, 30*time.Second)
}
