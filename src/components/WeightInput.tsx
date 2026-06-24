/**
 * @file 权重输入组件
 * @description 投资组合权重输入框，支持百分比输入及中间状态容错
 */
import { useState, useEffect } from 'react';

/** 权重输入框 Props */
interface WeightInputProps {
  value: number;
  onChange: (num: number) => void;
}

/**
 * 权重输入组件
 * - 用本地 state 管理原始字符串，允许空值、负号等中间输入状态
 * - 失焦时规范化：空值/无效值补0
 * - 外部 value 变更时同步到本地 state（仅当差异超过0.001时，避免输入中被打断）
 */
export default function WeightInput({ value, onChange }: WeightInputProps) {
  const [raw, setRaw] = useState(String(value));

  // 外部 value 变更时同步（避免输入中间状态被覆盖）
  useEffect(() => {
    const num = parseFloat(raw);
    // 只有当外部值和当前解析值差异较大时才同步
    if (isNaN(num) || Math.abs(num - value) > 0.001) {
      setRaw(String(value));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const newRaw = e.target.value;
        setRaw(newRaw);
        // 允许中间输入状态，不同步到 store
        if (newRaw === '' || newRaw === '-' || newRaw === '.' || newRaw === '-.') return;
        const num = parseFloat(newRaw);
        if (!isNaN(num)) {
          onChange(num);
        }
      }}
      onBlur={() => {
        const num = parseFloat(raw);
        const normalized = isNaN(num) ? 0 : num;
        onChange(normalized);
        setRaw(String(normalized));
      }}
      className="weight-input"
    />
  );
}
