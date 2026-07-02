/**
 * Promise 超时保护工具（T-19）
 *
 * 企业为何需要：同步计算端点（优化器/网格搜索的 Redis 降级路径）若无超时，
 * 单个超大参数空间请求会长时间占用事件循环/连接，拖垮整个实例（队头阻塞）。
 * withTimeout 为这类调用设定上界，超时即快速失败（503），保护整体可用性。
 *
 * 注意：JS 单线程下 Promise.race 无法中断纯 CPU 计算，但本项目的计算路径包含
 * 大量 await（数据获取、分片让出），超时可在让出点生效，避免无限等待下游。
 * 对纯 CPU 密集任务，正确做法是异步队列（BullMQ，主路径），本工具仅护栏降级路径。
 */

/** 超时错误，便于调用方区分超时与业务错误。 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * 为一个 Promise 附加超时。超时则以 TimeoutError 拒绝。
 *
 * @param promise - 被保护的 Promise
 * @param ms - 超时毫秒数
 * @param label - 用于错误信息的标签
 * @returns 原 Promise 的结果；超时则抛出 TimeoutError
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} 超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}
