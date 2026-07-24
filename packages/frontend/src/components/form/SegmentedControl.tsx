/**
 * @file 段控件（Segmented Control）组件
 * @description 用于在小范围互斥选项间切换，比按钮组更清晰地表达 tab 语义。
 */
import type { ReactNode } from 'react';

interface SegmentedControlProps<T extends string | number> {
  /** 选项列表 */
  options: { value: T; label: ReactNode }[];
  /** 当前选中值 */
  value: T;
  /** 选中回调 */
  onChange: (value: T) => void;
}

/**
 * 段控件。通过 `.mini-tabs` / `.mini-tab` CSS 类实现视觉风格。
 */
export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="mini-tabs">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className={`mini-tab ${value === opt.value ? 'active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
