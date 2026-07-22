import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Mail } from 'lucide-react';
import type { EmailAlertConfig } from '@backtest/shared/types/tactical';
import LoadingButton from '../../components/LoadingButton.js';
import ChartCard from '../../components/ChartCard.js';
import { ParamCard } from '../../components/params/index.js';
import { useAsyncAction } from '../../hooks/useAsyncAction.js';
import { apiPostJSON } from '@/utils/apiClient';
import { BacktestEmptyState, BacktestResultTab } from './TacticalCharts.js';
import { WhatIfTab } from './TacticalTables.js';
import { ALERT_TRIGGER_OPTIONS, TABS, useTacticalPageState } from './TacticalUtils.js';

type TacticalPageState = ReturnType<typeof useTacticalPageState>;

function AlertEmailInput({
  email,
  enabled,
  onChange,
}: {
  email: string;
  enabled: boolean;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ParamCard label={t('tactical.results.alertEmail')} style={{ marginBottom: 16, maxWidth: 360 }}>
      <div className="param-input-prefix-wrap">
        <Mail
          className="w-4 h-4"
          style={{
            position: 'absolute',
            left: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--text-muted)',
          }}
        />
        <input
          type="email"
          className="param-input"
          style={{ paddingLeft: 32 }}
          value={email}
          onChange={(e) => onChange(e.target.value)}
          placeholder="alert@example.com"
          disabled={!enabled}
        />
      </div>
    </ParamCard>
  );
}

function AlertTriggerOptions({
  config,
  onToggle,
}: {
  config: EmailAlertConfig;
  onToggle: (t: EmailAlertConfig['triggers'][number]) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 8 }}>
        {t('tactical.results.alertTrigger')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
        {ALERT_TRIGGER_OPTIONS.map((opt) => (
          <label key={opt.value} className="param-toggle" style={{ cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={config.triggers.includes(opt.value)}
              onChange={() => onToggle(opt.value)}
              disabled={!config.enabled}
            />
            <span style={{ fontWeight: 500 }}>{t(opt.label)}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 'auto' }}>
              {t(opt.desc)}
            </span>
          </label>
        ))}
      </div>
    </>
  );
}

function AlertsTab() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<EmailAlertConfig>({
    enabled: false,
    email: '',
    triggers: ['signal_change'],
  });
  const [saved, setSaved] = useState(false);
  const { isLoading, error, run, setError } = useAsyncAction();

  const toggleTrigger = (trigger: EmailAlertConfig['triggers'][number]) => {
    setConfig((prev) => ({
      ...prev,
      triggers: prev.triggers.includes(trigger)
        ? prev.triggers.filter((tk) => tk !== trigger)
        : [...prev.triggers, trigger],
    }));
  };

  const handleSave = () => {
    if (config.enabled && !config.email) {
      setError(t('tactical.results.alertEmailRequired'));
      return;
    }
    run(async () => {
      await apiPostJSON(
        '/api/v1/tactical/alerts',
        { config },
        t('tactical.results.alertSaveFailed'),
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  };

  return (
    <ChartCard title={t('tactical.results.alertTitle')}>
      <div className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
        {t('tactical.results.alertDesc')}
      </div>
      <label className="param-toggle" style={{ marginBottom: 16 }}>
        <Bell className="w-4 h-4" style={{ color: 'var(--brand)' }} />
        <span>{t('tactical.results.alertEnable')}</span>
        <div
          className={`toggle-switch ${config.enabled ? 'active' : ''}`}
          onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
        />
      </label>
      <AlertEmailInput
        email={config.email}
        enabled={config.enabled}
        onChange={(v) => setConfig((prev) => ({ ...prev, email: v }))}
      />
      <AlertTriggerOptions config={config} onToggle={toggleTrigger} />
      <div className="bt-action-row" style={{ paddingLeft: 0, maxWidth: 360 }}>
        <LoadingButton
          isLoading={isLoading}
          onClick={handleSave}
          loadingText={t('tactical.results.alertSaving')}
          style={{ width: '100%' }}
        >
          <Bell className="w-4 h-4" />
          {t('tactical.results.alertSave')}
        </LoadingButton>
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</div>}
      {saved && (
        <div style={{ color: 'var(--success)', fontSize: 13, marginTop: 8 }}>
          {t('tactical.results.alertSaved')}
        </div>
      )}
    </ChartCard>
  );
}

function TacticalResultsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { error, activeTab, setActiveTab, results, strategy } = state;
  return (
    <div className="space-y-4">
      {error && (
        <div className="card" style={{ color: 'var(--danger)', textAlign: 'center', padding: 24 }}>
          {t('tactical.results.backtestFailedDetail', { error })}
        </div>
      )}
      <div className="card">
        <div className="result-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`result-tab ${activeTab === tab.key ? 'active' : ''}`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
        <div className="result-content">
          {activeTab === 'backtest' &&
            (results ? <BacktestResultTab results={results} /> : <BacktestEmptyState />)}
          {activeTab === 'whatif' && <WhatIfTab strategy={strategy} />}
          {activeTab === 'alerts' && <AlertsTab />}
        </div>
      </div>
    </div>
  );
}

export { TacticalResultsPanel };
