/**
 * @file 动效常量
 * @description 全站统一引用的过渡和动画常量。
 *   prefers-reduced-motion 通过 index.css 全局处理。
 */

/** 过渡常量 */
export const TRANSITIONS = {
  default: 'transition-all duration-150 ease-out',
  fast: 'transition-all duration-100 ease-out',
  slow: 'transition-all duration-300 ease-out-quart',
  colors: 'transition-colors duration-150',
  transform: 'transition-transform duration-200 ease-out-quart',
} as const;

/** 动画常量 */
export const ANIMATIONS = {
  fadeIn: 'animate-in fade-in-0 duration-200',
  slideDown: 'animate-in slide-in-from-top-2 fade-in-0 duration-200',
  slideUp: 'animate-in slide-in-from-bottom-2 fade-in-0 duration-200',
  zoomIn: 'animate-in zoom-in-95 fade-in-0 duration-150',
} as const;
