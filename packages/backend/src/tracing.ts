import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

if (config.NODE_ENV === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

const otlpEndpoint = config.OTEL_EXPORTER_OTLP_ENDPOINT.replace(/\/+$/, '');
const traceExporter = otlpEndpoint
  ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
  : undefined;

const metricsEndpoint = config.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT.replace(/\/+$/, '');
const metricExporter = metricsEndpoint
  ? new OTLPMetricExporter({ url: `${metricsEndpoint}/v1/metrics` })
  : undefined;
const metricReader = metricExporter
  ? new PeriodicExportingMetricReader({ exporter: metricExporter, exportIntervalMillis: 30000 })
  : undefined;

// 健康/指标端点避免探活流量污染 trace（healthRoutes 挂载于 /api 前缀下，须与实际路径一致）
const IGNORE_INSTRUMENTED_PATHS = [
  '/api/metrics',
  '/api/health',
  '/api/ready',
  '/api/v1/debug/health',
];

const sdk = new NodeSDK({
  serviceName: 'backtest-platform-api',
  traceExporter,
  metricReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: true },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request: { url?: string }) =>
          IGNORE_INSTRUMENTED_PATHS.includes(new URL(request.url ?? '/').pathname),
      },
      '@opentelemetry/instrumentation-express': {
        ignoreLayers: [(name: string) => IGNORE_INSTRUMENTED_PATHS.includes(name)],
      },
    }),
  ],
});

// SDK 必须在任何可能产生 span 的模块（app.js/worker.js 等）求值前启动：
// 入口文件将 tracing 作为首个 import，ESM 按 import 声明顺序深度求值依赖，
// 因此此处模块级启动保证了 app.js 求值前 SDK 已就绪（此前由 initTracing() 显式调用，时机不可靠）。
try {
  sdk.start();
} catch (err) {
  logger.warn({ err }, 'OpenTelemetry 初始化失败，链路追踪不可用');
}

export async function shutdownTracing(): Promise<void> {
  try {
    await sdk.shutdown();
  } catch {
    /* swallow shutdown error */
  }
}
