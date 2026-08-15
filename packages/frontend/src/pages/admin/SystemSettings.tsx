import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Server, Database, RefreshCw, RotateCcw } from 'lucide-react';
import { apiFetch } from '../../utils/apiClient.js';
import { useToastStore } from '../../store/toastStore.js';
import { reportError } from '../../utils/errorReporter.js';
import { Button, Card } from '../../components/ui/uiComponents.js';
import { Field, FieldLabel } from '../../components/form/Field.js';
import { useConfirmDialog } from '../../components/confirmDialog.js';
import { buildServiceHealths, type ServiceHealthView } from '../../utils/adminStats.js';
import { ServiceStatusTable } from '../../components/admin/AdminLayout.js';
interface AppConfig {
  services: ServiceHealthView[];
  nodeEnv: string;
  nodeVersion: string;
}
const DEFAULT_CONFIG: AppConfig = {
  services: buildServiceHealths({}),
  nodeEnv: 'development',
  nodeVersion: '-',
};
function ServiceConfigSection({ services }: { services: ServiceHealthView[] }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Server className="h-4 w-4 text-fg-tertiary" />
        <h2 className="text-sm font-semibold text-fg">{t('Service Configuration')}</h2>
      </div>
      <ServiceStatusTable services={services} />
    </Card>
  );
}
function RuntimeEnvSection({ config }: { config: AppConfig }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Settings className="h-4 w-4 text-fg-tertiary" />
        <h2 className="text-sm font-semibold text-fg">{t('Runtime Environment')}</h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field>
          <FieldLabel>{t('Node Version')}</FieldLabel>
          <p className="text-body text-fg">{config.nodeVersion}</p>
        </Field>
        <Field>
          <FieldLabel>{t('Run Mode')}</FieldLabel>
          <p className="text-body text-fg">{config.nodeEnv}</p>
        </Field>
        <Field>
          <FieldLabel>{t('Platform')}</FieldLabel>
          <p className="text-body text-fg">{navigator.platform || '-'}</p>
        </Field>
      </div>
    </Card>
  );
}
interface DataManagementProps {
  onClearCache: () => void;
}
function DataManagementSection({ onClearCache }: DataManagementProps) {
  const { t } = useTranslation();
  return (
    <Card className="p-4">
      <div className="mb-4 flex items-center gap-2">
        <Database className="h-4 w-4 text-fg-tertiary" />
        <h2 className="text-sm font-semibold text-fg">{t('Data Management')}</h2>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          onClick={onClearCache}
          className="text-warning border-warning/20 bg-warning/10 hover:bg-warning/20 hover:text-warning"
        >
          <RotateCcw className="h-4 w-4" />
          {t('Refetch Data')}
        </Button>
      </div>
      <p className="mt-3 text-xs text-fg-tertiary">{t('Refresh data cache or refetch data')}</p>
    </Card>
  );
}
function ArchitectureSection() {
  const { t } = useTranslation();
  const items = [
    { color: 'bg-brand', text: t('Go Engine') },
    { color: 'bg-success', text: t('Go Data Service') },
    { color: 'bg-warning', text: t('Node.js') },
    { color: 'bg-chart-5', text: t('Vite') },
  ];
  return (
    <Card className="p-4">
      <h2 className="mb-4 text-sm font-semibold text-fg">{t('Architecture')}</h2>
      <div className="space-y-2 text-sm text-fg-secondary">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2">
            <span className={`mt-0.5 inline-block h-2 w-2 rounded-full ${item.color}`} />
            <p>
              <strong>{item.text}</strong>
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
export default function SystemSettings() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [confirmDialog, confirm] = useConfirmDialog();
  const clearMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (clearMsgTimerRef.current) clearTimeout(clearMsgTimerRef.current);
    },
    [],
  );
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/admin/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setConfig((prev) => ({ ...prev, services: buildServiceHealths(json.data) }));
        }
      }
    } catch (e) {
      reportError(e, { component: 'SystemSettings', action: 'fetchConfig' });
      useToastStore.getState().addToast('error', t('Load failed'));
    }
    setLoading(false);
  }, [t]);
  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);
  const handleClearCache = () =>
    confirm(
      t('Full update refetches all market data. Continue?'),
      async () => {
        setSaveMsg(t('Clearing cache...'));
        try {
          const res = await apiFetch('/api/v1/data/manage/update/full', { method: 'PUT' });
          const json = await res.json();
          setSaveMsg(
            json.success
              ? t('Cache cleared')
              : t('Action failed: {{error}}', { error: json.error }),
          );
        } catch {
          setSaveMsg(t('Request failed'));
        }
        clearMsgTimerRef.current = setTimeout(() => setSaveMsg(''), 5000);
      },
      true,
    );
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={fetchConfig} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {t('Refresh')}
        </Button>
        {saveMsg && <span className="text-sm font-medium text-brand">{saveMsg}</span>}
      </div>
      <ServiceConfigSection services={config.services} />
      <RuntimeEnvSection config={config} />
      <DataManagementSection onClearCache={handleClearCache} />
      <ArchitectureSection />
      {confirmDialog}
    </div>
  );
}
