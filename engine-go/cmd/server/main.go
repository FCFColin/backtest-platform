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
if port == "" { port = "5004" }
	shutdownObs, metricsHandler := observability.MustInit("engine-go")
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = shutdownObs(ctx)
	}()
	r := server.SetupRouter(metricsHandler)
	gosharedhttp.StartPprofServerIfEnabled("127.0.0.1:6061")
	slog.Info("Go引擎服务启动", "port", port, "version", "0.1.0")
srv := &http.Server{ Addr: ":" + port, Handler: r, ReadTimeout: 30 * time.Second, WriteTimeout: 120 * time.Second, ReadHeaderTimeout: 10 * time.Second }
	gosharedhttp.RunServer(srv, 30*time.Second)
}
