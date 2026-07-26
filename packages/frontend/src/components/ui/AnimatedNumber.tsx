/**
 * @file AnimatedNumber 组件
 * @description P4-4: KPI 卡片数字变化时做 tween 动画。
 *   使用 requestAnimationFrame 实现平滑过渡。
 */
import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  /** 目标数值 */
  value: number;
  /** 小数位数 */
  decimals?: number;
  /** 动画持续时间 (ms) */
  duration?: number;
  /** 前缀（如 $） */
  prefix?: string;
  /** 后缀（如 %） */
  suffix?: string;
}

/** 缓动函数: ease-out-cubic */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * 数字动画组件：从当前值平滑过渡到目标值。
 * 仅用于 KPI 卡片，避免在大量数据点中使用。
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 600,
  prefix = '',
  suffix = '',
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number>(0);
  const startRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    const diff = to - from;

    if (Math.abs(diff) < 0.01) {
      setDisplayValue(to);
      fromRef.current = to;
      return;
    }

    startRef.current = 0;
    const animate = (timestamp: number) => {
      if (!startRef.current) startRef.current = timestamp;
      const progress = Math.min((timestamp - startRef.current) / duration, 1);
      const eased = easeOutCubic(progress);
      const current = from + diff * eased;

      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  return (
    <span className="tabular-nums">
      {prefix}
      {displayValue.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
