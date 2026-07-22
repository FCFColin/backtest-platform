/**
 * @file 回测页面工具栏
 * @description 执行回测主按钮 + 保存/加载方案 + 分享链接入口；包含保存命名输入行与
 *              已加载方案列表面板两个内嵌子组件。
 */
import { useTranslation } from 'react-i18next';
import { Play, Loader2, FolderOpen, Trash2, X } from 'lucide-react';
import { useBacktestStore } from '@/store/backtestStore';
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
    <div style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
      <input
        type="text"
        value={configName}
        onChange={(e) => setConfigName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void handleSaveConfig();
        }}
        placeholder={t('backtest.configNamePlaceholder')}
        className="param-input"
        style={{ flex: 1 }}
        autoFocus
      />
      <button onClick={() => void handleSaveConfig()} className="toolbar-btn">
        {t('common.confirm')}
      </button>
      <button
        onClick={() => {
          setShowSaveInput(false);
          setConfigName('');
        }}
        className="row-remove-btn"
        title={t('common.cancel')}
      >
        <X className="w-4 h-4" />
      </button>
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
    <div
      style={{
        marginTop: '8px',
        maxHeight: '240px',
        overflowY: 'auto',
        border: '1px solid var(--border-soft)',
        borderRadius: 'var(--radius-control)',
        background: 'var(--bg-subtle)',
      }}
    >
      {savedConfigs.length === 0 ? (
        <div
          style={{
            padding: '12px',
            color: 'var(--text-muted)',
            fontSize: '12px',
            textAlign: 'center',
          }}
        >
          {t('backtest.noSavedSchemes')}
        </div>
      ) : (
        savedConfigs.map((config) => (
          <div
            key={config.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-soft)',
            }}
          >
            <button
              onClick={() => handleLoadConfig(config)}
              style={{
                flex: 1,
                textAlign: 'left',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-body)',
                fontSize: '13px',
                padding: 0,
              }}
            >
              <div style={{ fontWeight: 500 }}>{config.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {new Date(config.savedAt).toLocaleString('zh-CN')} · {config.portfolios.length}{' '}
                {t('backtest.portfoliosCount')}
              </div>
            </button>
            <button
              onClick={() => void handleDeleteConfig(config.id)}
              className="row-remove-btn"
              title={t('common.delete')}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

/**
 * 回测工具栏：执行回测主按钮 + 保存/加载/分享三个工具按钮 + 展开后的输入行/列表。
 */
export function BacktestToolbar(props: BacktestToolbarProps) {
  const { t } = useTranslation();
  const isLoading = useBacktestStore((s) => s.isLoading);
  return (
    <div className="action-bar">
      <button
        onClick={props.runBacktest}
        disabled={isLoading}
        className="btn btn-primary"
        data-testid="backtest-run"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
        {isLoading ? t('backtest.running') : t('backtest.runButton')}
      </button>
      <div className="toolbar-btn-group">
        <button onClick={() => void props.handleOpenLoadList()} className="btn btn-secondary">
          <FolderOpen className="w-3.5 h-3.5" /> {t('common.loadSavedBacktest')}
          <span className="chevron-down">▼</span>
        </button>
      </div>
      {props.showSaveInput && (
        <div className="bt-action-row-expanded">
          <SaveInputRow
            configName={props.configName}
            setConfigName={props.setConfigName}
            handleSaveConfig={props.handleSaveConfig}
            setShowSaveInput={props.setShowSaveInput}
            t={t}
          />
        </div>
      )}
      {props.showLoadList && (
        <div className="bt-action-row-expanded">
          <LoadListPanel
            savedConfigs={props.savedConfigs}
            handleLoadConfig={props.handleLoadConfig}
            handleDeleteConfig={props.handleDeleteConfig}
            t={t}
          />
        </div>
      )}
    </div>
  );
}
