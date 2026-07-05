import { CHART_COLORS } from '@backtest/shared/types';
import type { RegressionResultProps } from './types.js';
import { fmtPct, fmtNum } from './utils.js';

const TH_BASE = 'text-[12px] font-semibold py-2.5 px-3';
const TH_STYLE = { color: 'var(--text-muted)', borderBottom: '2px solid var(--border-soft)' };
const TD_BASE = 'text-[13px] py-2 px-3';
const TD_BORDER = { borderBottom: '1px solid var(--border-soft)' };

function ResidualsChart({ residuals }: { residuals: number[] }) {
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
        回归残差
      </div>
      <div style={{ position: 'relative', width: '100%', height: 200 }}>
        <svg
          viewBox="0 0 800 200"
          style={{ width: '100%', height: '100%' }}
          preserveAspectRatio="none"
        >
          <line
            x1="10"
            y1="100"
            x2="790"
            y2="100"
            stroke="var(--border-soft)"
            strokeWidth="1"
            strokeDasharray="4,4"
          />
          {residuals.map((r, i) => {
            const x = 10 + (i / (residuals.length - 1)) * 780;
            const barHeight = (Math.abs(r) / 0.04) * 90;
            const y = r >= 0 ? 100 - barHeight : 100;
            return (
              <rect
                key={i}
                x={x - 1}
                y={y}
                width={2}
                height={barHeight}
                fill={r >= 0 ? 'var(--success)' : 'var(--error)'}
                opacity={0.5}
              />
            );
          })}
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 4,
          justifyContent: 'center',
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        <span>
          <span
            className="inline-block w-3 h-1 rounded mr-1"
            style={{ backgroundColor: 'var(--success)' }}
          />
          正残差
        </span>
        <span>
          <span
            className="inline-block w-3 h-1 rounded mr-1"
            style={{ backgroundColor: 'var(--error)' }}
          />
          负残差
        </span>
      </div>
    </div>
  );
}

function RegressionRow({
  label,
  color,
  value,
  valueStyle,
  desc,
  bg,
}: {
  label: string;
  color: string;
  value: string;
  valueStyle: React.CSSProperties;
  desc: string;
  bg: string;
}) {
  return (
    <tr style={{ backgroundColor: bg }}>
      <td className={TD_BASE} style={{ color: 'var(--text-strong)', ...TD_BORDER }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: color }}
        />
        {label}
      </td>
      <td
        className={`${TD_BASE} font-medium text-right font-mono`}
        style={{ ...valueStyle, ...TD_BORDER }}
      >
        {value}
      </td>
      <td className="text-[12px] py-2 px-3" style={{ color: 'var(--text-muted)', ...TD_BORDER }}>
        {desc}
      </td>
    </tr>
  );
}

function MockDataNotice() {
  return (
    <div
      style={{
        marginTop: 16,
        padding: '8px 12px',
        backgroundColor: 'var(--bg-subtle)',
        borderRadius: 'var(--radius-control)',
        fontSize: 11,
        color: 'var(--text-muted)',
        fontStyle: 'italic',
      }}
    >
      因子数据来源于 Kenneth French 数据库（模拟数据）。完整版将接入实时 Fama-French 因子数据。
    </div>
  );
}

function RegressionResultTable({ result, selectedFactors }: RegressionResultProps) {
  return (
    <div className="bt-results-card card">
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
        Fama-French 三因子回归结果
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
              <th className={`${TH_BASE} text-left`} style={TH_STYLE}>
                系数
              </th>
              <th className={`${TH_BASE} text-right`} style={TH_STYLE}>
                估计值
              </th>
              <th className={`${TH_BASE} text-left`} style={TH_STYLE}>
                含义
              </th>
            </tr>
          </thead>
          <tbody>
            <RegressionRow
              label="Alpha"
              color={CHART_COLORS[0]}
              value={fmtPct(result.alpha)}
              valueStyle={{ color: result.alpha >= 0 ? 'var(--success)' : 'var(--error)' }}
              desc="组合超额收益（年化），正值表示跑赢因子模型预期"
              bg="transparent"
            />
            <RegressionRow
              label="Beta (MKT-RF)"
              color={CHART_COLORS[1]}
              value={fmtNum(result.beta)}
              valueStyle={{ color: 'var(--text-strong)' }}
              desc="市场敏感度，1.0 表示与市场同步波动"
              bg="var(--bg-subtle)"
            />
            {selectedFactors.includes('smb') && (
              <RegressionRow
                label="SMB"
                color={CHART_COLORS[2]}
                value={fmtNum(result.smb)}
                valueStyle={{ color: 'var(--text-strong)' }}
                desc="规模因子载荷，正值偏向小盘股"
                bg="transparent"
              />
            )}
            {selectedFactors.includes('hml') && (
              <RegressionRow
                label="HML"
                color={CHART_COLORS[3]}
                value={fmtNum(result.hml)}
                valueStyle={{ color: 'var(--text-strong)' }}
                desc="价值因子载荷，正值偏向价值股"
                bg="var(--bg-subtle)"
              />
            )}
            <RegressionRow
              label="R²"
              color="transparent"
              value={fmtNum(result.rSquared)}
              valueStyle={{ color: 'var(--text-strong)' }}
              desc="模型解释力，越接近1说明因子对收益的解释越充分"
              bg={selectedFactors.includes('hml') ? 'transparent' : 'var(--bg-subtle)'}
            />
          </tbody>
        </table>
      </div>
      {result.residuals.length > 0 && <ResidualsChart residuals={result.residuals} />}
      <MockDataNotice />
    </div>
  );
}

export default RegressionResultTable;
export { RegressionResultTable, ResidualsChart, RegressionRow, MockDataNotice };
