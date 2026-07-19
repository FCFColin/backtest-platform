import { useState, useMemo } from 'react';
import { PieChart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Field, ResultRow, CollapsibleCard, TwoFundChart } from './BaseCalculatorUI.js';
import { computeTwoFundFrontier } from './baseCalculatorUtils.js';

export function TwoFundPortfolioCalculator() {
  const { t } = useTranslation();
  const [cagrA, setCagrA] = useState(8);
  const [volA, setVolA] = useState(15);
  const [cagrB, setCagrB] = useState(4);
  const [volB, setVolB] = useState(5);
  const [corr, setCorr] = useState(0.2);

  const { frontier, minVarW, minVarCagr, minVarVol } = useMemo(
    () => computeTwoFundFrontier(cagrA, volA, cagrB, volB, corr),
    [cagrA, volA, cagrB, volB, corr],
  );

  return (
    <CollapsibleCard icon={PieChart} title={t('calculators.portfolio.twoFundTitle')}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field
          label={t('calculators.portfolio.assetACagr')}
          value={cagrA}
          onChange={setCagrA}
          suffix="%"
        />
        <Field
          label={t('calculators.portfolio.assetAVol')}
          value={volA}
          onChange={setVolA}
          suffix="%"
        />
        <Field
          label={t('calculators.portfolio.assetBCagr')}
          value={cagrB}
          onChange={setCagrB}
          suffix="%"
        />
        <Field
          label={t('calculators.portfolio.assetBVol')}
          value={volB}
          onChange={setVolB}
          suffix="%"
        />
      </div>
      <Field
        label={t('calculators.portfolio.correlation')}
        value={corr}
        onChange={setCorr}
        step={0.05}
        min={-1}
        max={1}
      />
      <div style={{ marginTop: 8 }}>
        <ResultRow
          label={t('calculators.portfolio.minVarWeight')}
          value={(minVarW * 100).toFixed(1) + '%'}
          color="var(--brand)"
        />
        <ResultRow
          label={t('calculators.portfolio.minVarCagr')}
          value={minVarCagr.toFixed(2) + '%'}
        />
        <ResultRow
          label={t('calculators.portfolio.minVarVol')}
          value={minVarVol.toFixed(2) + '%'}
        />
      </div>
      <TwoFundChart data={frontier} />
    </CollapsibleCard>
  );
}
