/**
 * @file 全局宽度约束系统
 * @description 单一数据源：所有输入类型的推荐宽度和页面容器宽度。
 *   所有 `<Input>` 组件必须传入 `className={INPUT_WIDTHS.xxx}`，禁止裸 `<Input>`。
 *   参见 tmp.md P0-3 / P0-4 规范。
 */

/** 输入框宽度（按内容语义） */
export const INPUT_WIDTHS = {
  /** Ticker 代码：VTI, VXUS, BND */
  ticker: 'w-[220px]',
  /** 权重百分比：60, 40, 33.3 */
  weight: 'w-[100px]',
  /** 百分比通用：5%, 2.5% */
  percent: 'w-[100px]',
  /** 金额：10,000 */
  currency: 'w-[180px]',
  /** 长金额：1,000,000 */
  currencyLong: 'w-[220px]',
  /** 日期：2010/01/01 */
  date: 'w-[180px]',
  /** 整数：12, 20, 500 */
  integer: 'w-[120px]',
  /** 比率：1.0, 5.0 */
  ratio: 'w-[120px]',
  /** 下拉选择 */
  select: 'w-[220px]',
  /** 短下拉（USD, 每月） */
  selectShort: 'w-[140px]',
  /** 搜索框 */
  search: 'w-[320px]',
} as const;

/** 卡片对象宽度 */
export const CARD_WIDTHS = {
  /** Portfolio Card：320-460px 弹性 */
  portfolio: { min: 320, max: 460, ideal: 380 },
  /** Cashflow Card */
  cashflow: { min: 300, max: 400, ideal: 340 },
  /** 已保存配置 Card */
  saved: { min: 260, max: 340, ideal: 300 },
  /** 指标 KPI Card */
  metric: { min: 200, max: 260, ideal: 220 },
  /** Hero 能力 Card */
  hero: { min: 300, max: 400, ideal: 340 },
} as const;

/** 卡片对象 Grid Class（tailwind grid-cols-[...]） */
export const CARD_GRID_CLASSES = {
  /** Portfolio 卡片 Grid：auto-fill minmax(320px,1fr) */
  portfolio: 'grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4',
  /** Cashflow 卡片 Grid */
  cashflow: 'grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-4',
  /** 已保存配置 Grid */
  saved: 'grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3',
  /** 指标 KPI Grid */
  metric: 'grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3',
  /** Hero 三栏 Grid */
  hero: 'grid grid-cols-1 md:grid-cols-3 gap-6',
} as const;

/** 页面级容器 */
export const CONTAINER_WIDTHS = {
  /** 页面外框 */
  page: 'max-w-[1440px] mx-auto px-6',
  /** 内容区 */
  content: 'max-w-[1280px] mx-auto',
  /** 长文段落 */
  narrow: 'max-w-[860px] mx-auto',
  /** 表单 */
  form: 'max-w-[720px] mx-auto',
} as const;
