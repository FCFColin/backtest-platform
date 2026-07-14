/**
 * 可观测性配置片段。
 *
 * 收敛 OpenTelemetry OTLP 导出器端点配置，此前散落在 tracing.ts 中
 * 直接读取 process.env，统一通过 config 对象访问。
 */

/**
 * 可观测性配置片段（OTLP traces/metrics 导出端点）。
 */
export const observabilityConfig = {
  /**
   * OTLP traces 导出端点（Jaeger / Tempo / OTel Collector）。
   *
   * 企业理由：OTel 是 CNCF 毕业项目，多服务链路追踪的行业标准。
   * 未配置时使用 stdout exporter（零依赖），生产环境可指向 collector。
   * 末尾斜杠会在 tracing.ts 中被去除后按 OTLP 规范拼接 /v1/traces。
   * @default ""（未配置，traces 走 stdout）
   */
  OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || '',

  /**
   * OTLP metrics 独立导出端点。
   *
   * 企业理由：Jaeger 仅接收 traces，向其推送 OTLP metrics 会持续报错。
   * 仅当显式配置独立的 metrics 端点时才启用 OTLP 指标导出；
   * 否则继续使用 prom-client 拉取模型（/metrics 端点）。
   * @default ""（未配置，metrics 走 prom-client 拉取）
   */
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT || '',
};
