import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ResultRowProps } from './types.js';
import { CHART_COLORS } from './types.js';
import { TOOLTIP_STYLE } from './utils.js';

export function ResultRow({ label, value, color }: ResultRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '6px 0',
        borderBottom: '1px solid var(--border-soft)',
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: color || 'var(--text-strong)' }}>
        {value}
      </span>
    </div>
  );
}

export function SWRChart({ data }: { data: Array<{ year: number; ratio: number }> }) {
  return (
    <div style={{ height: 160, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => v.toFixed(1)}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [v.toFixed(3), '资产比']}
          />
          <Area
            type="monotone"
            dataKey="ratio"
            stroke={CHART_COLORS[2]}
            fill={CHART_COLORS[2]}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TwoFundChart({ data }: { data: Array<{ wA: number; cagr: number; vol: number }> }) {
  return (
    <div style={{ height: 220, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis
            dataKey="vol"
            type="number"
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => v.toFixed(1) + '%'}
            label={{
              value: '波动率',
              position: 'insideBottom',
              offset: -4,
              fontSize: 11,
              fill: 'var(--text-muted)',
            }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
            tickFormatter={(v: number) => v.toFixed(1) + '%'}
            label={{
              value: 'CAGR',
              angle: -90,
              position: 'insideLeft',
              offset: 8,
              fontSize: 11,
              fill: 'var(--text-muted)',
            }}
          />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, name: string) => [
              v.toFixed(2) + '%',
              name === 'cagr' ? 'CAGR' : name,
            ]}
            labelFormatter={(l: number) => '波动率: ' + l.toFixed(2) + '%'}
          />
          <Line
            type="monotone"
            dataKey="cagr"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
