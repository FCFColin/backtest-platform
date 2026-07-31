import { useTranslation } from 'react-i18next';
import { GitCommit, Plus, Wrench, Bug, Calendar } from 'lucide-react';
import type { ReactNode } from 'react';
import { Card } from '@/components/ui/uiComponents';
import { Badge } from '@/components/ui/uiComponents';
type ChangeType = 'added' | 'improved' | 'fixed';
interface ChangeEntry {
  type: ChangeType;
  text: string;
}
interface VersionEntry {
  version: string;
  date: string;
  highlight?: string;
  changes: ChangeEntry[];
}
function useVersions(): VersionEntry[] {
  const { t } = useTranslation();
  const raw = t('changelog.versions', { returnObjects: true }) as Record<string, { date: string; highlight?: string; changes: ChangeEntry[] }>;
  return Object.entries(raw).map(([version, v]) => ({ version, ...v }));
}
function useTypeConfig(): Record<ChangeType, { label: string; variant: 'success' | 'asset' | 'secondary'; icon: ReactNode }> {
  const { t } = useTranslation();
  return {
    added: {
      label: t('changelog.added'),
      variant: 'success',
      icon: <Plus className="size-3" />
    },
    improved: {
      label: t('changelog.improved'),
      variant: 'asset',
      icon: <Wrench className="size-3" />
    },
    fixed: {
      label: t('changelog.fixed'),
      variant: 'secondary',
      icon: <Bug className="size-3" />
    }
  };
}
function ChangeTag({ c }: { c: ChangeEntry }) {
  const cfg = useTypeConfig()[c.type];
  return (
    <Badge variant={cfg.variant} size="sm" className="mt-0.5 shrink-0 min-w-[44px] justify-center">
      {cfg.icon}
      {cfg.label}
    </Badge>
  );
}
function VersionTimelineItem({ v }: { v: VersionEntry }) {
  return (
    <div className="relative pb-7 pl-11">
      <div className="absolute left-3 top-1 size-3.5 rounded-full border-[3px] border-elevated bg-brand ring-2 ring-brand" />
      <div className="rounded-lg bg-input-bg p-4">
        <div className="mb-1 flex flex-wrap items-center gap-3">
          <span className="text-h2 font-bold text-fg">{v.version}</span>
          <span className="flex items-center gap-1 text-caption text-fg-tertiary">
            <Calendar className="size-3" />
            {v.date}
          </span>
          {v.highlight && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-label-tiny font-semibold text-brand">{v.highlight}</span>}
        </div>
        <div className="mt-3 flex flex-col gap-1.5">
          {v.changes.map((c, i) => (
            <div key={i} className="flex items-start gap-2">
              <ChangeTag c={c} />
              <span className="text-label leading-relaxed text-fg-secondary">{c.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
export default function ChangelogPage() {
  const { t } = useTranslation();
  const versions = useVersions();
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{t('changelog.title')}</h1>
      <Card className="p-6">
        <div className="mb-6 text-body leading-loose text-fg-secondary">
          {t('changelog.intro')}
          <span className="font-semibold text-success"> {t('changelog.added')}</span>
          {' · '}
          <span className="font-semibold text-brand">{t('changelog.improved')}</span>
          {' · '}
          <span className="font-semibold text-warning"> {t('changelog.fixed')}</span>
          {t('changelog.categoriesSuffix')}
        </div>
        <div className="relative pl-2">
          <div className="absolute bottom-2 left-[19px] top-2 w-0.5 bg-border-subtle" />
          {versions.map((v) => (
            <VersionTimelineItem key={v.version} v={v} />
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-input-bg p-4 text-caption text-fg-tertiary">
          <GitCommit className="size-4" />
          {t('changelog.gitHistoryHint')}
        </div>
      </Card>
    </div>
  );
}
