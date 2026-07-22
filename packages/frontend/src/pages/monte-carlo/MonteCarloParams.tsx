import { Play, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ParamsPanel, ParamsSection } from '../../components/ParamsPanel.js';
import { PortfolioEditor } from '../../components/ParamsShared.js';
import { ParamRow, ParamCard, ActionBar } from '../../components/params/index.js';
import type { McState } from './monteCarloParamsUtils.js';
import type { PortfolioState, PortfolioMode } from './monteCarloTypes.js';

/** 构建优化目标选项（依赖 i18n，需在组件内调用） */
function buildGoalOptions(t: TFunction): { value: string; label: string }[] {
  return [
    { value: 'maxCagrPercentile', label: t('monteCarlo.params.goalMaxCagrPercentile') },
    { value: 'minMaxDrawdown', label: t('monteCarlo.params.goalMinMaxDrawdown') },
    { value: 'maxSharpe', label: t('monteCarlo.params.goalMaxSharpe') },
    { value: 'minVolatility', label: t('monteCarlo.params.goalMinVolatility') },
    { value: 'maxFinalValue', label: t('monteCarlo.params.goalMaxFinalValue') },
    { value: 'maxSuccessRate', label: t('monteCarlo.params.goalMaxSuccessRate') },
  ];
}

function PortfolioModeToggle({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { portfolioMode, setPortfolioMode } = s;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {t('monteCarlo.params.portfolioCount')}
      </span>
      <div
        style={{
          display: 'flex',
          gap: 0,
          borderRadius: 'var(--radius-control)',
          overflow: 'hidden',
          border: '1px solid var(--border-soft)',
        }}
      >
        {[1, 2].map((mode) => (
          <button
            key={mode}
            onClick={() => setPortfolioMode(mode as PortfolioMode)}
            style={{
              padding: '4px 14px',
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              borderLeft: mode === 2 ? '1px solid var(--border-soft)' : 'none',
              cursor: 'pointer',
              backgroundColor: portfolioMode === mode ? 'var(--brand)' : 'var(--bg-elevated)',
              color: portfolioMode === mode ? '#fff' : 'var(--text-body)',
              transition: 'all 0.15s',
            }}
          >
            {t('monteCarlo.params.portfolioModeN', { mode })}
          </button>
        ))}
      </div>
    </div>
  );
}

function PortfolioHeader({
  p,
  onUpdate,
}: {
  p: PortfolioState;
  onUpdate: (patch: Partial<PortfolioState>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="portfolio-card-header">
      <div className="portfolio-card-name-row">
        <input
          type="text"
          className="portfolio-name-input"
          style={{ flex: 1, width: 'auto' }}
          value={p.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
        />
        <select
          className="portfolio-rebalance-select"
          value={p.rebalanceFrequency}
          onChange={(e) => onUpdate({ rebalanceFrequency: e.target.value })}
        >
          <option value="yearly">{t('monteCarlo.params.rebalanceYearly')}</option>
          <option value="quarterly">{t('monteCarlo.params.rebalanceQuarterly')}</option>
          <option value="monthly">{t('monteCarlo.params.rebalanceMonthly')}</option>
          <option value="none">{t('monteCarlo.params.rebalanceNone')}</option>
        </select>
      </div>
    </div>
  );
}

function PortfolioConfigSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { portfolios, portfolioMode, ...ops } = s;
  const cardStyle = { width: '100%', maxWidth: 'none', minWidth: 0, display: 'block' } as const;
  return (
    <ParamsSection
      title={t('monteCarlo.params.portfolioConfigTitle')}
      info={t('monteCarlo.params.portfolioConfigInfo')}
    >
      <PortfolioModeToggle s={s} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <PortfolioEditor
          assets={portfolios[0].assets}
          totalWeight={ops.getTotalWeight(0)}
          onAdd={() => ops.addAsset(0)}
          onRemove={(aIdx) => ops.removeAsset(0, aIdx)}
          onUpdate={(aIdx, f, v) => ops.updateAsset(0, aIdx, f, v)}
          isComplete={ops.isComplete(0)}
          wrapInSection={false}
          cardStyle={cardStyle}
          header={
            <PortfolioHeader
              p={portfolios[0]}
              onUpdate={(patch) => ops.updatePortfolio(0, patch)}
            />
          }
        />
        {portfolioMode === 2 && (
          <PortfolioEditor
            assets={portfolios[1].assets}
            totalWeight={ops.getTotalWeight(1)}
            onAdd={() => ops.addAsset(1)}
            onRemove={(aIdx) => ops.removeAsset(1, aIdx)}
            onUpdate={(aIdx, f, v) => ops.updateAsset(1, aIdx, f, v)}
            isComplete={ops.isComplete(1)}
            wrapInSection={false}
            cardStyle={cardStyle}
            header={
              <PortfolioHeader
                p={portfolios[1]}
                onUpdate={(patch) => ops.updatePortfolio(1, patch)}
              />
            }
          />
        )}
      </div>
    </ParamsSection>
  );
}

function SimBasicFields({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <ParamRow>
      <ParamCard label={t('monteCarlo.params.startDate')}>
        <input
          type="date"
          className="param-input"
          value={s.startDate}
          onChange={(e) => s.setStartDate(e.target.value)}
        />
      </ParamCard>
      <ParamCard label={t('monteCarlo.params.endDate')}>
        <input
          type="date"
          className="param-input"
          value={s.endDate}
          onChange={(e) => s.setEndDate(e.target.value)}
        />
      </ParamCard>
      <ParamCard label={t('monteCarlo.params.simYears')}>
        <input
          type="number"
          className="param-input"
          value={s.numYears}
          onChange={(e) => s.setNumYears(Number(e.target.value))}
        />
      </ParamCard>
      <ParamCard label={t('monteCarlo.params.simCount')}>
        <input
          type="number"
          className="param-input"
          value={s.numSimulations}
          onChange={(e) => s.setNumSimulations(Number(e.target.value))}
        />
      </ParamCard>
    </ParamRow>
  );
}

function SimAdvancedFields({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <ParamRow>
      <ParamCard label={t('monteCarlo.params.startingValue')}>
        <div className="param-input-prefix-wrap">
          <span className="param-input-prefix">$</span>
          <input
            type="number"
            className="param-input param-input-with-prefix"
            value={s.startingValue}
            onChange={(e) => s.setStartingValue(Number(e.target.value))}
          />
        </div>
      </ParamCard>
      <ParamCard label={t('monteCarlo.params.minBlock')}>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.minBlock}
            onChange={(e) => s.setMinBlock(Number(e.target.value))}
          />
          <span className="param-input-suffix">{t('monteCarlo.params.yearSuffix')}</span>
        </div>
      </ParamCard>
      <ParamCard label={t('monteCarlo.params.maxBlock')}>
        <div className="param-input-suffix-wrap">
          <input
            type="number"
            className="param-input param-input-with-suffix"
            value={s.maxBlock}
            onChange={(e) => s.setMaxBlock(Number(e.target.value))}
          />
          <span className="param-input-suffix">{t('monteCarlo.params.yearSuffix')}</span>
        </div>
      </ParamCard>
      <ParamCard label={t('monteCarlo.params.randomSeed')}>
        <input
          type="number"
          className="param-input"
          value={s.randomSeed}
          onChange={(e) => s.setRandomSeed(e.target.value)}
          placeholder={t('monteCarlo.params.randomSeedPlaceholder')}
        />
      </ParamCard>
      <ParamCard label={t('monteCarlo.params.withReplacement')}>
        <label className="param-check">
          <input
            type="checkbox"
            checked={s.withReplacement}
            onChange={(e) => s.setWithReplacement(e.target.checked)}
          />
          <span>{t('monteCarlo.params.withReplacement')}</span>
        </label>
      </ParamCard>
    </ParamRow>
  );
}

function SimParamsSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <ParamsSection
      title={t('monteCarlo.params.simParamsTitle')}
      info={t('monteCarlo.params.simParamsInfo')}
    >
      <div className="param-section-content">
        <SimBasicFields s={s} />
        <SimAdvancedFields s={s} />
      </div>
    </ParamsSection>
  );
}

function BuildModeSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { simMode, setSimMode } = s;
  const modes = [
    {
      value: 'standard' as const,
      label: t('monteCarlo.params.standardMode'),
      desc: t('monteCarlo.params.standardModeDesc'),
    },
    {
      value: 'frontier' as const,
      label: t('monteCarlo.params.frontierMode'),
      desc: t('monteCarlo.params.frontierModeDesc'),
    },
  ];
  return (
    <ParamsSection
      title={t('monteCarlo.params.buildModeTitle')}
      info={t('monteCarlo.params.buildModeInfo')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {modes.map((opt) => (
          <label
            key={opt.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 13,
              color: 'var(--text-body)',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name="simMode"
              value={opt.value}
              checked={simMode === opt.value}
              onChange={() => setSimMode(opt.value)}
              style={{ cursor: 'pointer' }}
            />
            <span>{opt.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{opt.desc}</span>
          </label>
        ))}
      </div>
    </ParamsSection>
  );
}

function GoalSelector({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <ParamCard label={label}>
      <select className="param-input" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((g) => (
          <option key={g.value} value={g.value}>
            {g.label}
          </option>
        ))}
      </select>
    </ParamCard>
  );
}

function DualGoalSection({ s }: { s: McState }) {
  const { t } = useTranslation();
  const { goal1, setGoal1, goal2, setGoal2, goalWeight, setGoalWeight } = s;
  const goalOptions = buildGoalOptions(t);
  return (
    <ParamsSection
      title={t('monteCarlo.params.dualGoalTitle')}
      info={t('monteCarlo.params.dualGoalInfo')}
    >
      <ParamRow>
        <GoalSelector
          label={t('monteCarlo.params.goal1')}
          value={goal1}
          onChange={setGoal1}
          options={goalOptions}
        />
        <GoalSelector
          label={t('monteCarlo.params.goal2')}
          value={goal2}
          onChange={setGoal2}
          options={goalOptions}
        />
      </ParamRow>
      <ParamRow>
        <ParamCard label={t('monteCarlo.params.goal1Weight')} fullWidth>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {t('monteCarlo.params.goal1Weight')}
            </span>
            <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'var(--text-strong)' }}>
              {goalWeight}% : {100 - goalWeight}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={goalWeight}
            onChange={(e) => setGoalWeight(Number(e.target.value))}
            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--brand)' }}
          />
        </ParamCard>
      </ParamRow>
    </ParamsSection>
  );
}

function McParamsPanel({ s }: { s: McState }) {
  const { t } = useTranslation();
  return (
    <ParamsPanel>
      <PortfolioConfigSection s={s} />
      <SimParamsSection s={s} />
      <BuildModeSection s={s} />
      <DualGoalSection s={s} />
      <ActionBar>
        <button
          onClick={s.runSimulation}
          disabled={s.isLoading}
          className="btn-primary"
          style={{ width: '100%' }}
        >
          {s.isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {s.isLoading ? t('monteCarlo.params.simulating') : t('monteCarlo.params.startSim')}
        </button>
      </ActionBar>
    </ParamsPanel>
  );
}

export { McParamsPanel };
