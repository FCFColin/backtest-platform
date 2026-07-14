import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { CHART_COLORS } from '@backtest/shared';
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_PROPS,
  AXIS_TICK_STYLE,
} from '../../components/charts/chartConstants.js';

const INFO_BOX_STYLE: React.CSSProperties = {
  marginTop: 10,
  padding: '8px 12px',
  background: 'var(--bg-subtle)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--text-muted)',
};

const COLLAPSIBLE_CARD_STYLE: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  borderRadius: 'var(--radius-card)',
  boxShadow: 'var(--shadow-card)',
  border: '1px solid var(--border-soft)',
  overflow: 'hidden',
};

const ICON_BOX_STYLE: React.CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 8,
  background: 'var(--brand-soft)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
};

const CARD_TITLE_STYLE: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: 'var(--text-strong)',
  margin: 0,
  flex: 1,
  textAlign: 'left',
};

interface FieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}

export function Field({ label, value, onChange, suffix = '', min, max, step = 0.1 }: FieldProps) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <input
          type="number"
          className="param-input"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          style={{
            flex: 1,
            height: 36,
            padding: '0 10px',
            borderRadius: 'var(--radius-control)',
            border: '1px solid var(--border-strong)',
            fontSize: 14,
            color: 'var(--text-body)',
            background: 'var(--bg-elevated)',
            width: '100%',
          }}
        />
        {suffix && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 20 }}>{suffix}</span>
        )}
      </div>
    </div>
  );
}

interface ResultRowProps {
  label: string;
  value: string | number;
  color?: string;
}

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

export function InfoBox({ children }: { children: React.ReactNode }) {
  return <div style={INFO_BOX_STYLE}>{children}</div>;
}

function CollapsibleCardHeader({
  icon: Icon,
  title,
  open,
  onToggle,
}: {
  icon: React.ElementType;
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        padding: '16px 20px',
        border: 'none',
        background: hovered ? 'var(--bg-subtle)' : 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: open ? '1px solid var(--border-soft)' : 'none',
        transition: 'background-color .12s',
      }}
    >
      <div style={ICON_BOX_STYLE}>
        <Icon className="w-4 h-4" style={{ color: 'var(--brand)' }} />
      </div>
      <h3 style={CARD_TITLE_STYLE}>{title}</h3>
      <ChevronDown
        className="w-4 h-4"
        style={{
          color: 'var(--text-muted)',
          transition: 'transform .2s',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          flexShrink: 0,
        }}
      />
    </button>
  );
}

export function CollapsibleCard({
  icon: Icon,
  title,
  defaultOpen = false,
  children,
}: {
  icon: React.ElementType;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={COLLAPSIBLE_CARD_STYLE}>
      <CollapsibleCardHeader
        icon={Icon}
        title={title}
        open={open}
        onToggle={() => setOpen(!open)}
      />
      {open && <div style={{ padding: '16px 20px' }}>{children}</div>}
    </div>
  );
}

export function TwoFundChart({ data }: { data: Array<{ wA: number; cagr: number; vol: number }> }) {
  return (
    <div style={{ height: 220, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--border-soft)" />
          <XAxis
            dataKey="vol"
            type="number"
            tick={AXIS_TICK_STYLE}
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
            tick={AXIS_TICK_STYLE}
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
            contentStyle={CHART_TOOLTIP_STYLE}
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

export function SWRChart({ data }: { data: Array<{ year: number; ratio: number }> }) {
  return (
    <div style={{ height: 160, marginTop: 12 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid {...CHART_GRID_PROPS} stroke="var(--border-soft)" />
          <XAxis dataKey="year" tick={AXIS_TICK_STYLE} />
          <YAxis tick={AXIS_TICK_STYLE} tickFormatter={(v: number) => v.toFixed(1)} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
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
