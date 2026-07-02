import { describe, it, expect } from 'vitest';
import { shouldRebalance, getISOWeekNumber } from '../../../api/engine/rebalance.js';

// ===== shouldRebalance 频率覆盖 =====
describe('shouldRebalance - 频率覆盖', () => {
  it('none 频率始终返回 false', () => {
    expect(
      shouldRebalance({
        frequency: 'none',
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
      }),
    ).toBe(false);
    // 首日也返回 false
    expect(
      shouldRebalance({
        frequency: 'none',
        currentDate: '2020-01-02',
        prevDate: null,
      }),
    ).toBe(false);
  });

  it('daily 频率始终返回 true', () => {
    expect(
      shouldRebalance({
        frequency: 'daily',
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
      }),
    ).toBe(true);
    // 首日也返回 true
    expect(
      shouldRebalance({
        frequency: 'daily',
        currentDate: '2020-01-02',
        prevDate: null,
      }),
    ).toBe(true);
  });

  it('weekly 频率：跨周时返回 true，同周返回 false', () => {
    // 2020-01-06 是周一，2020-01-10 是周五 —— 同周
    expect(
      shouldRebalance({
        frequency: 'weekly',
        currentDate: '2020-01-10',
        prevDate: '2020-01-06',
      }),
    ).toBe(false);
    // 2020-01-13 是下周一 —— 跨周
    expect(
      shouldRebalance({
        frequency: 'weekly',
        currentDate: '2020-01-13',
        prevDate: '2020-01-10',
      }),
    ).toBe(true);
  });

  it('monthly 频率：跨月时返回 true，同月返回 false', () => {
    expect(
      shouldRebalance({
        frequency: 'monthly',
        currentDate: '2020-02-03',
        prevDate: '2020-01-31',
      }),
    ).toBe(true);
    expect(
      shouldRebalance({
        frequency: 'monthly',
        currentDate: '2020-01-31',
        prevDate: '2020-01-02',
      }),
    ).toBe(false);
  });

  it('quarterly 频率：跨季时返回 true，同季返回 false', () => {
    // Q1 → Q2
    expect(
      shouldRebalance({
        frequency: 'quarterly',
        currentDate: '2020-04-01',
        prevDate: '2020-03-31',
      }),
    ).toBe(true);
    // 同季内
    expect(
      shouldRebalance({
        frequency: 'quarterly',
        currentDate: '2020-03-31',
        prevDate: '2020-01-02',
      }),
    ).toBe(false);
  });

  it('annual 频率：跨年时返回 true，同年返回 false', () => {
    expect(
      shouldRebalance({
        frequency: 'annual',
        currentDate: '2021-01-04',
        prevDate: '2020-12-31',
      }),
    ).toBe(true);
    expect(
      shouldRebalance({
        frequency: 'annual',
        currentDate: '2020-12-31',
        prevDate: '2020-01-02',
      }),
    ).toBe(false);
  });

  it('threshold 频率：权重偏离超过阈值时返回 true', () => {
    // 目标权重 50%，实际权重 60%，相对偏差 = |0.6-0.5|/|0.5|*100 = 20%
    expect(
      shouldRebalance({
        frequency: 'threshold',
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
        holdings: [6000, 4000],
        weights: [0.5, 0.5],
        portfolioValue: 10000,
        threshold: 10,
      }),
    ).toBe(true);
    // 偏差 5%，阈值 10% —— 不触发
    expect(
      shouldRebalance({
        frequency: 'threshold',
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
        holdings: [5250, 4750],
        weights: [0.5, 0.5],
        portfolioValue: 10000,
        threshold: 10,
      }),
    ).toBe(false);
  });

  it('threshold 频率：阈值 <= 0 时返回 false', () => {
    expect(
      shouldRebalance({
        frequency: 'threshold',
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
        holdings: [9000, 1000],
        weights: [0.5, 0.5],
        portfolioValue: 10000,
        threshold: 0,
      }),
    ).toBe(false);
  });

  it('threshold 频率：缺少 holdings/weights/portfolioValue 时返回 false', () => {
    expect(
      shouldRebalance({
        frequency: 'threshold',
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
        threshold: 5,
      }),
    ).toBe(false);
  });

  it('threshold 频率：weights[j] === 0 时跳过该资产', () => {
    // 第二个资产权重为0，应跳过；第一个资产偏差 20% > 阈值 10%
    expect(
      shouldRebalance({
        frequency: 'threshold',
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
        holdings: [6000, 4000],
        weights: [0.5, 0],
        portfolioValue: 10000,
        threshold: 10,
      }),
    ).toBe(true);
  });
});

// ===== 边界条件 =====
describe('shouldRebalance - 边界条件', () => {
  it('首日（prevDate === null）非 none 频率返回 true', () => {
    expect(
      shouldRebalance({
        frequency: 'weekly',
        currentDate: '2020-01-02',
        prevDate: null,
      }),
    ).toBe(true);
    expect(
      shouldRebalance({
        frequency: 'monthly',
        currentDate: '2020-01-02',
        prevDate: null,
      }),
    ).toBe(true);
    expect(
      shouldRebalance({
        frequency: 'quarterly',
        currentDate: '2020-01-02',
        prevDate: null,
      }),
    ).toBe(true);
    expect(
      shouldRebalance({
        frequency: 'annual',
        currentDate: '2020-01-02',
        prevDate: null,
      }),
    ).toBe(true);
  });

  it('currentDate === prevDate（同日）时各频率均返回 false（daily 除外）', () => {
    // 同日比较：同月、同季、同年、同周 —— 均不触发
    expect(
      shouldRebalance({
        frequency: 'weekly',
        currentDate: '2020-06-15',
        prevDate: '2020-06-15',
      }),
    ).toBe(false);
    expect(
      shouldRebalance({
        frequency: 'monthly',
        currentDate: '2020-06-15',
        prevDate: '2020-06-15',
      }),
    ).toBe(false);
    expect(
      shouldRebalance({
        frequency: 'quarterly',
        currentDate: '2020-06-15',
        prevDate: '2020-06-15',
      }),
    ).toBe(false);
    expect(
      shouldRebalance({
        frequency: 'annual',
        currentDate: '2020-06-15',
        prevDate: '2020-06-15',
      }),
    ).toBe(false);
    // daily 始终返回 true
    expect(
      shouldRebalance({
        frequency: 'daily',
        currentDate: '2020-06-15',
        prevDate: '2020-06-15',
      }),
    ).toBe(true);
  });

  it('闰年 2月29日边界：Feb 29 → Mar 1 触发 monthly', () => {
    // 2020 是闰年，2月有29天
    expect(
      shouldRebalance({
        frequency: 'monthly',
        currentDate: '2020-03-02',
        prevDate: '2020-02-29',
      }),
    ).toBe(true);
    // Feb 28 → Feb 29 同月不触发
    expect(
      shouldRebalance({
        frequency: 'monthly',
        currentDate: '2020-02-29',
        prevDate: '2020-02-28',
      }),
    ).toBe(false);
  });

  it('闰年 2月29日边界：Feb 29 处于 Q1 内，不触发 quarterly', () => {
    expect(
      shouldRebalance({
        frequency: 'quarterly',
        currentDate: '2020-02-29',
        prevDate: '2020-02-28',
      }),
    ).toBe(false);
  });

  it('跨年边界：Dec 31 → Jan 1 触发 annual', () => {
    expect(
      shouldRebalance({
        frequency: 'annual',
        currentDate: '2021-01-04',
        prevDate: '2020-12-31',
      }),
    ).toBe(true);
    // monthly 也应触发（跨月+跨年）
    expect(
      shouldRebalance({
        frequency: 'monthly',
        currentDate: '2021-01-04',
        prevDate: '2020-12-31',
      }),
    ).toBe(true);
    // quarterly 也应触发（Q4 → Q1）
    expect(
      shouldRebalance({
        frequency: 'quarterly',
        currentDate: '2021-01-04',
        prevDate: '2020-12-31',
      }),
    ).toBe(true);
  });

  it('跨年边界：同年 12月内不触发 annual', () => {
    expect(
      shouldRebalance({
        frequency: 'annual',
        currentDate: '2020-12-31',
        prevDate: '2020-12-30',
      }),
    ).toBe(false);
  });

  it('未知频率返回 false', () => {
    expect(
      shouldRebalance({
        frequency: 'biennial' as never,
        currentDate: '2020-06-15',
        prevDate: '2020-06-14',
      }),
    ).toBe(false);
  });
});

// ===== getISOWeekNumber =====
describe('getISOWeekNumber', () => {
  it('2020-01-01 属于 ISO 第1周', () => {
    expect(getISOWeekNumber('2020-01-01')).toBe(1);
  });

  it('2020-12-31 属于 ISO 第53周（闰年）', () => {
    expect(getISOWeekNumber('2020-12-31')).toBe(53);
  });

  it('同周内日期返回相同周号', () => {
    // 2020-01-06(周一) ~ 2020-01-12(周日) 同属第2周
    expect(getISOWeekNumber('2020-01-06')).toBe(getISOWeekNumber('2020-01-12'));
  });

  it('跨周时周号不同', () => {
    // 2020-01-12(周日) → 2020-01-13(周一) 跨周
    expect(getISOWeekNumber('2020-01-13')).not.toBe(getISOWeekNumber('2020-01-12'));
  });
});
