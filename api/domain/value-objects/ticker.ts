// DDD: Ticker Value Object — 不变性+校验+相等性
// 企业为何需要：Ticker是系统核心概念，散落各处的字符串校验导致不一致
// 权衡：VO增加一层封装，但校验逻辑集中后修改只需改一处
//
// T-23 两层校验设计（**有意为之，勿盲目合并**——切斯特顿围栏）：
//  - 本 VO（DOMAIN_TICKER_PATTERN，严格）：领域有效性。代表"系统认可的规范 ticker 形态"
//    （如 510300.SS 两字母交易所后缀），拒绝下划线/连字符/超长，保证领域模型纯净。
//  - utils/tickerValidation.ts（TICKER_PATTERN，宽松）：安全净化层。其唯一职责是阻断
//    路径遍历与子进程注入（仅允许 [A-Z0-9._-]），需兼容数据层实际存在的 VTI.BOND 等历史代码。
// 两者目的不同（领域有效 vs 注入安全），不能简单合并；故各自保留，并在此显式交叉引用，
// 避免后人误把"宽松"当 bug 收紧、或把"严格"当 bug 放宽。VO 模式集中为单一导出常量。

/** 领域规范 ticker 正则：1-10 位字母数字主体 + 可选两字母交易所后缀。 */
export const DOMAIN_TICKER_PATTERN = /^[A-Z0-9]{1,10}(\.[A-Z]{2})?$/;

export class Ticker {
  private constructor(public readonly value: string) {}

  static create(value: string): Ticker {
    const upper = value.toUpperCase().trim();
    if (!DOMAIN_TICKER_PATTERN.test(upper)) {
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
