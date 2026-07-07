import { Play, Loader2, Save, FolderOpen, Trash2, X, Share2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { SavedPortfolio } from '@/utils/portfolioStorage';

interface BacktestToolbarProps {
  isLoading: boolean;
  runBacktest: () => void;
  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  configName: string;
  setConfigName: (v: string) => void;
  handleSaveConfig: () => Promise<void>;
  showLoadList: boolean;
  handleOpenLoadList: () => Promise<void>;
  savedConfigs: SavedPortfolio[];
  handleLoadConfig: (config: SavedPortfolio) => void;
  handleDeleteConfig: (id: string) => Promise<void>;
  handleShareLink: () => Promise<void>;
}

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
  t: (k: string) => string;
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
  t: (k: string) => string;
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

export function BacktestToolbar(props: BacktestToolbarProps) {
  const { t } = useTranslation();
  return (
    <div className="bt-action-row">
      <button
        onClick={props.runBacktest}
        disabled={props.isLoading}
        className="main-action-btn"
        style={{ width: '100%' }}
        data-testid="backtest-run"
      >
        {props.isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Play className="w-4 h-4" />
        )}
        {props.isLoading ? t('backtest.running') : t('backtest.runButton')}
      </button>
      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
        <button
          onClick={() => props.setShowSaveInput(!props.showSaveInput)}
          className="toolbar-btn"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Save className="w-3.5 h-3.5" /> {t('backtest.savePortfolio')}
        </button>
        <button
          onClick={() => void props.handleOpenLoadList()}
          className="toolbar-btn"
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <FolderOpen className="w-3.5 h-3.5" /> {t('backtest.loadPortfolio')}
        </button>
        <button
          onClick={props.handleShareLink}
          className="toolbar-btn"
          title={t('backtest.shareLink')}
          style={{ justifyContent: 'center' }}
        >
          <Share2 className="w-3.5 h-3.5" />
        </button>
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
