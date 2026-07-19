/**
 * @file 回测参数表单纯函数
 * @description 从 BacktestParamsForm 抽出的无副作用校验函数，便于单测与复用。
 */
import type { TFunction } from 'i18next';

/**
 * 校验日期字段变更是否合法。
 *
 * - 结束日期不得晚于今天
 * - 开始日期不得晚于结束日期
 * - 结束日期不得早于开始日期
 *
 * @param field - 当前变更的字段
 * @param value - 新值（YYYY-MM-DD），空串表示清空，直接放行
 * @param otherDate - 另一端日期（YYYY-MM-DD），可能为空
 * @param t - i18n 翻译函数，用于生成错误文案
 * @returns 校验失败时返回错误文案，通过时返回 null
 */
export function validateDateChange(
  field: 'startDate' | 'endDate',
  value: string,
  otherDate: string,
  t: TFunction,
): string | null {
  if (!value) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (field === 'endDate' && value > today) return t('params.endDateAfterToday');
  if (field === 'startDate' && otherDate && value > otherDate) return t('params.startDateAfterEnd');
  if (field === 'endDate' && otherDate && value < otherDate) return t('params.endDateBeforeStart');
  return null;
}
