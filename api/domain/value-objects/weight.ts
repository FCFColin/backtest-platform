// DDD: Weight Value Object — 百分比权重（0–100），与引擎 api/engine/portfolio.ts 语义一致
// T-30：统一权重语义。此前域层用分数(0–1)、引擎用百分比，导致双轨校验。
// 企业为何需要：单一真相源避免"域校验通过、引擎理解错误"的隐性 bug。

export class Weight {
  private constructor(public readonly value: number) {
    if (value < 0 || value > 100) {
      throw new Error(`Weight must be between 0 and 100 (percent): ${value}`);
    }
  }

  /** @param value - 百分比权重，如 60 表示 60% */
  static create(value: number): Weight {
    return new Weight(value);
  }

  /** 转为引擎用小数权重 */
  toFraction(): number {
    return this.value / 100;
  }

  equals(other: Weight): boolean {
    return Math.abs(this.value - other.value) < 1e-6;
  }
}
