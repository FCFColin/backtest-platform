/**
 * @file 颜色阈值映射工具
 * @description 集中管理跨页面/组件重复的颜色映射算法：
 *   - `pickByThreshold`：离散阈值带（如 PCA 载荷矩阵发散色阶）
 *   - `pickByAbsThreshold`：基于绝对值的二值切换（如相关矩阵文字色）
 *   - `interpolateHsl`：连续 HSL 插值（如战术网格热力图红→黄→绿）
 */
export interface ThresholdBand<T = string> {
  /** 阈值；非负用 >= 比较，负用 > 比较，保证 0 落入最负带（中性色） */
  threshold: number;
  /** 命中时返回的值 */
  value: T;
}

/**
 * 离散阈值带映射：按 bands 顺序匹配首个满足条件的带
 *
 * 比较规则与原 PCAPage.getLoadingColor 完全一致：
 * 非负阈值用 `value >= threshold`，负阈值用 `value > threshold`。
 * 该非对称设计保证 value=0 时落入最负带（通常为中性色）而非最正带。
 *
 * @param value - 待映射数值
 * @param bands - 阈值带数组（顺序即匹配优先级）
 * @param defaultValue - 全部不匹配时的回退值
 * @returns 命中带的 value 或 defaultValue
 */
export function pickByThreshold<T>(
  value: number,
  bands: ReadonlyArray<ThresholdBand<T>>,
  defaultValue: T,
): T {
  for (const band of bands) {
    const matches = band.threshold >= 0 ? value >= band.threshold : value > band.threshold;
    if (matches) return band.value;
  }
  return defaultValue;
}

/**
 * 基于绝对值的二值阈值映射
 *
 * 用于相关系数等"绝对值越大越需要高对比文字色"的场景。
 *
 * @param value - 待判断数值
 * @param threshold - 绝对值阈值
 * @param highValue - |value| > threshold 时返回
 * @param lowValue - |value| <= threshold 时返回
 */
export function pickByAbsThreshold<T>(
  value: number,
  threshold: number,
  highValue: T,
  lowValue: T,
): T {
  return Math.abs(value) > threshold ? highValue : lowValue;
}

export interface InterpolateHslOptions {
  /** 起始色相，默认 0（红） */
  hueStart?: number;
  /** 终止色相，默认 120（绿） */
  hueEnd?: number;
  /** 饱和度 %，默认 70 */
  saturation?: number;
  /** 亮度 %，默认 45 */
  lightness?: number;
  /** min === max 时的回退颜色，默认使用区间中点色相 */
  equalDefault?: string;
}

/**
 * 连续 HSL 颜色插值：将 [min, max] 区间线性映射到色相区间
 *
 * 用于战术网格热力图（红→黄→绿）等连续色阶场景。
 *
 * @param value - 待映射数值
 * @param min - 区间下界
 * @param max - 区间上界
 * @param options - 色相/饱和度/亮度等可选项
 * @returns HSL 颜色字符串
 */
export function interpolateHsl(
  value: number,
  min: number,
  max: number,
  options: InterpolateHslOptions = {},
): string {
  const { hueStart = 0, hueEnd = 120, saturation = 70, lightness = 45, equalDefault } = options;
  if (min === max) {
    return equalDefault ?? `hsl(${(hueStart + hueEnd) / 2}, ${saturation}%, ${lightness}%)`;
  }
  const normalized = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const hue = hueStart + normalized * (hueEnd - hueStart);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}
