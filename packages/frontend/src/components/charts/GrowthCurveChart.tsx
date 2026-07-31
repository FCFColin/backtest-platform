import { CHART_COLORS } from '@backtest/shared';
import type { CompareResult } from '@/hooks/useLumpSumVsDCAState';
export function GrowthCurveChart({ results }: { results: CompareResult[] }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: 350 }}>
      <svg viewBox="0 0 800 350" style={{ width: '100%', height: '100%' }} preserveAspectRatio="none">
        {results.map((r, idx) => {
          if (!r.growthCurve || r.growthCurve.length < 2) return null;
          const allValues = results.flatMap((x) => x.growthCurve.map((p) => p.value));
          const minVal = Math.min(...allValues);
          const maxVal = Math.max(...allValues);
          const range = maxVal - minVal || 1;
          const points = r.growthCurve.map((p, i) => `${(i / (r.growthCurve.length - 1)) * 780 + 10},${340 - ((p.value - minVal) / range) * 320 - 10}`).join(' ');
          return <polyline key={r.label} points={points} fill="none" stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2} />;
        })}
      </svg>
      <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
        {results.map((r, idx) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <span className="inline-block w-3 h-1 rounded" style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }} />
            <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
