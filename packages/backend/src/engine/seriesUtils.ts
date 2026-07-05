/**
 * 价格序列工具函数
 *
 * Code Quality: 提取重复的价格序列转换逻辑为共享工具
 * 企业为何需要：序列转换逻辑散落各路由时，修改转换规则需改多处，易遗漏
 * 权衡：集中管理可能过度抽象，但转换规则必须一致
 */

/** 将 {date: price} 转为按日期升序的 {date, price} 数组（过滤无效值和零/负值） */
export function toSortedSeries(
  data: Record<string, number> | undefined,
): Array<{ date: string; price: number }> {
  if (!data) return [];
  return Object.entries(data)
    .map(([date, price]) => ({ date, price }))
    .filter((p) => typeof p.price === 'number' && !isNaN(p.price) && p.price > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 将 {date: price} 转为按日期升序的 {date, price} 数组（仅过滤无效值） */
export function toPriceSeries(
  tickerData: Record<string, number> | undefined,
): Array<{ date: string; price: number }> {
  if (!tickerData) return [];
  return Object.entries(tickerData)
    .map(([date, price]) => ({ date, price }))
    .filter((p) => typeof p.price === 'number' && !isNaN(p.price))
    .sort((a, b) => a.date.localeCompare(b.date));
}
