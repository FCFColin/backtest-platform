/** @file Tiny presentational primitives for DataEngineDashboard */
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

/**
 * StatCard: 概览统计卡片，图标 + 标签 + 大号数值 + 辅助说明。
 * @param props - icon/label/value/sub。
 * @returns 渲染的统计卡片。
 */
export function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2 text-brand">
        {icon}
        <span className="text-caption font-semibold text-fg-tertiary">{label}</span>
      </div>
      <div className="font-mono text-h1 font-bold leading-tight tabular-nums text-fg">{value}</div>
      <div className="mt-1 text-caption text-fg-tertiary">{sub}</div>
    </Card>
  );
}

/**
 * ProgressBar: 覆盖率进度条，标签 + 当前/总数 + 品牌色填充条。
 * @param props - label/current/total。
 * @returns 渲染的进度条。
 */
export function ProgressBar({
  label,
  current,
  total,
}: {
  label: string;
  current: number;
  total: number;
}) {
  const pctVal = total > 0 ? (current / total) * 100 : 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-caption">
        <span className="text-fg-secondary">{label}</span>
        <span className="font-mono tabular-nums text-fg-tertiary">
          {(current ?? 0).toLocaleString()} / {(total ?? 0).toLocaleString()} ({pctVal.toFixed(1)}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded bg-input-bg">
        <div
          className="h-full rounded bg-brand transition-[width] duration-500"
          style={{ width: `${pctVal}%` }}
        />
      </div>
    </div>
  );
}
