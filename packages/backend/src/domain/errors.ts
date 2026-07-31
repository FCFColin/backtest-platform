/**
 * 领域层异常（纯领域语义，不含 HTTP 状态码）。
 *
 * 企业理由（ADR-013 DDD 分层）：domain 层不应依赖 utils/errors 的
 * ApplicationError / ValidationError（后者携带 HTTP 422 语义，属于
 * application 层关注点）。domain 层抛出纯领域异常，由 application 层
 * 翻译为 HTTP 错误，保持依赖方向 application → domain 单向。
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