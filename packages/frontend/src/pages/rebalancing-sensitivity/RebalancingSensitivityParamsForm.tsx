import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import { REBALANCE_OPTIONS, type RebalancingState } from './rebalancingSensitivityUtils.js';
import { BasicParamsRow, PortfolioEditor } from '../../components/ParamsShared.js';
import { ParamRow, ParamCard, ActionBar } from '../../components/params/index.js';

function FreqSelector({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
        {t('rebalancingSensitivity.params.freqMulti')}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {REBALANCE_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 'var(--radius-control)',
              border: `1px solid ${s.selectedFreqs.includes(opt.value) ? opt.color : 'var(--border-soft)'}`,
              backgroundColor: s.selectedFreqs.includes(opt.value)
                ? `${opt.color}18`
                : 'transparent',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              color: s.selectedFreqs.includes(opt.value) ? opt.color : 'var(--text-muted)',
              transition: 'all .12s',
            }}
          >
            <input
              type="checkbox"
              checked={s.selectedFreqs.includes(opt.value)}
              onChange={() => s.toggleFreq(opt.value)}
              style={{ display: 'none' }}
            />
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: opt.color }}
            />
            {t(`rebalancingSensitivity.freq.${opt.value}`)}
          </label>
        ))}
      </div>
    </div>
  );
}

function RebalBandFields({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <ParamRow>
      <ParamCard label={t('rebalancingSensitivity.params.absoluteBand')}>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.absoluteBand}
            onChange={(e) => s.setAbsoluteBand(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={t('rebalancingSensitivity.params.bandPlaceholder')}
            min={0}
            max={50}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </ParamCard>
      <ParamCard label={t('rebalancingSensitivity.params.relativeBand')}>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.relativeBand}
            onChange={(e) => s.setRelativeBand(e.target.value === '' ? '' : Number(e.target.value))}
            placeholder={t('rebalancingSensitivity.params.bandPlaceholder')}
            min={0}
            max={100}
          />
          <span className="param-input-suffix">%</span>
        </div>
      </ParamCard>
    </ParamRow>
  );
}

export function RebalancingSensitivityParamsForm({ s }: { s: RebalancingState }) {
  const { t } = useTranslation();
  return (
    <>
      <div className="params-section">
        <div className="params-title">{t('rebalancingSensitivity.params.title')}</div>
        <BasicParamsRow
          startDate={s.startDate}
          endDate={s.endDate}
          startingValue={s.startingValue}
          baseCurrency={s.baseCurrency}
          adjustForInflation={s.adjustForInflation}
          onChange={(field, value) => {
            if (field === 'startDate') s.setStartDate(value as string);
            else if (field === 'endDate') s.setEndDate(value as string);
            else if (field === 'startingValue') s.setStartingValue(value as number);
            else if (field === 'baseCurrency') s.setBaseCurrency(value as 'usd' | 'cny');
            else if (field === 'adjustForInflation') s.setAdjustForInflation(value as boolean);
          }}
        />
        <div style={{ marginTop: 12 }}>
          <FreqSelector s={s} />
        </div>
        <RebalBandFields s={s} />
      </div>
      <PortfolioEditor
        assets={s.assets}
        totalWeight={s.totalWeight}
        onAdd={s.addAsset}
        onRemove={s.removeAsset}
        onUpdate={s.updateAsset}
      />
      <ActionBar>
        <button
          onClick={() => void s.runSensitivity()}
          disabled={s.isLoading}
          className="btn-primary"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isLoading
            ? t('rebalancingSensitivity.params.analyzing')
            : t('rebalancingSensitivity.params.startAnalysis')}
        </button>
      </ActionBar>
    </>
  );
}
