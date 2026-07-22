// Package log 提供 slog 默认 logger 的跨服务共享初始化。
package log

import (
	"log/slog"
	"os"
)

// InitDefault 初始化 slog 默认 JSON logger，输出到 stdout，级别 Info。
//
// 企业理由：engine-go / data-fetcher / worker 三个入口共享相同的 logger 配置，
// 收口避免配置漂移（如某服务意外改为 TextHandler 导致日志解析失败）。
func InitDefault() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))
	slog.SetDefault(logger)
}
