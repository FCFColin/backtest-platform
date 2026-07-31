import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import LoadingButton from '../../components/LoadingButton.js';
import { TickerTagInput } from '../../components/form/TickerTagInput.js';
import { Field, FieldLabel, FieldDescription } from '../../components/form/Field.js';
import { Input } from '@/components/ui/uiComponents';
import { buttonVariants } from '@/components/ui/uiComponents';
interface PCAParamsProps {
  tickers: string[];
  startDate: string;
  endDate: string;
  numComponents: number | '';
  isLoading: boolean;
  onAddTicker: () => void;
  onRemoveTicker: (idx: number) => void;
  onUpdateTicker: (idx: number, val: string) => void;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  onNumComponentsChange: (v: number | '') => void;
  onRun: () => void;
}
function PcaAssetSelection({ tickers, onAddTicker, onRemoveTicker, onUpdateTicker }: Pick<PCAParamsProps, 'tickers' | 'onAddTicker' | 'onRemoveTicker' | 'onUpdateTicker'>) {
  const { t } = useTranslation();
  const handleTagChange = (newTickers: string[]) => {
    const oldLen = tickers.length;
    if (newTickers.length > oldLen) {
      onAddTicker();
    } else if (newTickers.length < oldLen) {
      for (let i = 0; i < oldLen; i++) {
        if (!newTickers.includes(tickers[i])) {
          onRemoveTicker(i);
          break;
        }
      }
    } else {
      newTickers.forEach((tk, i) => {
        if (tk !== tickers[i]) onUpdateTicker(i, tk);
      });
    }
  };
  return (
    <Field>
      <FieldLabel>{t('pca.asset.section')}</FieldLabel>
      <TickerTagInput tickers={tickers} onChange={handleTagChange} minCount={2} placeholder={t('pca.asset.tickerPlaceholder')} />
      <FieldDescription>{t('pca.asset.sectionInfo')}</FieldDescription>
    </Field>
  );
}
export function PCAParamsPanel({ tickers, startDate, endDate, numComponents, isLoading, onAddTicker, onRemoveTicker, onUpdateTicker, onStartDateChange, onEndDateChange, onNumComponentsChange, onRun }: PCAParamsProps) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="col-span-full">
        <PcaAssetSelection tickers={tickers} onAddTicker={onAddTicker} onRemoveTicker={onRemoveTicker} onUpdateTicker={onUpdateTicker} />
      </div>
      <Field>
        <FieldLabel htmlFor="pca-start-date">{t('pca.dateRange.startDate')}</FieldLabel>
        <Input id="pca-start-date" type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="pca-end-date">{t('pca.dateRange.endDate')}</FieldLabel>
        <Input id="pca-end-date" type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
      </Field>
      <Field>
        <FieldLabel htmlFor="pca-num-components">{t('pca.params.numComponents')}</FieldLabel>
        <div className="relative">
          <Input id="pca-num-components" type="number" min={1} className="pr-12" value={numComponents} onChange={(e) => onNumComponentsChange(e.target.value === '' ? '' : Number(e.target.value))} placeholder={t('pca.params.numComponentsPlaceholder')} />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-caption text-fg-tertiary">{t('pca.params.numComponentsSuffix')}</span>
        </div>
        <FieldDescription>{t('pca.params.numComponentsHint')}</FieldDescription>
      </Field>
      <div className="col-span-full">
        <LoadingButton isLoading={isLoading} onClick={onRun} loadingText={t('pca.analyzing')} className={buttonVariants({ variant: 'primary', size: 'lg', className: 'w-full' })}>
          <Play className="w-4 h-4" />
          {t('pca.startAnalysis')}
        </LoadingButton>
      </div>
    </div>
  );
}
