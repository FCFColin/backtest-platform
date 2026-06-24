// DDD: Ticker Value Object — 不变性+校验+相等性
// 企业为何需要：Ticker是系统核心概念，散落各处的字符串校验导致不一致
// 权衡：VO增加一层封装，但校验逻辑集中后修改只需改一处

export class Ticker {
  private static readonly VALID_PATTERN = /^[A-Z0-9]{1,10}(\.[A-Z]{2})?$/;

  private constructor(public readonly value: string) {}

  static create(value: string): Ticker {
    const upper = value.toUpperCase().trim();
    if (!this.VALID_PATTERN.test(upper)) {
      throw new Error(`Invalid ticker: ${value}`);
    }
    return new Ticker(upper);
  }

  equals(other: Ticker): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
