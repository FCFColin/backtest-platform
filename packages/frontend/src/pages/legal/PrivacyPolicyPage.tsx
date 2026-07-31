import { useTranslation } from 'react-i18next';
import LegalPageLayout, { type LegalSection } from './LegalPageLayout.js';
const SECTION_KEYS = ['dataCollection', 'dataUse', 'dataRetention', 'cookiePolicy'] as const;
export default function PrivacyPolicyPage() {
  const { t } = useTranslation();
  const sections: LegalSection[] = SECTION_KEYS.map((key) => ({
    title: t(`legal.privacy.sections.${key}.title`),
    body: t(`legal.privacy.sections.${key}.body`, { returnObjects: true }) as string[]
  }));
  return <LegalPageLayout title={t('legal.privacy.title')} lastUpdated={t('legal.privacy.lastUpdated')} intro={t('legal.privacy.intro')} sections={sections} />;
}
