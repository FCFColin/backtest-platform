/**
 * @file 战术网格搜索参数面板
 * @description 信号网格 + 回测参数 + 目标函数。Field/Input/Select/Button 重排为 testfol.io 风格。
 */
import { useTranslation } from 'react-i18next';
import { Play, Loader2 } from 'lucide-react';
import type { RebalanceFrequency } from '@backtest/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Field, FieldLabel, FieldDescription } from '@/components/form/Field';
import { INDICATOR_OPTIONS, OBJECTIVE_OPTIONS, REBALANCE_OPTIONS } from './tacticalGridUtils';
import type { IndicatorType, ObjectiveType, GridParamRange } from './tacticalGridUtils';
import type { TacticalGridState } from '@/hooks/useTacticalGridState';

/** 参数分区：标题 + 内容，顶部细分隔 */
function ParamSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border-subtle pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 text-h3 text-fg">{title}</h3>
      {children}
    </section>
  );
}

/** 参数范围行：min / max / step 三列 */
function ParamRangeRow({
  range,
  onChange,
  inputMin,
}: {
  range: GridParamRange;
  onChange: (v: GridParamRange) => void;
  inputMin?: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-3 gap-2">
      <Field>
        <FieldLabel>{t('tacticalGrid.params.min')}</FieldLabel>
        <Input
          type="number"
          className="font-mono tabular-nums"
          value={range.min}
          min={inputMin}
          onChange={(e) => onChange({ ...range, min: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel>{t('tacticalGrid.params.max')}</FieldLabel>
        <Input
          type="number"
          className="font-mono tabular-nums"
          value={range.max}
          min={inputMin}
          onChange={(e) => onChange({ ...range, max: Number(e.target.value) })}
        />
      </Field>
      <Field>
        <FieldLabel>{t('tacticalGrid.params.step')}</FieldLabel>
        <Input
          type="number"
          className="font-mono tabular-nums"
          value={range.step}
          min={0.1}
          step={0.5}
          onChange={(e) => onChange({ ...range, step: Number(e.target.value) })}
        />
      </Field>
    </div>
  );
}

/** 信号网格分区：指标 + p1 范围 + p2 范围 + 提示 */
function SignalGridSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { indicator, setIndicator, param1, setParam1, param2, setParam2, paramLabels } = state;
  return (
    <ParamSection title={t('tacticalGrid.params.signalGrid')}>
      <div className="flex flex-col gap-3">
        <Field>
          <FieldLabel>{t('tacticalGrid.params.indicator')}</FieldLabel>
          <Select value={indicator} onValueChange={(v) => setIndicator(v as IndicatorType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INDICATOR_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>{paramLabels.p1}</FieldLabel>
          <ParamRangeRow range={param1} onChange={setParam1} inputMin={1} />
        </Field>
        <Field>
          <FieldLabel>{paramLabels.p2}</FieldLabel>
          <ParamRangeRow range={param2} onChange={setParam2} />
        </Field>
        <FieldDescription>
          {indicator === 'rsi'
            ? t('tacticalGrid.params.rsiHint')
            : t('tacticalGrid.params.breakoutHint')}
        </FieldDescription>
      </div>
    </ParamSection>
  );
}

/** 回测参数分区：标的 + 日期 + 起始资金 + 调仓频率 */
function BacktestParamsSection({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const {
    ticker,
    setTicker,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    startingValue,
    setStartingValue,
    rebalanceFrequency,
    setRebalanceFrequency,
  } = state;
  return (
    <ParamSection title={t('tacticalGrid.params.backtestParams')}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="grid-ticker">{t('tacticalGrid.params.ticker')}</FieldLabel>
          <Input
            id="grid-ticker"
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder={t('tacticalGrid.params.tickerPlaceholder')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="grid-start-date">{t('tacticalGrid.params.startDate')}</FieldLabel>
          <Input
            id="grid-start-date"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="grid-end-date">{t('tacticalGrid.params.endDate')}</FieldLabel>
          <Input
            id="grid-end-date"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="grid-starting-value">{t('tacticalGrid.params.startingValue')}</FieldLabel>
          <Input
            id="grid-starting-value"
            type="number"
            min={100}
            className="font-mono tabular-nums"
            value={startingValue}
            onChange={(e) => setStartingValue(Number(e.target.value))}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="grid-rebalance">{t('tacticalGrid.params.rebalanceFreq')}</FieldLabel>
          <Select
            value={rebalanceFrequency}
            onValueChange={(v) => setRebalanceFrequency(v as RebalanceFrequency)}
          >
            <SelectTrigger id="grid-rebalance">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REBALANCE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </ParamSection>
  );
}

/** 战术网格搜索参数面板入口 */
export function GridParamsPanel({ state }: { state: TacticalGridState }) {
  const { t } = useTranslation();
  const { objective, setObjective, isLoading, runSearch } = state;
  return (
    <div className="flex flex-col gap-4">
      <SignalGridSection state={state} />
      <BacktestParamsSection state={state} />
      <ParamSection title={t('tacticalGrid.params.objectiveSection')}>
        <Field>
          <FieldLabel>{t('tacticalGrid.params.objective')}</FieldLabel>
          <Select value={objective} onValueChange={(v) => setObjective(v as ObjectiveType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OBJECTIVE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {t(o.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </ParamSection>
      <Button variant="primary" onClick={runSearch} disabled={isLoading} className="w-full">
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
        {isLoading ? t('tacticalGrid.params.searching') : t('tacticalGrid.params.startSearch')}
      </Button>
    </div>
  );
}
