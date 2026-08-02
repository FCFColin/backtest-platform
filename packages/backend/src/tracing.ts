import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
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

const sdk = new NodeSDK({
  serviceName: 'backtest-platform-api',
  traceExporter,
  metricReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: true },
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request: { url?: string }) => {
          const url = request.url ?? '';
          return url === '/metrics' || url === '/health' || url === '/ready';
        },
      },
      '@opentelemetry/instrumentation-express': {
        ignoreLayers: [
          (name: string) => name === '/metrics' || name === '/health' || name === '/ready',
        ],
      },
    }),
    new PgInstrumentation({ enhancedDatabaseReporting: true }),
  ],
});

export function initTracing(): void {
  try {
    sdk.start();
  } catch (err) {
    logger.warn({ err }, 'OpenTelemetry 初始化失败，链路追踪不可用');
  }
}

export async function shutdownTracing(): Promise<void> {
  try {
    await sdk.shutdown();
  } catch {
    /* swallow shutdown error */
  }
}
