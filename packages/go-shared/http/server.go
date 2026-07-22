package http

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// RunServer 启动 HTTP 服务器并阻塞直到收到 SIGINT/SIGTERM，然后优雅关闭。
//
// 服务器在 goroutine 中监听；主 goroutine 等待信号后调用 srv.Shutdown 并传入
// shutdownTimeout 超时。ListenAndServe 失败时记录错误并 os.Exit(1)。
//
// 企业理由：优雅关闭确保 OTel batch span 在进程退出前 flush 到 SaaS 后端，
// 避免丢失尾部 trace 数据。
func RunServer(srv *http.Server, shutdownTimeout time.Duration) {
	go func() {
		slog.Info("server starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server failed", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	slog.Info("shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("server forced to shutdown", "error", err)
	}
	slog.Info("server exited")
}
