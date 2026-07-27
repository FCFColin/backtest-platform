/**
 * @file PortfolioCardV2 组件
 * @description 5 区结构：顶部彩色条 + Header（名称/调仓/拖累/总回报/偏差带） + 资产列表 + Footer（合计/深度分析）。
 *   支持深度分析下拉（单独回测/蒙特卡洛/有效前沿/因子回归）和 Glidepath 配置。
 */
import { useTranslation } from 'react-i18next';
import {
  ChevronDown,
  Copy,
  Download,
  Trash2,
  Play,
  BarChart3,
  Activity,
  Sigma,
} from 'lucide-react';
import type { Portfolio, RebalanceFrequency, RebalanceBands } from '@backtest/shared';
import { Card } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Switch } from '@/components/ui/switch.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu.js';
import { AssetWeightRow } from './AssetWeightRow.js';
import { GlidepathConfig } from './GlidepathComponents.js';
import { cn } from '@/lib/utils.js';
import type { StorePortfolio, TFunc } from './shared.js';

interface PortfolioCardV2Props {
  portfolio: StorePortfolio;
  index: number;
  color: string;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  nonGlidepathPortfolios: StorePortfolio[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onSave: (p: StorePortfolio) => void;
  onDeepAnalysis: (type: 'backtest' | 'mc' | 'ef' | 'fr') => void;
}

/**
 * 调仓配置控件：频率选择 + 偏移 + 阈值（仅 threshold 频率显示）。
 * @param props - portfolio/rebalanceOptions/onUpdate/t。
 */
function RebalanceControls({
  portfolio,
  rebalanceOptions,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  return (
    <>
      <Select
        value={portfolio.rebalanceFrequency}
        onValueChange={(v) =>
          onUpdate(portfolio.id, { rebalanceFrequency: v as RebalanceFrequency })
        }
      >
        <SelectTrigger className="h-8 w-[110px] shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {rebalanceOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="flex items-center gap-1 shrink-0">
        <Input
          type="number"
          value={portfolio.rebalanceOffset ?? 0}
          min={0}
          max={252}
          className="h-8 w-[70px] font-mono tabular-nums"
          title={t('portfolio.offsetTitle')}
          onChange={(e) =>
            onUpdate(portfolio.id, { rebalanceOffset: Number(e.target.value) || 0 })
          }
        />
        <span className="text-caption text-fg-tertiary shrink-0">{t('portfolio.offset')}</span>
      </div>
      {portfolio.rebalanceFrequency === 'threshold' && (
        <div className="flex items-center gap-1 shrink-0">
          <Input
            type="number"
            value={portfolio.rebalanceThreshold ?? 5}
            min={1}
            max={50}
            className="h-8 w-[70px] font-mono tabular-nums"
            onChange={(e) =>
              onUpdate(portfolio.id, { rebalanceThreshold: Number(e.target.value) })
            }
          />
          <span className="text-caption text-fg-tertiary shrink-0">%</span>
        </div>
      )}
    </>
  );
}

/**
 * 偏差带参数行，仅在启用偏差带时渲染。
 */
function RebalanceBandsRow({
  portfolio,
  onUpdate,
}: {
  portfolio: StorePortfolio;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
}) {
  const { t } = useTranslation();
  if (!portfolio.rebalanceBands?.enabled) return null;
  const bands = portfolio.rebalanceBands;
  return (
    <div className="flex flex-wrap items-end gap-3 mt-1">
      <div className="flex flex-col gap-0.5">
        <label className="text-caption text-fg-tertiary">{t('portfolio.absoluteDeviation')}</label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={bands.absoluteBand ?? 5}
            min={0.1}
            max={50}
            step={0.5}
            className="h-8 w-[80px] font-mono tabular-nums"
            title={t('portfolio.absoluteDeviationTitle')}
            onChange={(e) =>
              onUpdate(portfolio.id, {
                rebalanceBands: {
                  enabled: true,
                  absoluteBand: Number(e.target.value) || undefined,
                  relativeBand: bands.relativeBand,
                },
              })
            }
          />
          <span className="text-caption text-fg-tertiary shrink-0">%</span>
        </div>
      </div>
      <div className="flex flex-col gap-0.5">
        <label className="text-caption text-fg-tertiary">{t('portfolio.relativeDeviation')}</label>
        <div className="flex items-center gap-1">
          <Input
            type="number"
            value={bands.relativeBand ?? 20}
            min={1}
            max={100}
            step={1}
            className="h-8 w-[80px] font-mono tabular-nums"
            title={t('portfolio.relativeDeviationTitle')}
            onChange={(e) =>
              onUpdate(portfolio.id, {
                rebalanceBands: {
                  enabled: true,
                  absoluteBand: bands.absoluteBand,
                  relativeBand: Number(e.target.value) || undefined,
                },
              })
            }
          />
          <span className="text-caption text-fg-tertiary shrink-0">%</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Portfolio 卡片 V2：5 区结构。
 * @param props - portfolio/index/color/rebalanceOptions/nonGlidepathPortfolios/onUpdate/onDelete/onDuplicate/onSave/onDeepAnalysis。
 * @returns 卡片元素。
 */
export function PortfolioCardV2({
  portfolio,
  index,
  color,
  rebalanceOptions,
  nonGlidepathPortfolios,
  onUpdate,
  onDelete,
  onDuplicate,
  onSave,
  onDeepAnalysis,
}: PortfolioCardV2Props) {
  const { t } = useTranslation();
  const tw = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);
  const isComplete = Math.abs(tw - 100) <= 0.01;
  const isGp = portfolio.isGlidepath;

  const handleEqualize = () => {
    const n = portfolio.assets.length;
    if (n === 0) return;
    const each = 100 / n;
    onUpdate(portfolio.id, {
      assets: portfolio.assets.map((a) => ({ ...a, weight: Math.round(each * 10) / 10 })),
    });
  };

  const handleNormalize = () => {
    if (tw === 0) return;
    onUpdate(portfolio.id, {
      assets: portfolio.assets.map((a) => ({
        ...a,
        weight: Math.round((a.weight / tw) * 1000) / 10,
      })),
    });
  };

  return (
    <Card
      className={cn(
        'relative group p-3 pt-8',
        isGp && 'border-l-[3px] border-l-accent bg-input-bg/30',
      )}
      style={{ borderTop: `3px solid ${color}` }}
    >
      {/* Actions — hover 时显示 */}
      <div className="absolute top-2 right-2 flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 z-20">
        <Button
          variant="icon"
          size="icon"
          title={t('portfolio.copyPortfolio')}
          onClick={onDuplicate}
        >
          <Copy />
        </Button>
        <Button
          variant="icon"
          size="icon"
          title={t('portfolio.saveAsJson')}
          onClick={() => onSave(portfolio)}
        >
          <Download />
        </Button>
        <Button
          variant="destructive"
          size="icon"
          title={t('common.delete')}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>

      {/* Header — Glidepath 配置（仅 glidepath 组合） */}
      {isGp && (
        <div className="mb-2">
          <GlidepathConfig
            portfolio={portfolio}
            nonGlidepathPortfolios={nonGlidepathPortfolios}
            onUpdate={onUpdate}
          />
        </div>
      )}

      {/* Header — 名称 + 调仓频率 + 偏移 + 拖累 + 总回报 + 偏差带 */}
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        <Input
          type="text"
          value={portfolio.name || `${t('portfolio.portfolio')} ${index + 1}`}
          className="h-8 w-[140px] text-body"
          onChange={(e) => onUpdate(portfolio.id, { name: e.target.value })}
        />
        <RebalanceControls
          portfolio={portfolio}
          rebalanceOptions={rebalanceOptions}
          onUpdate={onUpdate}
          t={t}
        />
        <div className="flex flex-col gap-0.5 shrink-0">
          <label className="text-caption text-fg-tertiary">{t('portfolio.drag')}</label>
          <div className="flex items-center gap-1">
            <Input
              type="number"
              value={portfolio.drag ?? 0}
              min={0}
              max={10}
              step={0.1}
              className="h-8 w-[70px] font-mono tabular-nums"
              title={t('portfolio.dragTitle')}
              onChange={(e) =>
                onUpdate(portfolio.id, { drag: Number(e.target.value) || 0 })
              }
            />
            <span className="text-caption text-fg-tertiary shrink-0">%</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={portfolio.totalReturn ?? true}
            onCheckedChange={(v) => onUpdate(portfolio.id, { totalReturn: v })}
          />
          <span className="text-caption text-fg-secondary">{t('portfolio.totalReturn')}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Switch
            checked={portfolio.rebalanceBands?.enabled ?? false}
            onCheckedChange={(v) =>
              onUpdate(portfolio.id, {
                rebalanceBands: {
                  enabled: v,
                  absoluteBand: portfolio.rebalanceBands?.absoluteBand,
                  relativeBand: portfolio.rebalanceBands?.relativeBand,
                } as RebalanceBands,
              })
            }
          />
          <span className="text-caption text-fg-secondary">{t('portfolio.deviationBands')}</span>
        </div>
      </div>

      {/* 偏差带参数行 */}
      <RebalanceBandsRow portfolio={portfolio} onUpdate={onUpdate} />

      {/* 资产列表 */}
      <div className="flex flex-col gap-1.5">
        {portfolio.assets.map((asset, i) => (
          <AssetWeightRow
            key={i}
            asset={asset}
            onUpdate={(newAsset) => {
              const newAssets = [...portfolio.assets];
              newAssets[i] = newAsset;
              onUpdate(portfolio.id, { assets: newAssets });
            }}
            onDelete={() => {
              const newAssets = portfolio.assets.filter((_, idx) => idx !== i);
              onUpdate(portfolio.id, { assets: newAssets });
            }}
          />
        ))}
        <div className="flex items-center justify-between pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-caption text-fg-tertiary hover:text-fg -ml-2"
            onClick={() =>
              onUpdate(portfolio.id, {
                assets: [...portfolio.assets, { ticker: '', weight: 0 }],
              })
            }
          >
            + {t('portfolio.addAsset')}
          </Button>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="text-caption" onClick={handleEqualize}>
              {t('common.equalize')}
            </Button>
            <Button variant="ghost" size="sm" className="text-caption" onClick={handleNormalize}>
              {t('common.normalize')}
            </Button>
          </div>
        </div>
      </div>

      {/* Footer — 合计 + 深度分析 */}
      <div className="flex items-center justify-between pt-2 mt-2 border-t border-border-subtle">
        <div className="flex items-center gap-2 text-caption">
          <span className="text-fg-tertiary uppercase tracking-wide">
            {t('portfolio.total')}
          </span>
          <span
            className={cn(
              'font-mono tabular-nums font-semibold',
              isComplete ? 'text-success' : 'text-warning',
            )}
          >
            {tw.toFixed(1)}%
          </span>
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              isComplete ? 'bg-success' : 'bg-warning',
            )}
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-caption h-7">
              {t('portfolio.deepAnalysis')} <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onDeepAnalysis('backtest')}>
              <Play className="h-4 w-4 mr-2" /> {t('portfolio.singleBacktest')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDeepAnalysis('mc')}>
              <Activity className="h-4 w-4 mr-2" /> {t('portfolio.monteCarlo')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDeepAnalysis('ef')}>
              <BarChart3 className="h-4 w-4 mr-2" /> {t('portfolio.efficientFrontier')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDeepAnalysis('fr')}>
              <Sigma className="h-4 w-4 mr-2" /> {t('portfolio.factorRegression')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </Card>
  );
}
