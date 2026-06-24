/**
 * @file 周转率与税务报告
 * @description 基于组合配置历史（allocationHistory）估算各组合的年化周转率，
 * 并按假设税率推算税务拖累。使用 SortableTable 展示，支持按列排序。
 */
import { useMemo, useState } from 'react';
import type { PortfolioResult } from '../../shared/types';
import { CHART_COLORS } from '../../shared/types';
import { SortableTable, type Column } from './SortableTable';

/** 周转率与税务报告 Props */
interface TurnoverTaxReportProps {
  portfolios: PortfolioResult[];
}

/** 单行周转率/税务数据 */
interface TurnoverRow {
  name: string;
  turnover: number | null; // 年化周转率（小数形式，如 0.35 表示 35%）
  taxDrag: number | null; // 年化税务拖累（小数形式）
  observations: number; // 配置历史采样点数
  years: number; // 覆盖年数
}

const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

/**
 * 由 allocationHistory 计算年化周转率。
 *
 * 周转率定义：每个相邻采样点间，权重变动绝对值之和的一半（单边），
 * 累加后按覆盖年数年化。
 *
 * @returns { turnover, observations, years }，无 allocationHistory 时 turnover 为 null
 */
function computeTurnover(
  allocationHistory: Array<{ date: string; weights: number[] }> | undefined,
): { turnover: number | null; observations: number; years: number } {
  if (!allocationHistory || allocationHistory.length < 2) {
    return { turnover: null, observations: allocationHistory?.length ?? 0, years: 0 };
  }
  let totalTurnover = 0;
  for (let i = 1; i < allocationHistory.length; i++) {
    const prev = allocationHistory[i - 1].weights;
    const cur = allocationHistory[i].weights;
    const n = Math.min(prev.length, cur.length);
    let sumAbs = 0;
    for (let j = 0; j < n; j++) {
      sumAbs += Math.abs(cur[j] - prev[j]);
    }
    totalTurnover += sumAbs / 2;
  }
  const startT = new Date(allocationHistory[0].date).getTime();
  const endT = new Date(allocationHistory[allocationHistory.length - 1].date).getTime();
  const years = (endT - startT) / MS_PER_YEAR;
  const annualized = years > 0 ? totalTurnover / years : 0;
  return { turnover: annualized, observations: allocationHistory.length, years };
}

function formatPct(v: number | null): string {
  if (v == null) return '\u2014';
  return `${(v * 100).toFixed(2)}%`;
}

export default function TurnoverTaxReport({ portfolios }: TurnoverTaxReportProps) {
  const [taxRate, setTaxRate] = useState(20); // 税率假设，默认 20%

  const rows: TurnoverRow[] = useMemo(() => {
    return portfolios.map((p) => {
      const { turnover, observations, years } = computeTurnover(p.allocationHistory);
      const taxDrag = turnover != null ? turnover * (taxRate / 100) : null;
      return { name: p.name, turnover, taxDrag, observations, years };
    });
  }, [portfolios, taxRate]);

  const hasAnyTurnover = rows.some((r) => r.turnover != null);

  const columns: Column<TurnoverRow>[] = [
    {
      key: 'name',
      label: '组合',
      render: (row) => {
        const idx = portfolios.findIndex((p) => p.name === row.name);
        const color = CHART_COLORS[idx % CHART_COLORS.length];
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            {row.name}
          </span>
        );
      },
    },
    {
      key: 'turnover',
      label: '年化周转率',
      render: (row) => (
        <span className="font-mono text-right block" style={{ color: 'var(--text-strong)' }}>
          {formatPct(row.turnover)}
        </span>
      ),
      sortValue: (row) => row.turnover ?? -1,
    },
    {
      key: 'taxDrag',
      label: '预估税务拖累/年',
      render: (row) => (
        <span className="font-mono text-right block" style={{ color: row.taxDrag != null ? 'var(--danger)' : 'var(--text-muted)' }}>
          {formatPct(row.taxDrag)}
        </span>
      ),
      sortValue: (row) => row.taxDrag ?? -1,
    },
    {
      key: 'observations',
      label: '配置采样点',
      render: (row) => (
        <span className="font-mono text-right block" style={{ color: 'var(--text-body)' }}>
          {row.observations}
        </span>
      ),
      sortValue: (row) => row.observations,
    },
    {
      key: 'years',
      label: '覆盖年数',
      render: (row) => (
        <span className="font-mono text-right block" style={{ color: 'var(--text-body)' }}>
          {row.years > 0 ? row.years.toFixed(1) : '\u2014'}
        </span>
      ),
      sortValue: (row) => row.years,
    },
  ];

  return (
    <div className="chart-card">
      <div className="chart-card-title">周转率与税务报告</div>
      <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
        年化周转率由组合配置历史（allocationHistory）的权重变动估算；税务拖累 = 年化周转率 × 税率假设。
      </div>

      {/* 税率假设输入 */}
      <div className="flex items-center gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <label className="param-label" style={{ marginBottom: 0 }}>税率假设</label>
        <div className="param-input-suffix-wrap" style={{ width: 120 }}>
          <input
            type="number"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value) || 0)}
            min={0}
            max={100}
            step={1}
            className="param-input param-input-with-suffix"
          />
          <span className="param-input-suffix">%</span>
        </div>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          （默认 20%，适用于长期资本利得/分红税率的简化假设）
        </span>
      </div>

      {hasAnyTurnover ? (
        <SortableTable
          columns={columns}
          data={rows}
          initialSortKey="turnover"
          initialSortDir="desc"
        />
      ) : (
        <div className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          暂无配置历史数据（allocationHistory），无法计算周转率。该数据通常由 Rust 引擎在启用调仓时生成。
        </div>
      )}
    </div>
  );
}
