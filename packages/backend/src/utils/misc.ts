
/**
 * 生成等差数值序列 [min, min+step, ..., max]（含末端，带浮点容差）。
 *
 * @param step - 步长；<=0 时视为退化，返回 [min]
 * @param decimals - 每个元素四舍五入的小数位数（默认 2）
 */
export function numericRange(min: number, max: number, step: number, decimals = 2): number[] {
  if (step <= 0 || min > max) return [min];
  // -Infinity min 或 Infinity max 会导致无限循环，抛出 RangeError
  if (min === -Infinity || max === Infinity) {
    throw new RangeError('numericRange: min cannot be -Infinity, max cannot be Infinity');
  }
  const factor = 10 ** decimals;
  const arr: number[] = [];
  // 1e-9 容差：避免浮点累加误差导致末端值被漏掉。
  for (let v = min; v <= max + 1e-9; v += step) {
    arr.push(Math.round(v * factor) / factor);
  }
  return arr;
}

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * 为一个 Promise 附加超时。超时则以 TimeoutError 拒绝。
 *
 * 注意：JS 单线程下 Promise.race 无法中断纯 CPU 计算，但本项目的计算路径包含
 * 大量 await（数据获取、分片让出），超时可在让出点生效，避免无限等待下游。
 * 对纯 CPU 密集任务，正确做法是异步队列（BullMQ，主路径），本工具仅护栏降级路径。
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} 超时（${ms}ms）`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 检查字符串是否为有效 UUID（v4 形态）。
 *
 * 仅做形态校验，不验证版本位与变体位；用于在进入数据库前做防御性过滤，
 * 真正的隔离与完整性保证由 Postgres RLS / 参数化查询提供。
 */
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * 日期校验工具
 *
 * Code Quality: 提取重复的日期校验逻辑为共享工具
 * 企业为何需要：日期校验逻辑散落各处时，修改校验规则需改多处，易遗漏
 * 权衡：集中管理可能过度抽象，但校验规则必须一致
 */

export function toDateStr(d: Date | string): string {
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return d.slice(0, 10);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 校验日期格式（YYYY-MM-DD），空字符串视为合法（表示"全部历史"） */
export function isValidDate(value: string): boolean {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
