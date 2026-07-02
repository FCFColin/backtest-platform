// Go 引擎服务入口（T-ARCH-2.5）。
// 企业理由：Go 引擎提供单资产分析 API，与 Node.js API 服务解耦。
// 独立部署可按需水平扩展，避免与前端 API 争抢计算资源。
package main

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"
	"os/signal"
	"syscall"
	"time"

	"engine-go/internal/observability"
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

	shutdownObs, metricsHandler := observability.MustInit("engine-go")
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownObs(ctx)
	}()

	r := server.SetupRouter(metricsHandler)

	// Observability: pprof在线诊断端点，独立端口与业务隔离
	// 企业为何需要：生产环境无法SSH时，通过pprof诊断CPU/内存/goroutine泄漏
	// Security (T-29): pprof 暴露堆/goroutine/CPU 等高敏诊断数据，且 /debug/pprof/profile
	// 会触发持续 CPU 采样（可被滥用为 DoS）。此前绑定 ":6061"（0.0.0.0）且无认证，与注释
	// 声称的"仅内网"不符。改为：默认仅绑定回环地址（127.0.0.1），且需显式 ENABLE_PPROF=true 才启动。
	// 生产如需远程采集，应经由 sidecar/端口转发或在 PPROF_ADDR 前置鉴权代理，而非裸暴露。
	if os.Getenv("ENABLE_PPROF") == "true" {
		go func() {
			pprofAddr := os.Getenv("PPROF_ADDR")
			if pprofAddr == "" {
				pprofAddr = "127.0.0.1:6061"
			}
			mux := http.NewServeMux()
			mux.HandleFunc("/debug/pprof/", pprof.Index)
			mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
			mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
			mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
			mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
			logger.Info("pprof server starting", "addr", pprofAddr)
			if err := http.ListenAndServe(pprofAddr, mux); err != nil {
				logger.Error("pprof server failed", "error", err)
			}
		}()
	}

	slog.Info("Go引擎服务启动", "port", port, "version", "0.1.0")
	// 优雅关闭：SIGTERM 时 flush OTel span
	srv := &http.Server{Addr: ":" + port, Handler: r}
	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("启动失败", "error", err)
			os.Exit(1)
		}
	}()
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
