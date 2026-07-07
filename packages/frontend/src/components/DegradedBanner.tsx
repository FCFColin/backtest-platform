import { useTranslation } from 'react-i18next';
import { useDegradedStore } from '../store/degradedStore';

export function DegradedBanner() {
  const { t } = useTranslation();
  const degraded = useDegradedStore((s) => s.degraded);
  const warning = useDegradedStore((s) => s.degradedWarning);

  if (!degraded) return null;

  return (
    <div
      role="alert"
      style={{
        background: 'color-mix(in srgb, var(--warning) 12%, var(--bg-elevated))',
        borderBottom: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
        padding: '8px 16px',
        fontSize: '13px',
        color: 'var(--warning)',
        lineHeight: 1.5,
        textAlign: 'center',
      }}
    >
      <span style={{ fontWeight: 600 }}>{t('errors.degradedMode')}</span>{' '}
      {warning || t('errors.degradedDefaultWarning')}
    </div>
  );
}
