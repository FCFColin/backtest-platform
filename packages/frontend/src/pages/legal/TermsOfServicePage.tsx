import { useTranslation } from 'react-i18next';
import LegalPageLayout, { type LegalSection } from './LegalPageLayout.js';
const SECTION_KEYS = ['acceptance', 'license', 'disclaimer', 'liability'] as const;
export default function TermsOfServicePage() {
  const { t } = useTranslation();
  const sections: LegalSection[] = SECTION_KEYS.map((key) => ({
    title: t(`legal.terms.sections.${key}.title`),
    body: t(`legal.terms.sections.${key}.body`, { returnObjects: true }) as string[]
  }));
  return <LegalPageLayout title={t('legal.terms.title')} lastUpdated={t('legal.terms.lastUpdated')} intro={t('legal.terms.intro')} sections={sections} />;
}
