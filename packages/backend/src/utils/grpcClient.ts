/**
 * Go 引擎 gRPC 客户端 stub（P4-1 PoC）
 *
 * 这是 PoC 代码，不用于生产。展示 gRPC 客户端结构，
 * 实际使用需安装 @grpc/grpc-js 和 @grpc/proto-loader 依赖。
 *
 * 当前生产路径：engineClient.ts（HTTP JSON + opossum 熔断器）
 * 此文件仅作为 gRPC 迁移的参考实现。
 */

// NOTE: This file is a PoC stub. Uncomment after installing dependencies:
//   pnpm add @grpc/grpc-js @grpc/proto-loader
//   pnpm add -D @types/google-protobuf

/*
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'node:path';
import { config } from '../config/index.js';

const PROTO_PATH = join(
  process.cwd(),
  'engine-go',
  'internal',
  'server',
  'grpc',
  'backtest.proto',
);

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const backtestProto = grpc.loadPackageDefinition(packageDefinition)
  .backtest.v1 as unknown as {
    BacktestEngine: new (
      address: string,
      credentials: grpc.ChannelCredentials,
    ) => BacktestEngineClient;
  };

interface BacktestEngineClient {
  runBacktest(
    req: unknown,
    callback: (err: grpc.ServiceError | null, res: unknown) => void,
  ): void;
  runTacticalBacktest(
    req: unknown,
    callback: (err: grpc.ServiceError | null, res: unknown) => void,
  ): void;
  runMonteCarlo(
    req: unknown,
    callback: (err: grpc.ServiceError | null, res: unknown) => void,
  ): void;
  healthCheck(
    req: unknown,
    callback: (err: grpc.ServiceError | null, res: unknown) => void,
  ): void;
  close(): void;
}

const client = new backtestProto.BacktestEngine(
  config.GO_ENGINE_URL.replace('http://', '').replace(':5004', ':5005'),
  grpc.credentials.createInsecure(),
);

// Promisified wrapper for gRPC calls
function callGrpc<T>(
  method: (req: unknown, cb: (err: grpc.ServiceError | null, res: T) => void) => void,
  req: unknown,
): Promise<T> {
  return new Promise((resolve, reject) => {
    method(req, (err, res) => {
      if (err) reject(err);
      else resolve(res);
    });
  });
}

export async function callEngineGrpc<T>(
  method: string,
  req: unknown,
): Promise<T> {
  const methodMap: Record<string, (req: unknown, cb: (err: grpc.ServiceError | null, res: T) => void) => void> = {
    runBacktest: client.runBacktest.bind(client),
    runTacticalBacktest: client.runTacticalBacktest.bind(client),
    runMonteCarlo: client.runMonteCarlo.bind(client),
  };

  const fn = methodMap[method];
  if (!fn) throw new Error(`Unknown gRPC method: ${method}`);

  return callGrpc(fn, req);
}
*/
