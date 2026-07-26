import { useTranslation } from 'react-i18next';
import { Copy, Download, Trash2 } from 'lucide-react';
import type { RebalanceFrequency, RebalanceBands, Portfolio } from '@backtest/shared';
import type { StorePortfolio, TFunc, BatchUpdate, AssetPatch } from './shared.js';
import { PortfolioToolbarAndAssets } from './PortfolioAssets.js';
import { GlidepathConfig } from './GlidepathComponents.js';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * 卡片头部操作按钮组，hover 卡片时显示。
 * @param props - 组件属性
 * @param props.portfolio - 当前组合数据
 * @param props.onDuplicate - 复制组合回调
 * @param props.onRemove - 删除组合回调
 * @param props.onSave - 导出 JSON 回调
 * @param props.t - i18n 翻译函数
 * @returns 渲染的操作按钮组
 */
function PortfolioCardActions({
  portfolio,
  onDuplicate,
  onRemove,
  onSave,
  t,
}: {
  portfolio: StorePortfolio;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onSave: (p: StorePortfolio) => void;
  t: TFunc;
}) {
  return (
    <div className="absolute top-2 right-2 flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 z-20">
      <Button
        variant="icon"
        size="icon"
        title={t('portfolio.copyPortfolio')}
        onClick={() => onDuplicate(portfolio.id)}
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
        onClick={() => onRemove(portfolio.id)}
      >
        <Trash2 />
      </Button>
    </div>
  );
}

/**
 * 调仓配置控件：频率选择 + 偏移 + 阈值（仅 threshold 频率显示）。
 * @param props - 组件属性
 * @param props.portfolio - 当前组合数据
 * @param props.rebalanceOptions - 调仓频率可选项
 * @param props.onUpdate - 组合字段更新回调
 * @param props.t - i18n 翻译函数
 * @returns 渲染的调仓配置控件组
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
          onChange={(e) => onUpdate(portfolio.id, { rebalanceOffset: Number(e.target.value) || 0 })}
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
            onChange={(e) => onUpdate(portfolio.id, { rebalanceThreshold: Number(e.target.value) })}
          />
          <span className="text-caption text-fg-tertiary shrink-0">%</span>
        </div>
      )}
    </>
  );
}

/**
 * 卡片头部行（名称 + 调仓频率 + 偏移 + 拖累 + 总回报 + 偏差带）。
 * @param props - 组件属性
 * @param props.portfolio - 当前组合数据
 * @param props.idx - 组合在列表中的序号
 * @param props.rebalanceOptions - 调仓频率可选项
 * @param props.onUpdate - 组合字段更新回调
 * @param props.t - i18n 翻译函数
 * @returns 渲染的卡片头部行
 */
function PortfolioCardHeader({
  portfolio,
  idx,
  rebalanceOptions,
  onUpdate,
  t,
}: {
  portfolio: StorePortfolio;
  idx: number;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  t: TFunc;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
      <Input
        type="text"
        value={portfolio.name || `${t('portfolio.portfolio')} ${idx + 1}`}
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
            onChange={(e) => onUpdate(portfolio.id, { drag: Number(e.target.value) || 0 })}
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
  );
}

/**
 * Rebalance Bands 参数行，仅在启用偏差带时渲染。
 * @param props - 组件属性
 * @param props.portfolio - 当前组合数据
 * @param props.onUpdate - 组合字段更新回调
 * @returns 渲染的偏差带参数行，未启用时返回 null
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
 * 卡片底部：总权重标签与达标状态徽章。
 * @param props - 组件属性
 * @param props.tw - 当前总权重
 * @param props.isComplete - 权重是否达到 100%
 * @param props.t - i18n 翻译函数
 * @returns 渲染的卡片底部行
 */
function PortfolioCardFooter({ tw, isComplete, t }: { tw: number; isComplete: boolean; t: TFunc }) {
  return (
    <CardFooter className="p-0 pt-2 mt-2 justify-between border-t border-border-subtle">
      <span className="text-caption text-fg-tertiary uppercase tracking-wide">
        {t('portfolio.total')}
      </span>
      <Badge variant={isComplete ? 'success' : 'danger'} className="tabular-nums">
        {tw.toFixed(0)}%
      </Badge>
    </CardFooter>
  );
}

/**
 * 组合卡片（单个组合的完整编辑界面），以 shadcn Card 为容器。
 * @param props - 组件属性
 * @param props.portfolio - 当前组合数据
 * @param props.idx - 组合在列表中的序号
 * @param props.rebalanceOptions - 调仓频率可选项
 * @param props.nonGlidepathPortfolios - 非 glidepath 组合列表（供 glidepath 引用）
 * @param props.onDuplicate - 复制组合回调
 * @param props.onRemove - 删除组合回调
 * @param props.onSave - 导出 JSON 回调
 * @param props.onUpdate - 组合字段更新回调
 * @param props.onAddAsset - 新增资产回调
 * @param props.onRemoveAsset - 删除资产回调
 * @param props.onUpdateAsset - 更新资产行回调
 * @param props.onBatchUpdate - 批量更新权重回调
 * @returns 渲染的组合卡片
 */
export function PortfolioCard({
  portfolio,
  idx,
  rebalanceOptions,
  nonGlidepathPortfolios,
  onDuplicate,
  onRemove,
  onSave,
  onUpdate,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
  onBatchUpdate,
}: {
  portfolio: StorePortfolio;
  idx: number;
  rebalanceOptions: { value: RebalanceFrequency; label: string }[];
  nonGlidepathPortfolios: StorePortfolio[];
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onSave: (p: StorePortfolio) => void;
  onUpdate: (id: string, patch: Partial<Portfolio>) => void;
  onAddAsset: (id: string) => void;
  onRemoveAsset: (id: string, ticker: string) => void;
  onUpdateAsset: (portfolioId: string, assetIdx: number, patch: AssetPatch) => void;
  onBatchUpdate: BatchUpdate;
}) {
  const { t } = useTranslation();
  const tw = portfolio.assets.reduce((sum, a) => sum + a.weight, 0);
  const isComplete = Math.abs(tw - 100) <= 0.01;
  const isGp = portfolio.isGlidepath;

  return (
    <Card
      className={cn(
        'relative group p-3 pt-8',
        isGp && 'border-l-[3px] border-l-accent bg-input-bg/30',
      )}
    >
      <PortfolioCardActions
        portfolio={portfolio}
        onDuplicate={onDuplicate}
        onRemove={onRemove}
        onSave={onSave}
        t={t}
      />
      <CardHeader className="p-0 pb-2 space-y-0">
        {isGp && (
          <GlidepathConfig
            portfolio={portfolio}
            nonGlidepathPortfolios={nonGlidepathPortfolios}
            onUpdate={onUpdate}
          />
        )}
        <PortfolioCardHeader
          portfolio={portfolio}
          idx={idx}
          rebalanceOptions={rebalanceOptions}
          onUpdate={onUpdate}
          t={t}
        />
      </CardHeader>
      <CardContent className="p-0 pt-0">
        <RebalanceBandsRow portfolio={portfolio} onUpdate={onUpdate} />
        <PortfolioToolbarAndAssets
          portfolio={portfolio}
          tw={tw}
          onAddAsset={onAddAsset}
          onRemoveAsset={onRemoveAsset}
          onUpdateAsset={onUpdateAsset}
          onBatchUpdate={onBatchUpdate}
        />
      </CardContent>
      <PortfolioCardFooter tw={tw} isComplete={isComplete} t={t} />
    </Card>
  );
}
