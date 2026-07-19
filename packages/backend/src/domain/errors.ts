/**
 * 领域层异常（纯领域语义，不含 HTTP 状态码）。
 *
 * 企业理由（ADR-013 DDD 分层）：domain 层不应依赖 utils/errors 的
 * ApplicationError / ValidationError（后者携带 HTTP 422 语义，属于
 * application 层关注点）。domain 层抛出纯领域异常，由 application 层
 * 翻译为 HTTP 错误，保持依赖方向 application → domain 单向。
 */

/**
 * 领域验证错误。
 *
 * 由领域聚合根 / 值对象在校验失败时抛出（如权重和不为 100、ticker 非法）。
 * application 层捕获后翻译为 ValidationError（HTTP 422）。
 */
export class DomainValidationError extends Error {
  /** 校验失败的字段名（可选，用于定位） */
  readonly field?: string;
  /** 校验失败的字段值（可选，用于诊断） */
  readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message);
    this.name = 'DomainValidationError';
    this.field = field;
    this.value = value;
  }
}
