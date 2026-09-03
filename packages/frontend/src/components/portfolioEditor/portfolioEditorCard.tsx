import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Asset, RebalanceFrequency, RebalanceBands } from '@backtest/shared';
import { BookOpen, ChevronDown, X, Share2, Tag, Copy, Download, Trash2 } from 'lucide-react';
import {
  Card,
  Button,
  Input,
  Badge,
  Switch,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/uiComponents';
import { cn } from '@/lib/utils';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore.js';
import { writeStateToURL } from '@/utils/portfolioStorage.js';
import { PRESET_PORTFOLIOS, findPresetPortfolio } from '@/store/presetPortfolios.js';
import { toAssetsWithIds } from '@/store/backtestHelpers.js';
import {
  GlidepathConfig,
  AssetWeightRow,
  NumField,
  RebalanceControls,
  RebalanceBandsRow,
} from './portfolioEditorFields.js';
import type { StorePortfolio, TFunc, PortfolioFieldProps } from './portfolioEditorFields.js';
export function PortfolioCard({
  portfolio,
  color,
  rebalanceOptions,
  nonGlidepathPortfolios,
  onUpdate,
  onDelete,
  onDuplicate,
  onSave,
}: PortfolioFieldProps & {
  color: string;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  nonGlidepathPortfolios: StorePortfolio[];
  onDelete: () => void;
  onDuplicate: () => void;
  onSave: (p: StorePortfolio) => void;
}) {
  const { t } = useTranslation(),
    tw = portfolio.assets.reduce((sum, a) => sum + a.weight, 0),
    isComplete = Math.abs(tw - 100) <= 0.01,
    isGp = portfolio.isGlidepath,
    setAssets = (assets: Asset[]) => onUpdate(portfolio.id, { assets }),
    n = portfolio.assets.length,
    base = Math.round((100 / (n || 1)) * 10) / 10;
  const equalize = () => {
    if (!n) return;
    setAssets(
      portfolio.assets.map((a, i) => ({
        ...a,
        weight: i === n - 1 ? Math.round((100 - base * (n - 1)) * 10) / 10 : base,
      })),
    );
  };
  const normalize = () => {
    if (!tw) return;
    setAssets(
      portfolio.assets.map((a) => ({ ...a, weight: Math.round((a.weight / tw) * 1000) / 10 })),
    );
  };
  return (
    <Card
      data-testid="portfolio-card"
      className={cn(
        'relative group p-3 pt-8',
        isGp && 'border-l-[3px] border-l-brand bg-input-bg/30',
      )}
      style={{ borderTop: `3px solid ${color}` }}
    >
      <div className="absolute top-2 right-2 flex justify-end gap-0.5 lg:opacity-0 transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 z-20">
        {[
          { icon: Copy, title: t('Copy Portfolio'), onClick: onDuplicate },
          { icon: Download, title: t('Save as JSON'), onClick: () => onSave(portfolio) },
          { icon: Trash2, title: t('Delete'), onClick: onDelete, destructive: true },
        ].map((b) => (
          <Button
            key={b.title}
            variant={b.destructive ? 'destructive' : 'icon'}
            size="icon"
            title={b.title}
            aria-label={b.title}
            onClick={b.onClick}
          >
            <b.icon />
          </Button>
        ))}
      </div>
      {isGp && (
        <GlidepathConfig
          portfolio={portfolio}
          nonGlidepathPortfolios={nonGlidepathPortfolios}
          onUpdate={onUpdate}
        />
      )}
      <PortfolioMetaEditor portfolio={portfolio} onUpdate={onUpdate} />
      <div data-testid="portfolio-header" className="flex items-center gap-1.5 mb-2 flex-wrap">
        <RebalanceControls
          portfolio={portfolio}
          rebalanceOptions={rebalanceOptions}
          onUpdate={onUpdate}
        />
        <NumField
          label={t('Drag')}
          value={portfolio.drag ?? 0}
          min={0}
          max={10}
          step={0.1}
          title={t('Annual drag percentage, e.g. 0.5 means an extra 0.5% deduction per year')}
          onChange={(v) => onUpdate(portfolio.id, { drag: v || 0 })}
        />
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={portfolio.rebalanceBands?.enabled ?? false}
            onCheckedChange={(v) =>
              onUpdate(portfolio.id, {
                rebalanceBands: { ...portfolio.rebalanceBands, enabled: v } as RebalanceBands,
              })
            }
            aria-label={t('Deviation Bands')}
          />
          <span className="text-caption text-fg-secondary">{t('Deviation Bands')}</span>
        </div>
      </div>
      <RebalanceBandsRow portfolio={portfolio} onUpdate={onUpdate} />
      <div data-testid="portfolio-assets" className="flex flex-col gap-1.5">
        {portfolio.assets.map((asset, i) => (
          <AssetWeightRow
            key={asset.id ?? `row-${i}`}
            asset={asset}
            onUpdate={(newAsset) =>
              setAssets(portfolio.assets.map((a, idx) => (idx === i ? newAsset : a)))
            }
            onDelete={() => setAssets(portfolio.assets.filter((_, idx) => idx !== i))}
          />
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-fg-tertiary hover:text-fg -ml-2"
            onClick={() =>
              setAssets([...portfolio.assets, ...toAssetsWithIds([{ ticker: '', weight: 0 }])])
            }
          >
            + {t('Add Asset')}
          </Button>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="text-caption" onClick={equalize}>
              {t('Equalize')}
            </Button>
            <Button variant="ghost" size="sm" className="text-caption" onClick={normalize}>
              {t('Normalize')}
            </Button>
          </div>
        </div>
      </div>
      <div
        data-testid="portfolio-footer"
        className="flex items-center justify-between pt-2 mt-2 border-t border-border-subtle"
      >
        <div className="flex items-center gap-2 text-caption">
          <span className="text-fg-tertiary uppercase tracking-wide">{t('Total')}</span>
          <span
            className={cn(
              'font-mono tabular-nums font-semibold',
              isComplete ? 'text-success' : 'text-warning',
            )}
            aria-live="polite"
          >
            {tw.toFixed(1)}%
          </span>
          <span
            className={cn('w-1.5 h-1.5 rounded-full', isComplete ? 'bg-success' : 'bg-warning')}
          />
        </div>
      </div>
      {!isComplete && (
        <p role="alert" className="mt-2 text-caption text-warning">
          {t('Weights must sum to 100%, got {{total}}%', { total: tw.toFixed(2) })}
        </p>
      )}
    </Card>
  );
}
const sharePortfolioState = (t: TFunc): void => {
  const url = writeStateToURL(useBacktestStore.getState().getShareableState());
  navigator.clipboard
    .writeText(url)
    .then(() => useToastStore.getState().addToast('success', t('Share link copied to clipboard')))
    .catch(() =>
      useToastStore
        .getState()
        .addToast('error', t('Share link generated (please copy from address bar manually)')),
    );
};
function TagsRow({
  tags,
  onAddTag,
  onRemoveTag,
  t,
}: {
  tags: string[];
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  t: TFunc;
}) {
  const [draft, setDraft] = useState('');
  const commit = () => {
    const v = draft.trim();
    if (v && !tags.includes(v)) onAddTag(v);
    setDraft('');
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="w-3 h-3 text-fg-tertiary shrink-0" />
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" size="sm" className="gap-0.5">
          {tag}
          <button
            type="button"
            className="ml-0.5 hover:text-destructive transition-colors"
            aria-label={t('Remove tag')}
            onClick={() => onRemoveTag(tag)}
          >
            <X className="w-2.5 h-2.5" />
          </button>
        </Badge>
      ))}
      <Input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={t('Add tag')}
        className="h-7 w-[120px] text-caption"
      />
    </div>
  );
}
function PresetMenu({ onLoadPreset, t }: { onLoadPreset: (presetId: string) => void; t: TFunc }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-caption">
          <BookOpen className="w-3.5 h-3.5" />
          {t('Load preset')}
          <ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {PRESET_PORTFOLIOS.map((preset) => (
          <DropdownMenuItem
            key={preset.id}
            onClick={() => onLoadPreset(preset.id)}
            className="flex flex-col items-start gap-0.5"
          >
            <span className="text-caption font-medium">{t(preset.nameKey)}</span>
            <span className="text-caption text-fg-tertiary">{t(preset.descriptionKey)}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
function PortfolioMetaEditor({ portfolio, onUpdate }: PortfolioFieldProps) {
  const { t } = useTranslation(),
    tags = useMemo(() => portfolio.tags ?? [], [portfolio.tags]),
    handleAddTag = useCallback(
      (tag: string) => {
        if (!tags.includes(tag)) onUpdate(portfolio.id, { tags: [...tags, tag] });
      },
      [portfolio.id, tags, onUpdate],
    ),
    handleRemoveTag = useCallback(
      (tag: string) => onUpdate(portfolio.id, { tags: tags.filter((x) => x !== tag) }),
      [portfolio.id, tags, onUpdate],
    );
  return (
    <div className="flex flex-col gap-1.5 mb-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Input
          type="text"
          value={portfolio.name}
          onChange={(e) => onUpdate(portfolio.id, { name: e.target.value })}
          placeholder={t('Name')}
          className="h-8 w-[160px] text-body"
          aria-label={t('Name')}
        />
        <PresetMenu
          onLoadPreset={(presetId) => {
            const preset = findPresetPortfolio(presetId);
            if (!preset) return;
            onUpdate(portfolio.id, {
              name: t(preset.nameKey),
              assets: toAssetsWithIds(preset.assets),
              tags: [...preset.tags],
            });
            useToastStore.getState().addToast('success', t('Preset loaded'));
          }}
          t={t}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-caption"
          onClick={() => sharePortfolioState(t)}
          title={t('Share Portfolio')}
        >
          <Share2 className="w-3.5 h-3.5" /> {t('Share')}
        </Button>
      </div>
      <TagsRow tags={tags} onAddTag={handleAddTag} onRemoveTag={handleRemoveTag} t={t} />
    </div>
  );
}
