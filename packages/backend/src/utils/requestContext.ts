/**
 * 请求上下文传播（AsyncLocalStorage + W3C Trace Context）
 *
 * 企业理由：分布式系统中，request_id 必须从请求入口贯穿到下游服务调用，
 * 才能将全链路日志关联起来。但 Express 的 req 对象无法穿透到非中间件代码
 * （如 callService、dataService 等工具函数），逐层传参会污染所有函数签名。
 * AsyncLocalStorage（ALS）是 Node.js 官方的上下文传播方案，可在异步调用链
 * 中隐式传递上下文，不侵入业务函数签名。Java 的 ThreadLocal、Go 的 context.Context
 * 解决的是同一问题。
 *
 * 权衡：ALS 有纳秒级开销，但避免了"每个函数加 requestId 参数"的签名污染，
 * 是企业级 Node 应用的标准做法。
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { propagation, context } from '@opentelemetry/api';

interface RequestContext {
  /** pino-http 生成的请求唯一 ID，用于跨服务日志关联 */
  requestId: string;
}

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * 获取当前异步上下文中的 request_id。
 *
 * 在请求处理链路内（经 app.ts 中间件 run 包裹）返回 request_id；
 * 在请求链路外（如启动脚本、定时任务）返回 undefined。
 */
export function getRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

/**
 * W3C Trace Context 传播工具（T-B4 跨服务 trace 关联）
 *
 * 企业理由：Node API 调用 Go 引擎/数据服务时须注入 traceparent，
 * 否则下游 span 无法挂载到同一 trace，Jaeger/Tempo 中链路断裂。
 * 权衡：依赖 OTel AsyncLocalStorage 上下文，无 active span 时返回空对象。
 */

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
