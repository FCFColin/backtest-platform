import type { ReactNode } from 'react';
import { Card, CardHeader, CardContent } from '../ui/uiComponents.js';
type KpiColor = 'blue' | 'green' | 'purple' | 'orange' | 'red';
interface KpiCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  color?: KpiColor;
  subtitle?: string;
}
const COLOR_CLASSES: Record<KpiColor, string> = {
  blue: 'bg-brand/10 text-brand',
  green: 'bg-success/10 text-success',
  purple: 'bg-brand/15 text-brand',
  orange: 'bg-warning/10 text-warning',
  red: 'bg-danger/10 text-danger'
};
export function KpiCard({ label, value, icon, color = 'blue', subtitle }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 p-4 pb-2">
        {icon && <div className={`rounded-lg p-2 ${COLOR_CLASSES[color]}`}>{icon}</div>}
        <p className="text-caption uppercase tracking-wide text-fg-tertiary">{label}</p>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-display tabular-nums font-mono text-fg">{value}</p>
        {subtitle && <p className="mt-1 text-caption text-fg-tertiary">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}
