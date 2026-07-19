/**
 * @file 因子回归结果展示子组件
 * @description 承载回归结果表格、残差图、模拟数据提示
 */
import type React from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { fmtPct, fmtNum } from '@/utils/format';
import {
  TABLE_TH_CLASS,
  TABLE_TH_STYLE,
  TABLE_TD_CLASS,
  TABLE_TD_BORDER,
} from '../../components/tableStyles.js';
import { FACTOR_COLORS } from './factorRegressionUtils.js';
import type { FactorRegressionResult } from './factorRegressionUtils.js';

/** 回归结果表格行 */
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
      <td className={TABLE_TD_CLASS} style={{ color: 'var(--text-strong)', ...TABLE_TD_BORDER }}>
        <span
          className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
          style={{ backgroundColor: color }}
        />
        {label}
      </td>
      <td
        className={`${TABLE_TD_CLASS} font-medium text-right font-mono`}
        style={{ ...valueStyle, ...TABLE_TD_BORDER }}
      >
        {value}
      </td>
      <td
        className="text-[12px] py-2 px-3"
        style={{ color: 'var(--text-muted)', ...TABLE_TD_BORDER }}
      >
        {desc}
      </td>
    </tr>
  );
}

/** 回归残差图 */
function ResidualsChart({ residuals }: { residuals: number[] }) {
  const { t } = useTranslation();
  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('factorRegression.results.residuals')}
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
          {t('factorRegression.results.positiveResidual')}
        </span>
        <span>
          <span
            className="inline-block w-3 h-1 rounded mr-1"
            style={{ backgroundColor: 'var(--error)' }}
          />
          {t('factorRegression.results.negativeResidual')}
        </span>
      </div>
    </div>
  );
}

/** 模拟数据提示 */
function MockDataNotice() {
  const { t } = useTranslation();
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
      {t('factorRegression.results.mockNotice')}
    </div>
  );
}

/** 回归结果表头：抽出以避免触发 max-lines-per-function 规则 */
function RegressionTableHead({ t }: { t: TFunction }) {
  return (
    <thead>
      <tr style={{ backgroundColor: 'var(--bg-subtle)' }}>
        <th className={`${TABLE_TH_CLASS} text-left`} style={TABLE_TH_STYLE}>
          {t('factorRegression.results.coefficient')}
        </th>
        <th className={`${TABLE_TH_CLASS} text-right`} style={TABLE_TH_STYLE}>
          {t('factorRegression.results.estimate')}
        </th>
        <th className={`${TABLE_TH_CLASS} text-left`} style={TABLE_TH_STYLE}>
          {t('factorRegression.results.meaning')}
        </th>
      </tr>
    </thead>
  );
}

/** 回归结果表格（系数 + 估计值 + 含义，附残差图与模拟数据提示） */
function RegressionResultTable({
  result,
  selectedFactors,
}: {
  result: FactorRegressionResult;
  selectedFactors: string[];
}) {
  const { t } = useTranslation();
  return (
    <div className="bt-results-card card">
      <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text-strong)', marginBottom: 12 }}>
        {t('factorRegression.results.title')}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <RegressionTableHead t={t} />
          <tbody>
            <RegressionRow
              label="Alpha"
              color={FACTOR_COLORS.alpha}
              value={fmtPct(result.alpha)}
              valueStyle={{ color: result.alpha >= 0 ? 'var(--success)' : 'var(--error)' }}
              desc={t('factorRegression.results.alphaDesc')}
              bg="transparent"
            />
            <RegressionRow
              label="Beta (MKT-RF)"
              color={FACTOR_COLORS.beta}
              value={fmtNum(result.beta, 3)}
              valueStyle={{ color: 'var(--text-strong)' }}
              desc={t('factorRegression.results.betaDesc')}
              bg="var(--bg-subtle)"
            />
            {selectedFactors.includes('smb') && (
              <RegressionRow
                label="SMB"
                color={FACTOR_COLORS.smb}
                value={fmtNum(result.smb, 3)}
                valueStyle={{ color: 'var(--text-strong)' }}
                desc={t('factorRegression.results.smbDesc')}
                bg="transparent"
              />
            )}
            {selectedFactors.includes('hml') && (
              <RegressionRow
                label="HML"
                color={FACTOR_COLORS.hml}
                value={fmtNum(result.hml, 3)}
                valueStyle={{ color: 'var(--text-strong)' }}
                desc={t('factorRegression.results.hmlDesc')}
                bg="var(--bg-subtle)"
              />
            )}
            <RegressionRow
              label="R²"
              color="transparent"
              value={fmtNum(result.rSquared, 3)}
              valueStyle={{ color: 'var(--text-strong)' }}
              desc={t('factorRegression.results.rSquaredDesc')}
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

/** 因子回归结果面板（错误提示 + 回归结果表格） */
export function FactorRegressionResultsPanel({
  result,
  error,
  selectedFactors,
}: {
  result: FactorRegressionResult | null;
  error: string | null;
  selectedFactors: string[];
}) {
  const { t } = useTranslation();
  return (
    <>
      {error && (
        <div
          className="bt-results-card card"
          style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}
        >
          {t('factorRegression.analysisFailed')}: {error}
        </div>
      )}
      {result && <RegressionResultTable result={result} selectedFactors={selectedFactors} />}
    </>
  );
}
