/**
 * @file 全局宽度约束系统
 * @description 单一数据源：所有输入类型的推荐宽度和页面容器宽度。
 *   所有 `<Input>` 组件必须传入 `className={INPUT_WIDTHS.xxx}`，禁止裸 `<Input>`。
 *   参见 tmp.md P0-4 规范。
 */

/** 各类型输入框的推荐最大宽度 */
export const INPUT_WIDTHS = {
  /** Ticker 代码：VTI, BND */
  ticker: 'max-w-[200px]',
  /** 权重百分比：60, 40 */
  weight: 'max-w-[100px]',
  /** 百分比通用 */
  percent: 'max-w-[100px]',
  /** 金额：10000, 100000 */
  currency: 'max-w-[180px]',
  /** 日期：2010/01/01 */
  date: 'max-w-[180px]',
  /** 整数：12, 20, 500 */
  integer: 'max-w-[120px]',
  /** 比率：1, 5 */
  ratio: 'max-w-[120px]',
  /** 下拉选择 */
  select: 'max-w-[220px]',
  /** 长文本（罕见） */
  longText: 'max-w-[400px]',
} as const;

/** 页面级容器宽度 */
export const CONTAINER_WIDTHS = {
  /** 工具页主容器 */
  toolPage: 'max-w-[1440px] mx-auto px-6',
  /** 内容区（表单区） */
  contentSection: 'max-w-[1280px]',
  /** 窄表单 */
  narrowForm: 'max-w-[720px]',
} as const;
