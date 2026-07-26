/**
 * @file 回测页面工具栏
 * @description 执行回测主按钮 + 保存/加载方案 + 分享链接入口；包含保存命名输入行与
 *   已加载方案列表面板两个内嵌子组件。基于 shadcn Button / Input + token 类名。
 */
import { useTranslation } from 'react-i18next';
import { Play, Loader2, FolderOpen, Trash2, X, ChevronDown } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SavedPortfolio } from '@/utils/portfolioStorage';
import type { BacktestToolbarProps } from './BacktestPage.types.js';

type TFunc = (k: string) => string;

function SaveInputRow({
  configName,
  setConfigName,
  handleSaveConfig,
  setShowSaveInput,
  t,
}: {
  configName: string;
  setConfigName: (v: string) => void;
  handleSaveConfig: () => Promise<void>;
  setShowSaveInput: (v: boolean) => void;
  t: TFunc;
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Input
        type="text"
        value={configName}
        onChange={(e) => setConfigName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSaveConfig();
        }}
        placeholder={t('backtest.configNamePlaceholder')}
        className="flex-1"
        autoFocus
      />
      <Button variant="secondary" size="sm" onClick={() => void handleSaveConfig()}>
        {t('common.confirm')}
      </Button>
      <Button
        variant="destructive"
        size="icon"
        onClick={() => {
          setShowSaveInput(false);
          setConfigName('');
        }}
        title={t('common.cancel')}
        aria-label={t('common.cancel')}
      >
        <X />
      </Button>
    </div>
  );
}

function LoadListPanel({
  savedConfigs,
  handleLoadConfig,
  handleDeleteConfig,
  t,
}: {
  savedConfigs: SavedPortfolio[];
  handleLoadConfig: (config: SavedPortfolio) => void;
  handleDeleteConfig: (id: string) => Promise<void>;
  t: TFunc;
}) {
  return (
    <div className="mt-2 max-h-[240px] overflow-y-auto rounded-md border border-border-subtle bg-elevated">
      {savedConfigs.length === 0 ? (
        <div className="px-3 py-3 text-center text-caption text-fg-tertiary">
          {t('backtest.noSavedSchemes')}
        </div>
      ) : (
        savedConfigs.map((config) => (
          <div
            key={config.id}
            className="flex items-center gap-1.5 px-2.5 py-2 border-b border-border-subtle last:border-b-0"
          >
            <button
              onClick={() => handleLoadConfig(config)}
              className="flex-1 text-left bg-transparent border-none cursor-pointer p-0"
            >
              <div className="text-body font-medium text-fg">{config.name}</div>
              <div className="text-caption text-fg-tertiary">
                {new Date(config.savedAt).toLocaleString('zh-CN')} · {config.portfolios.length}{' '}
                {t('backtest.portfoliosCount')}
              </div>
            </button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => void handleDeleteConfig(config.id)}
              title={t('common.delete')}
              aria-label={t('common.delete')}
            >
              <Trash2 />
            </Button>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * 回测工具栏：执行回测主按钮 + 保存/加载/分享三个工具按钮 + 展开后的输入行/列表。
 * @param props - BacktestToolbarProps
 * @returns 渲染的工具栏
 */
export function BacktestToolbar(props: BacktestToolbarProps) {
  const { t } = useTranslation();
  const isLoading = useBacktestStore((s) => s.isLoading);
  const portfolioCount = useBacktestStore((s) => s.portfolios.length);
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="primary"
          onClick={props.runBacktest}
          disabled={isLoading || portfolioCount === 0}
          data-testid="backtest-run"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <Play />}
          {isLoading ? t('backtest.running') : t('backtest.runButton')}
        </Button>
        <Button variant="secondary" onClick={() => void props.handleOpenLoadList()}>
          <FolderOpen />
          {t('common.loadSavedBacktest')}
          <ChevronDown className="size-3.5" />
        </Button>
      </div>
      {props.showSaveInput && (
        <SaveInputRow
          configName={props.configName}
          setConfigName={props.setConfigName}
          handleSaveConfig={props.handleSaveConfig}
          setShowSaveInput={props.setShowSaveInput}
          t={t}
        />
      )}
      {props.showLoadList && (
        <LoadListPanel
          savedConfigs={props.savedConfigs}
          handleLoadConfig={props.handleLoadConfig}
          handleDeleteConfig={props.handleDeleteConfig}
          t={t}
        />
      )}
    </div>
  );
}
