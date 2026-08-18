import { MiniStatCard } from '@/components/cards';

export interface Metric {
  label: string;
  value: string;
  color?: string;
  className?: string;
}

export function MetricsGrid({
  metrics,
  columns = 4,
  variant = 'soft',
}: {
  metrics: Metric[];
  columns?: number;
  variant?: 'soft' | 'border';
}) {
  const grid =
    columns === 2
      ? 'grid-cols-2'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-2 sm:grid-cols-4';
  return (
    <div className={`grid gap-3 ${grid}`}>
      {metrics.map((m) => (
        <MiniStatCard key={m.label} variant={variant} {...m} />
      ))}
    </div>
  );
}
