import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Portfolio } from '@backtest/shared';
import type { StorePortfolio, TFunc } from './shared.js';
import {
  FIELD_STYLE,
  LABEL_STYLE,
  GP_FORM_STYLE,
  GP_TITLE_STYLE,
  GP_CONFIG_STYLE,
  GP_CONFIG_TITLE_STYLE,
  FIELDS_ROW_STYLE,
} from './shared.js';

/** 带标签的表单字段容器 */
function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={FIELD_STYLE}>
      <label style={LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

/** 组合选择下拉框 */
function PortfolioSelect({
  value,
  onChange,
  portfolios,
  t,
}: {
  value: string;
  onChange: (value: string) => void;
  portfolios: StorePortfolio[];
  t: TFunc;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="portfolio-rebalance-select"
      style={{ width: '120px' }}
    >
      {portfolios.map((p, idx) => (
        <option key={p.id} value={p.id}>
          {p.name || `${t('portfolio.portfolio')} ${idx + 1}`}
        </option>
      ))}
    </select>
  );
}

/** Glidepath 目标权重编辑区 */
function GlidepathTargetWeights({
  portfolio,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  return (
    <>
      <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
        {t('portfolio.targetWeights')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
        {portfolio.assets.map((asset, ai) => {
          const w = portfolio.glidepathToWeights?.[ai];
          return (
            <div
              key={ai}
              style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '90px' }}
            >
              <label
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {asset.ticker || `${t('portfolio.asset')} ${ai + 1}`}
              </label>
              <div className="advanced-input-wrap" style={{ height: '28px' }}>
                <input
                  type="number"
                  value={w != null ? +(w * 100).toFixed(2) : ''}
                  min={0}
                  max={100}
                  step={1}
                  className="advanced-input"
                  style={{ height: '28px', fontSize: '12px' }}
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : Number(e.target.value) / 100;
                    const next = [
                      ...(portfolio.glidepathToWeights ?? portfolio.assets.map(() => 0)),
                    ];
                    next[ai] = v;
                    onUpdate(portfolio.id, { glidepathToWeights: next });
                  }}
                />
                <span className="advanced-suffix" style={{ fontSize: '11px' }}>
                  %
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Glidepath 创建表单 */
export function GlidepathForm({
  nonGlidepathPortfolios,
  onConfirm,
  onCancel,
}: {
  nonGlidepathPortfolios: StorePortfolio[];
  onConfirm: (name: string, from: string, to: string, years: number) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [gpName, setGpName] = useState('');
  const [gpFrom, setGpFrom] = useState('');
  const [gpTo, setGpTo] = useState('');
  const [gpYears, setGpYears] = useState(10);
  const canConfirm = gpFrom && gpTo && gpFrom !== gpTo;

  return (
    <div style={GP_FORM_STYLE}>
      <div style={GP_TITLE_STYLE}>{t('portfolio.newGlidepath')}</div>
      <div style={FIELDS_ROW_STYLE}>
        <FieldLabel label={t('portfolio.name')}>
          <input
            type="text"
            value={gpName}
            onChange={(e) => setGpName(e.target.value)}
            className="portfolio-name-input"
            style={{ width: '120px' }}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect
            value={gpFrom}
            onChange={setGpFrom}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect
            value={gpTo}
            onChange={setGpTo}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <input
            type="number"
            value={gpYears}
            onChange={(e) => setGpYears(Number(e.target.value) || 1)}
            min={1}
            max={50}
            className="offset-input"
            style={{ width: '60px' }}
          />
        </FieldLabel>
        <button
          className="portfolios-add-btn"
          style={{ fontSize: '12px' }}
          disabled={!canConfirm}
          onClick={() => canConfirm && onConfirm(gpName, gpFrom, gpTo, gpYears)}
        >
          {t('common.confirm')}
        </button>
        <button
          className="portfolios-add-btn portfolios-add-btn-secondary"
          style={{ fontSize: '12px' }}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
}

/** Glidepath 配置区（已存在的 glidepath 组合卡片内） */
export function GlidepathConfig({
  portfolio,
  nonGlidepathPortfolios,
  onUpdate,
}: {
  portfolio: StorePortfolio;
  nonGlidepathPortfolios: StorePortfolio[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();

  return (
    <div style={GP_CONFIG_STYLE}>
      <div style={GP_CONFIG_TITLE_STYLE}>{t('portfolio.glidepathConfig')}</div>
      <div style={FIELDS_ROW_STYLE}>
        <FieldLabel label={t('portfolio.sourcePortfolio')}>
          <PortfolioSelect
            value={portfolio.glidepathFrom ?? ''}
            onChange={(v) => onUpdate(portfolio.id, { glidepathFrom: v })}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.targetPortfolio')}>
          <PortfolioSelect
            value={portfolio.glidepathTo ?? ''}
            onChange={(v) => onUpdate(portfolio.id, { glidepathTo: v })}
            portfolios={nonGlidepathPortfolios}
            t={t}
          />
        </FieldLabel>
        <FieldLabel label={t('portfolio.transitionYears')}>
          <input
            type="number"
            value={portfolio.glidepathYears ?? 10}
            onChange={(e) =>
              onUpdate(portfolio.id, { glidepathYears: Number(e.target.value) || 1 })
            }
            min={1}
            max={50}
            className="offset-input"
            style={{ width: '60px' }}
          />
        </FieldLabel>
      </div>
      <GlidepathTargetWeights portfolio={portfolio} onUpdate={onUpdate} t={t} />
    </div>
  );
}
