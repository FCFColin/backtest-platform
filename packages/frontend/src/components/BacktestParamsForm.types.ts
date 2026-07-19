/**
 * @file BacktestParamsForm 共享类型
 * @description 跨子组件复用的 Props 类型。从主文件抽出以避免循环依赖与重复定义。
 */
import type { TFunction } from 'i18next';

/**
 * 携带 i18n 翻译函数的组件 Props。
 * 用于无自身 useTranslation 的纯展示字段（由父级注入 t）。
 */
export interface TFunctionProp {
  /** i18n 翻译函数 */
  t: TFunction;
}
