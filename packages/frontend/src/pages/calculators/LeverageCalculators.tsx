import { useState, useMemo } from 'react';
import { Layers, Target, Flame } from 'lucide-react';
import { Field, ResultRow, CollapsibleCard } from './BaseCalculatorUI.js';
import { formatPct } from './baseCalculatorUtils.js';

export function LeverageDecayCalculator() {
  const [baseVol, setBaseVol] = useState(18);
  const [leverage, setLeverage] = useState(3);
  const [years, setYears] = useState(10);

  const result = useMemo(() => {
    const sigma = baseVol / 100;
    const l = leverage;
    const volDrag = ((l * l - l) * sigma * sigma) / 2;
    const totalDecay = volDrag * years;
    const effectiveReturn = -totalDecay;
    return { volDrag, totalDecay, effectiveReturn };
  }, [baseVol, leverage, years]);

  return (
    <CollapsibleCard icon={Layers} title="杠杆 ETF 衰减估算">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Field label="标的年波动率" value={baseVol} onChange={setBaseVol} suffix="%" step={1} />
        <Field
          label="杠杆倍数"
          value={leverage}
          onChange={setLeverage}
          suffix="x"
          step={0.5}
          min={1}
        />
        <Field label="持有年数" value={years} onChange={setYears} suffix="年" step={1} min={1} />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="年波动率拖累" value={formatPct(result.volDrag)} color="var(--warning)" />
        <ResultRow
          label={`${years}年累计衰减`}
          value={formatPct(result.totalDecay)}
          color="var(--danger)"
        />
        <ResultRow
          label="等效收益损失"
          value={formatPct(result.effectiveReturn)}
          color="var(--danger)"
        />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        波动率拖累 = (L² - L) × σ² / 2。杠杆ETF在震荡市中因日再平衡产生衰减，长期持有需关注此效应。
      </div>
    </CollapsibleCard>
  );
}

export function LeverageETFCalculator() {
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [leverage, setLeverage] = useState(2);
  const [borrowSpread, setBorrowSpread] = useState(1);

  const result = useMemo(() => {
    const mu = baseCagr / 100;
    const sigma = baseVol / 100;
    const l = leverage;
    const rBorrow = borrowSpread / 100;
    const levCagr = l * mu - (l - 1) * rBorrow - ((l * l - l) * sigma * sigma) / 2;
    const levVol = l * sigma;
    return { levCagr, levVol };
  }, [baseCagr, baseVol, leverage, borrowSpread]);

  return (
    <CollapsibleCard icon={Layers} title="杠杆 ETF 规则估算">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="基础资产 CAGR" value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label="基础资产波动率" value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field
          label="杠杆倍数"
          value={leverage}
          onChange={setLeverage}
          suffix="x"
          step={0.5}
          min={1}
        />
        <Field label="借贷利差" value={borrowSpread} onChange={setBorrowSpread} suffix="%" />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="杠杆后 CAGR" value={formatPct(result.levCagr)} color="var(--brand)" />
        <ResultRow label="杠杆后波动率" value={formatPct(result.levVol)} color="var(--warning)" />
        <ResultRow
          label="杠杆后夏普 (假设Rf=0)"
          value={(result.levCagr / result.levVol).toFixed(3)}
        />
      </div>
    </CollapsibleCard>
  );
}

export function KellyLeverageCalculator() {
  const [baseCagr, setBaseCagr] = useState(8);
  const [baseVol, setBaseVol] = useState(15);
  const [riskFree, setRiskFree] = useState(4);

  const result = useMemo(() => {
    const mu = baseCagr / 100;
    const sigma = baseVol / 100;
    const rf = riskFree / 100;
    const kelly = (mu - rf) / (sigma * sigma);
    const halfKelly = kelly / 2;
    const optimalCagr = rf + kelly * (mu - rf) - (kelly * kelly * sigma * sigma) / 2;
    const halfKellyCagr = rf + halfKelly * (mu - rf) - (halfKelly * halfKelly * sigma * sigma) / 2;
    return { kelly, halfKelly, optimalCagr, halfKellyCagr };
  }, [baseCagr, baseVol, riskFree]);

  return (
    <CollapsibleCard icon={Target} title="最优日杠杆 (Kelly)">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 12px' }}>
        <Field label="基础资产 CAGR" value={baseCagr} onChange={setBaseCagr} suffix="%" />
        <Field label="波动率" value={baseVol} onChange={setBaseVol} suffix="%" />
        <Field label="无风险利率" value={riskFree} onChange={setRiskFree} suffix="%" />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow
          label="Kelly 最优杠杆"
          value={result.kelly.toFixed(3) + 'x'}
          color="var(--brand)"
        />
        <ResultRow
          label="半 Kelly 杠杆"
          value={result.halfKelly.toFixed(3) + 'x'}
          color="var(--support)"
        />
        <ResultRow label="Kelly 预期 CAGR" value={formatPct(result.optimalCagr)} />
        <ResultRow label="半 Kelly 预期 CAGR" value={formatPct(result.halfKellyCagr)} />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        Kelly 公式: f* = (μ - Rf) / σ² 。半 Kelly 通常更稳健，建议优先参考。
      </div>
    </CollapsibleCard>
  );
}

export function OptionLeverageCalculator() {
  const [spotPrice, setSpotPrice] = useState(100);
  const [strikePrice, setStrikePrice] = useState(105);
  const [optionPrice, setOptionPrice] = useState(5);
  const [contractMultiplier, setContractMultiplier] = useState(100);

  const result = useMemo(() => {
    if (optionPrice <= 0 || spotPrice <= 0)
      return { leverage: 0, delta: 0, intrinsic: 0, timeValue: 0 };
    const intrinsic = Math.max(spotPrice - strikePrice, 0);
    const timeValue = optionPrice - intrinsic;
    const approxDelta = Math.min(
      1,
      Math.max(
        0.01,
        (optionPrice / spotPrice) * (spotPrice / optionPrice > 1 ? 1 : spotPrice / optionPrice),
      ),
    );
    const leverageRatio = (approxDelta * spotPrice) / (optionPrice > 0 ? optionPrice : 1);
    return { leverage: leverageRatio, delta: approxDelta, intrinsic, timeValue };
  }, [spotPrice, strikePrice, optionPrice]);

  return (
    <CollapsibleCard icon={Flame} title="期权杠杆">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <Field label="标的价" value={spotPrice} onChange={setSpotPrice} step={1} />
        <Field label="行权价" value={strikePrice} onChange={setStrikePrice} step={1} />
        <Field label="期权价" value={optionPrice} onChange={setOptionPrice} step={0.5} />
        <Field
          label="合约乘数"
          value={contractMultiplier}
          onChange={setContractMultiplier}
          step={1}
        />
      </div>
      <div style={{ marginTop: 12 }}>
        <ResultRow label="杠杆倍数" value={result.leverage.toFixed(2) + 'x'} color="var(--brand)" />
        <ResultRow label="近似 Delta" value={result.delta.toFixed(4)} color="var(--support)" />
        <ResultRow label="内在价值" value={result.intrinsic.toFixed(2)} />
        <ResultRow label="时间价值" value={result.timeValue.toFixed(2)} />
      </div>
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'var(--bg-subtle)',
          borderRadius: 8,
          fontSize: 12,
          color: 'var(--text-muted)',
        }}
      >
        杠杆 = Δ × S / 期权费；Delta 采用简化近似估算。
      </div>
    </CollapsibleCard>
  );
}
