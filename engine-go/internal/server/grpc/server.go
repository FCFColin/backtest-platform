// Package grpc provides a gRPC server skeleton for the BacktestEngine service (P4-1 PoC).
//
// This is a PROOF OF CONCEPT — it demonstrates the gRPC server structure but does
// not implement actual computation logic. The existing HTTP JSON endpoints in
// internal/server/ remain the production path until a migration decision is made.
//
// To generate Go code from the proto definition:
//   protoc --go_out=. --go-grpc_out=. --proto_path=. backtest.proto
//
// Dependencies:
//   go get google.golang.org/grpc
//   go get google.golang.org/protobuf
package grpc

// NOTE: This file is a skeleton. Uncomment and implement after running protoc.
//
// import (
// 	"context"
// 	"net"
// 	"time"
//
// 	"google.golang.org/grpc"
// 	"google.golang.org/grpc/health"
// 	healthpb "google.golang.org/grpc/health/grpc_health_v1"
// 	"google.golang.org/grpc/reflection"
// )
//
// // Server implements the BacktestEngine gRPC service.
// type Server struct {
// 	UnimplementedBacktestEngineServer
// 	startTime time.Time
// }
//
// // NewServer creates a new gRPC server instance.
// func NewServer() *Server {
// 	return &Server{startTime: time.Now()}
// }
//
// // RunBacktest handles portfolio backtest requests via gRPC.
// func (s *Server) RunBacktest(ctx context.Context, req *BacktestRequest) (*BacktestResponse, error) {
// 	// Delegate to existing HTTP handler logic or call internal/engine directly.
// 	// This is where the actual computation would go.
// 	return &BacktestResponse{}, nil
// }
//
// // RunTacticalBacktest handles tactical allocation backtest requests via gRPC.
// func (s *Server) RunTacticalBacktest(ctx context.Context, req *TacticalBacktestRequest) (*TacticalBacktestResponse, error) {
// 	return &TacticalBacktestResponse{}, nil
// }
//
// // RunMonteCarlo handles Monte Carlo simulation requests via gRPC.
// func (s *Server) RunMonteCarlo(ctx context.Context, req *MonteCarloRequest) (*MonteCarloResponse, error) {
// 	return &MonteCarloResponse{}, nil
// }
//
// // HealthCheck returns the service health status.
// func (s *Server) HealthCheck(ctx context.Context, _ *emptypb.Empty) (*HealthCheckResponse, error) {
// 	return &HealthCheckResponse{
// 		Status:  "ok",
// 		Version: "0.1.0",
// 		Uptime:  timestamppb.Now(),
// 	}, nil
// }
//
// // StartGRPCServer starts the gRPC server on the given port.
// // This is called alongside the existing gin HTTP server.
// func StartGRPCServer(port string) error {
// 	lis, err := net.Listen("tcp", ":"+port)
// 	if err != nil {
// 		return err
// 	}
//
// 	grpcServer := grpc.NewServer()
// 	RegisterBacktestEngineServer(grpcServer, NewServer())
//
// 	// Health check service (for K8s grpc-health-probe)
// 	hs := health.NewServer()
// 	hs.SetServingStatus("backtest.v1.BacktestEngine", healthpb.HealthCheckResponse_SERVING)
// 	healthpb.RegisterHealthServer(grpcServer, hs)
//
// 	// Reflection for debugging (grpcurl)
// 	reflection.Register(grpcServer)
//
// 	return grpcServer.Serve(lis)
// }
