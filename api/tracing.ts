/**
 * OpenTelemetry 链路追踪初始化
 *
 * 企业理由：OTel 是可观测性行业标准（CNCF 毕业项目），
 * 多服务链路追踪的基础。无 OTel 时，Node→Go 引擎/数据服务的调用链
 * 完全不可观测，只能靠时间戳人工拼凑。
 * 权衡：OTel SDK 增加约 5MB 依赖和微秒级开销，
 * 但换来完整的分布式追踪能力。
 *
 * 必须在所有其他 import 之前加载此模块，
 * 以确保 auto-instrumentation 能拦截所有 HTTP/Express 调用。
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { config } from './config/index.js';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';

// 开发环境启用 OTel 诊断日志
if (config.NODE_ENV === 'development') {
  diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);
}

/**
 * OTel Collector 端点配置
 *
 * 默认使用 stdout exporter（零依赖），生产环境可配置 OTLP exporter
 * 指向 Jaeger/Tempo/Grafana Alloy 等 collector。
 */
const otlpEndpoint = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '').replace(/\/+$/, '');

// OTLP HTTP/proto exporter 在显式传入 url 时不会自动追加信号路径，
// 因此这里按 OTLP 规范拼接 /v1/traces，保证与 Jaeger / OTel Collector / Tempo 兼容。
const traceExporter = otlpEndpoint
  ? new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` })
  : undefined;

// metrics 与 traces 解耦：Jaeger 仅接收 traces，向其推送 OTLP metrics 会持续报错。
// 仅当显式配置独立的 metrics 端点时才启用 OTLP 指标导出；否则继续使用 prom-client 拉取模型。
const metricsEndpoint = (process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || '').replace(/\/+$/, '');
const metricExporter = metricsEndpoint
  ? new OTLPMetricExporter({ url: `${metricsEndpoint}/v1/metrics` })
  : undefined;

const metricReader = metricExporter
  ? new PeriodicExportingMetricReader({
      exporter: metricExporter,
      exportIntervalMillis: 30000,
    })
  : undefined;

/**
 * NodeSDK 实例
 *
 * auto-instrumentations 自动为以下模块创建 span：
 * - http/https（HTTP 请求/响应）
 * - express（路由处理）
 * - fetch（Node 18+ 内置 fetch）
 * - net（TCP 连接）
 * - dns（DNS 查询）
 */
const sdk = new NodeSDK({
  serviceName: 'backtest-platform-api',
  traceExporter,
  metricReader,
  instrumentations: [
    getNodeAutoInstrumentations({
      // 禁用不需要的 instrumentation 减少开销
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-dns': { enabled: true },
    }),
    // 企业理由：DB 查询是回测关键路径（占 30-60% 耗时），无 DB span 无法定位慢查询根因。
    // PgInstrumentation 为 pg 模块的 pool.query/client.query 自动创建 span，
    // 包含 db.system=postgresql、db.statement=SQL 文本等语义字段。
    // enhancedDatabaseReporting 记录 SQL 文本和参数（参数化值，非原始值），
    // 便于在 Jaeger/Tempo 中直接看到执行的 SQL。
    // 权衡：enhancedDatabaseReporting 增加少量 span 属性开销，
    // 需配合采样策略避免高基数（如每个查询参数不同导致 span 基数爆炸）。
    new PgInstrumentation({
      enhancedDatabaseReporting: true,
    }),
  ],
});

/**
 * 初始化 OTel SDK
 *
 * 应在 server.ts 启动前调用，确保所有后续模块的
 * HTTP 调用都被自动追踪。
 */
export function initTracing(): void {
  try {
    sdk.start();
    // 优雅关闭：进程退出前 flush 所有 span
    process.on('SIGTERM', async () => {
      try {
        await sdk.shutdown();
      } catch {
        // shutdown 失败不影响进程退出
      }
      process.exit(0);
    });
  } catch (err) {
    // OTel 初始化失败不应阻止应用启动
    console.warn('[tracing] OpenTelemetry 初始化失败，链路追踪不可用:', err);
  }
}

export { sdk };
