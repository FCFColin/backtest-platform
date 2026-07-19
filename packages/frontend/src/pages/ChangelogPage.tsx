/**
 * @file 更新日志页面
 * @description 展示项目版本更新历史，按版本倒序排列，分类标注变更类型
 * @route /changelog
 */
import { useTranslation } from 'react-i18next';
import { GitCommit, Plus, Wrench, Bug, Calendar } from 'lucide-react';
import { StandardPageShell } from '../components/shells/StandardPageShell.js';

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
  const raw = t('changelog.versions', { returnObjects: true }) as Record<
    string,
    { date: string; highlight?: string; changes: ChangeEntry[] }
  >;
  return Object.entries(raw).map(([version, v]) => ({ version, ...v }));
}

function useTypeConfig(): Record<
  ChangeType,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> {
  const { t } = useTranslation();
  return {
    added: {
      label: t('changelog.added'),
      color: 'var(--success)',
      bg: 'color-mix(in srgb, var(--success) 12%, transparent)',
      icon: <Plus className="w-3 h-3" />,
    },
    improved: {
      label: t('changelog.improved'),
      color: 'var(--brand)',
      bg: 'var(--brand-soft)',
      icon: <Wrench className="w-3 h-3" />,
    },
    fixed: {
      label: t('changelog.fixed'),
      color: 'var(--warning)',
      bg: 'color-mix(in srgb, var(--warning) 12%, transparent)',
      icon: <Bug className="w-3 h-3" />,
    },
  };
}

/** 变更条目标签 */
function ChangeTag({ c }: { c: ChangeEntry }) {
  const cfg = useTypeConfig()[c.type];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '1px 7px',
        fontSize: 11,
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        borderRadius: 4,
        flexShrink: 0,
        minWidth: 44,
        justifyContent: 'center',
        marginTop: 2,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function VersionTimelineItem({ v }: { v: VersionEntry }) {
  return (
    <div style={{ position: 'relative', paddingLeft: 44, paddingBottom: 28 }}>
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: 4,
          width: 14,
          height: 14,
          borderRadius: '50%',
          background: 'var(--brand)',
          border: '3px solid var(--bg-elevated)',
          boxShadow: '0 0 0 2px var(--brand)',
        }}
      />
      <div
        style={{
          padding: 16,
          background: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-control)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 4,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>
            {v.version}
          </span>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              color: 'var(--text-muted)',
            }}
          >
            <Calendar className="w-3 h-3" />
            {v.date}
          </span>
          {v.highlight && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--brand)',
                background: 'var(--brand-soft)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {v.highlight}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
          {v.changes.map((c, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <ChangeTag c={c} />
              <span style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>
                {c.text}
              </span>
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
    <StandardPageShell config={{ titleKey: 'changelog.title' }}>
      <div className="bt-main-card card" style={{ padding: 24 }}>
        <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
          {t('changelog.intro')}
          <span style={{ color: 'var(--success)', fontWeight: 600 }}> {t('changelog.added')}</span>
          {' · '}
          <span style={{ color: 'var(--brand)', fontWeight: 600 }}>{t('changelog.improved')}</span>
          {' · '}
          <span style={{ color: 'var(--warning)', fontWeight: 600 }}> {t('changelog.fixed')}</span>
          {t('changelog.categoriesSuffix')}
        </div>
        <div style={{ position: 'relative', paddingLeft: 8 }}>
          <div
            style={{
              position: 'absolute',
              left: 19,
              top: 8,
              bottom: 8,
              width: 2,
              background: 'var(--border-soft)',
            }}
          />
          {versions.map((v) => (
            <VersionTimelineItem key={v.version} v={v} />
          ))}
        </div>
        <div
          style={{
            marginTop: 8,
            padding: 16,
            background: 'var(--bg-subtle)',
            borderRadius: 'var(--radius-control)',
            fontSize: 12,
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <GitCommit className="w-4 h-4" />
          {t('changelog.gitHistoryHint')}
        </div>
      </div>
    </StandardPageShell>
  );
}
