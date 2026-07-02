/**
 * W3C Trace Context 传播工具（T-B4 跨服务 trace 关联）
 *
 * 企业理由：Node API 调用 Go 引擎/数据服务时须注入 traceparent，
 * 否则下游 span 无法挂载到同一 trace，Jaeger/Tempo 中链路断裂。
 * 权衡：依赖 OTel AsyncLocalStorage 上下文，无 active span 时返回空对象。
 */

import { propagation, context } from '@opentelemetry/api';

/**
 * 从当前 OTel 上下文提取 W3C traceparent/tracestate 等传播头。
 *
 * @returns 可合并进 fetch headers 的对象
 */
export function getTracePropagationHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  propagation.inject(context.active(), headers);
  return headers;
}
