// Package http 提供 HTTP 服务器与诊断端点的跨服务共享启动逻辑。
package http

import (
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"
)

// StartPprofServerIfEnabled 在后台 goroutine 启动 pprof 诊断服务器。
//
// 仅当环境变量 ENABLE_PPROF=true 时启动。PPROF_ADDR 为空时回退到 defaultAddr
// （如 "127.0.0.1:6060"）。
//
// Security (T-29): pprof 暴露堆/goroutine/CPU 等高敏诊断数据，默认仅绑定回环地址。
// 生产如需远程采集，应经由 sidecar/端口转发或在 PPROF_ADDR 前置鉴权代理，而非裸暴露。
func StartPprofServerIfEnabled(defaultAddr string) {
	if os.Getenv("ENABLE_PPROF") != "true" {
		return
	}
	addr := os.Getenv("PPROF_ADDR")
	if addr == "" {
		addr = defaultAddr
	}
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("/debug/pprof/", pprof.Index)
		mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
		mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
		mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
		mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
		slog.Info("pprof server starting", "addr", addr)
		if err := http.ListenAndServe(addr, mux); err != nil {
			slog.Error("pprof server failed", "error", err)
		}
	}()
}
