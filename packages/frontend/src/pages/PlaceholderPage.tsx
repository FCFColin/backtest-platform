import { useTranslation } from 'react-i18next';
import { StaticPageShell } from '@/components/layout/StaticPageShell.js';
interface PlaceholderPageProps {
  titleKey: string;
  descKey: string;
}
export default function PlaceholderPage({ titleKey, descKey }: PlaceholderPageProps) {
  const { t } = useTranslation();
  return (
    <StaticPageShell title={t(titleKey)} titleClassName="text-h1">
      <p className="text-body text-fg-secondary">{t(descKey)}</p>
    </StaticPageShell>
  );
}
