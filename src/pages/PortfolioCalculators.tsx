import { useState, useMemo } from 'react';
import { PieChart } from 'lucide-react';
import {
  Field,
  ResultRow,
  CollapsibleCard,
  computeTwoFundFrontier,
  TwoFundChart,
} from './BaseCalculatorUI.js';

export function TwoFundPortfolioCalculator() {
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
    <CollapsibleCard icon={PieChart} title="两基金组合">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="资产A CAGR" value={cagrA} onChange={setCagrA} suffix="%" />
        <Field label="资产A 波动率" value={volA} onChange={setVolA} suffix="%" />
        <Field label="资产B CAGR" value={cagrB} onChange={setCagrB} suffix="%" />
        <Field label="资产B 波动率" value={volB} onChange={setVolB} suffix="%" />
      </div>
      <Field label="相关性" value={corr} onChange={setCorr} step={0.05} min={-1} max={1} />
      <div style={{ marginTop: 8 }}>
        <ResultRow
          label="最小方差组合 A权重"
          value={(minVarW * 100).toFixed(1) + '%'}
          color="var(--brand)"
        />
        <ResultRow label="最小方差 CAGR" value={minVarCagr.toFixed(2) + '%'} />
        <ResultRow label="最小方差波动率" value={minVarVol.toFixed(2) + '%'} />
      </div>
      <TwoFundChart data={frontier} />
    </CollapsibleCard>
  );
}
