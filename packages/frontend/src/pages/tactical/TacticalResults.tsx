/**
 * @file 战术回测结果面板
 * @description 用 shadcn Tabs 分 backtest/whatif/alerts 三 tab，每 tab 用 Card 包裹。
 *              Alerts tab 用 Switch + Checkbox + Field/Input + Button。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Mail } from 'lucide-react';
import type { EmailAlertConfig } from '@backtest/shared/types/tactical';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Field, FieldLabel } from '@/components/form/Field';
import ErrorBanner from '@/components/ErrorBanner';
import { useAsyncAction } from '@/hooks/useAsyncAction';
import { apiPostJSON } from '@/utils/apiClient';
import { BacktestEmptyState, BacktestResultTab } from './TacticalCharts';
import { WhatIfTab } from './TacticalTables';
import { ALERT_TRIGGER_OPTIONS, TABS, useTacticalPageState } from './TacticalUtils';

type TacticalPageState = ReturnType<typeof useTacticalPageState>;

/** 告警邮箱输入 */
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
    <Field className="max-w-[360px]">
      <FieldLabel htmlFor="alert-email">{t('tactical.results.alertEmail')}</FieldLabel>
      <div className="relative">
        <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-tertiary" />
        <Input
          id="alert-email"
          type="email"
          className="pl-8"
          value={email}
          onChange={(e) => onChange(e.target.value)}
          placeholder="alert@example.com"
          disabled={!enabled}
        />
      </div>
    </Field>
  );
}

/** 告警触发条件选项 */
function AlertTriggerOptions({
  config,
  onToggle,
}: {
  config: EmailAlertConfig;
  onToggle: (t: EmailAlertConfig['triggers'][number]) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="max-w-[360px]">
      <div className="mb-2 text-label font-semibold text-fg">
        {t('tactical.results.alertTrigger')}
      </div>
      <div className="flex flex-col gap-2">
        {ALERT_TRIGGER_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            htmlFor={`trigger-${opt.value}`}
            className="flex cursor-pointer items-center gap-2.5"
          >
            <Checkbox
              id={`trigger-${opt.value}`}
              checked={config.triggers.includes(opt.value)}
              onCheckedChange={() => onToggle(opt.value)}
              disabled={!config.enabled}
            />
            <span className="text-label font-medium text-fg">{t(opt.label)}</span>
            <span className="ml-auto text-caption text-fg-tertiary">{t(opt.desc)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** 告警 Tab */
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
    <Card className="p-4">
      <h3 className="mb-1 text-h3 text-fg">{t('tactical.results.alertTitle')}</h3>
      <p className="mb-4 text-caption text-fg-tertiary">{t('tactical.results.alertDesc')}</p>

      <div className="mb-4 flex items-center gap-2.5">
        <Bell className="size-4 text-brand" />
        <span className="text-label text-fg">{t('tactical.results.alertEnable')}</span>
        <Switch
          checked={config.enabled}
          onCheckedChange={(v) => setConfig((prev) => ({ ...prev, enabled: v }))}
          className="ml-auto"
        />
      </div>

      <div className="mb-4">
        <AlertEmailInput
          email={config.email}
          enabled={config.enabled}
          onChange={(v) => setConfig((prev) => ({ ...prev, email: v }))}
        />
      </div>

      <div className="mb-4">
        <AlertTriggerOptions config={config} onToggle={toggleTrigger} />
      </div>

      <Button variant="primary" onClick={handleSave} disabled={isLoading} className="w-full max-w-[360px]">
        <Bell className="size-4" />
        {isLoading ? t('tactical.results.alertSaving') : t('tactical.results.alertSave')}
      </Button>

      {error && <p className="mt-2 text-caption text-danger">{error}</p>}
      {saved && <p className="mt-2 text-caption text-success">{t('tactical.results.alertSaved')}</p>}
    </Card>
  );
}

/** 战术回测结果面板：错误态 + Tabs(backtest/whatif/alerts) */
function TacticalResultsPanel({ state }: { state: TacticalPageState }) {
  const { t } = useTranslation();
  const { error, activeTab, setActiveTab, results, strategy } = state;
  return (
    <div className="flex flex-col gap-3">
      {error && <ErrorBanner message={t('tactical.results.backtestFailedDetail', { error })} />}
      <Card className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key}>
                {t(tab.label)}
              </TabsTrigger>
            ))}
          </TabsList>
          <TabsContent value="backtest">
            {results ? <BacktestResultTab results={results} /> : <BacktestEmptyState />}
          </TabsContent>
          <TabsContent value="whatif">
            <WhatIfTab strategy={strategy} />
          </TabsContent>
          <TabsContent value="alerts">
            <AlertsTab />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}

export { TacticalResultsPanel };
