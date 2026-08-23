import { useState, useEffect, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import * as L from 'lucide-react';
import { Link } from 'react-router';
import { Card, Button, Input } from '@/components/ui/uiComponents';
import { ComputeToolShell, type ComputeToolConfig } from '../../components/shells/index.js';
import BacktestParamsForm from '@/components/BacktestParamsForm.js';
import PortfolioEditor from '@/components/PortfolioEditor.js';
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import type { BacktestParameters, Portfolio } from '@backtest/shared';
import * as PS from '@/utils/portfolioStorage';
import type { SavedPortfolio } from '@/utils/portfolioStorage';
import { RunButton } from '@/components/form/sharedFields';
import { TableEmpty } from '@/components/stateDisplay.js';
import { ResultsContent } from './BacktestResults.js';

const HERO_KEY = 'backtest-hero-expanded';
const TAGLINE =
  'Professional tools for backtesting portfolios, asset allocations, and retirement cashflows';
const INTRO =
  'This platform is a portfolio backtesting tool supporting ETFs, stocks, funds, synthetic tickers, and custom sequences. Compare multiple portfolios over the same historical period, test rebalancing rules, and simulate cashflow contributions or withdrawals.';
const TOOLS = [
  { labelKey: 'nav.monteCarlo', path: '/monte-carlo' },
  { labelKey: 'nav.portfolioOptimize', path: '/optimizer' },
  { labelKey: 'nav.efficientFrontier', path: '/efficient-frontier' },
  { labelKey: 'nav.factorRegression', path: '/factor-regression' },
  { labelKey: 'nav.pca', path: '/pca' },
  { labelKey: 'nav.letfAnalysis', path: '/letf-slippage' },
] as const;
const CARD_CL =
  'p-5 bg-surface border border-border-subtle hover:border-border transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg cursor-default group';
const ICON_CL = 'p-2 bg-brand-subtle/8 rounded-lg group-hover:bg-brand-subtle/12 transition-colors';
const TOOL_CL =
  'text-caption px-2.5 py-1 bg-brand-subtle/8 text-brand rounded-md hover:bg-brand-subtle/15 transition-colors';
const MORE_CL = 'text-caption text-brand hover:underline flex items-center gap-1';
const CHEV_CL = 'h-4 w-4 ml-1';
const ROW_CL =
  'flex items-center gap-1.5 px-2.5 py-2 border-b border-border-subtle last:border-b-0';
const ROW_BTN_CL = 'flex-1 text-left bg-transparent border-none cursor-pointer p-0';
const fmtDate = (d: string, lang: string) => new Date(d).toLocaleString(lang);

type CapProps = {
  icon: ComponentType<{ className?: string }>;
  title: string;
  items?: string[];
  tools?: { label: string; path: string }[];
  link?: [string, string];
  subtitle?: string;
};
function CapabilityCard({ icon: Icon, title, items, tools, link, subtitle }: CapProps) {
  return (
    <Card className={CARD_CL}>
      <div className="flex items-center gap-3 mb-4">
        <div className={ICON_CL}>
          <Icon className="h-5 w-5 text-brand" />
        </div>
        <h3 className="text-h3">{title}</h3>
      </div>
      {Array.isArray(items) && (
        <ul className="space-y-2 mb-4">
          {items.map((x, i) => (
            <li key={i} className="text-body text-fg-secondary flex items-start gap-2">
              <L.Check className="size-3.5 text-success mt-0.5 shrink-0" />
              <span>{x}</span>
            </li>
          ))}
        </ul>
      )}
      {tools && (
        <div className="flex flex-wrap gap-2 mb-4">
          {tools.map((x) => (
            <Link key={x.path} to={x.path} className={TOOL_CL}>
              {x.label}
            </Link>
          ))}
        </div>
      )}
      {subtitle && <p className="text-caption text-fg-tertiary mt-2">{subtitle}</p>}
      {link && (
        <Link to={link[1]} className={MORE_CL}>
          {link[0]} <L.ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </Card>
  );
}
export function BacktestHero() {
  const { t } = useTranslation();
  const [exp, setExp] = useState(() => {
    try {
      return localStorage.getItem(HERO_KEY) !== '0';
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(HERO_KEY, exp ? '1' : '0');
    } catch {}
  }, [exp]);
  const cards: CapProps[] = [
    {
      icon: L.Settings,
      title: t('What You Can Model'),
      items: t('backtest.hero.model.items', { returnObjects: true }) as string[],
      link: [t('Start Configuring'), '#parameters'],
    },
    {
      icon: L.BarChart3,
      title: t('Metrics You Can Inspect'),
      items: t('backtest.hero.inspect.items', { returnObjects: true }) as string[],
      subtitle: '60+',
      link: [t('View Results'), '#results'],
    },
    {
      icon: L.Rocket,
      title: t('Related Research Tools'),
      tools: TOOLS.map((x) => ({ label: t(x.labelKey), path: x.path })),
    },
  ];
  return (
    <section className="page-container pt-4 pb-6" data-testid="page-hero">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-display md:text-display-xl text-fg mb-3" data-testid="page-title">
            {t('nav.portfolioBacktest')}
          </h1>
          <p className="text-h2 text-fg-secondary font-normal max-w-[720px]">{t(TAGLINE)}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExp(!exp)}
          className="text-caption text-fg-tertiary hover:text-fg"
        >
          {t(exp ? 'Hide Intro' : 'Show Intro')}{' '}
          {exp ? <L.ChevronUp className={CHEV_CL} /> : <L.ChevronDown className={CHEV_CL} />}
        </Button>
      </div>
      {exp ? (
        <>
          <p className="text-body text-fg-tertiary max-w-[860px] mb-8 leading-relaxed">
            {t(INTRO)}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {cards.map((c) => (
              <CapabilityCard key={c.title} {...c} />
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
function useBacktestPageState() {
  const { t } = useTranslation();
  const run = useBacktestStore((s) => s.runBacktest);
  const params = useBacktestStore((s) => s.parameters);
  const pfs = useBacktestStore((s) => s.portfolios);
  const load = useBacktestStore((s) => s.loadFromShare);
  const loaded = useBacktestStore((s) => s.hasLoadedFromShare);
  const setLoaded = useBacktestStore((s) => s.setHasLoadedFromShare);
  useEffect(() => {
    if (loaded) return;
    setLoaded(true);
    const u = PS.readStateFromURL();
    if (u) {
      load(u);
      useToastStore.getState().addToast('success', t('Configuration loaded from share link'));
      return;
    }
    const d = localStorage.getItem('bt_load_from_optimizer');
    if (!d) return;
    localStorage.removeItem('bt_load_from_optimizer');
    try {
      const j = JSON.parse(d) as { portfolios?: Portfolio[]; parameters?: BacktestParameters };
      const ps = (j.portfolios ?? []).map((p) => ({ ...p, id: p.id || `portfolio-${Date.now()}` }));
      if (ps.length && j.parameters) load({ portfolios: ps, parameters: j.parameters });
    } catch {
      useToastStore
        .getState()
        .addToast('warning', t('Optimizer data format error, unable to load'));
    }
  }, [load, loaded, setLoaded, t]);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [loadOpen, setLoadOpen] = useState(false);
  const [saved, setSaved] = useState<SavedPortfolio[]>([]);
  return {
    t,
    runBacktest: run,
    parameters: params,
    portfolios: pfs,
    saveOpen,
    setSaveOpen,
    name,
    setName,
    loadOpen,
    saved,
    save: async () => {
      const n = name.trim();
      if (!n) return;
      await PS.saveNamedConfigApi(n, pfs, params);
      useToastStore.getState().addToast('success', t('Scheme saved'));
      setName('');
      setSaveOpen(false);
    },
    toggleLoad: async () => {
      setLoadOpen(!loadOpen);
      setSaveOpen(false);
      if (!loadOpen) setSaved(await PS.listNamedConfigs());
    },
    loadCfg: (c: SavedPortfolio) => {
      load({ portfolios: c.portfolios, parameters: c.parameters });
      useToastStore.getState().addToast('success', t('Scheme loaded'));
      setLoadOpen(false);
    },
    delCfg: async (id: string) =>
      setSaved(await (await PS.deleteNamedConfigApi(id), PS.listNamedConfigs())),
  };
}
type S = ReturnType<typeof useBacktestPageState>;
function BacktestToolbar({ state: s }: { state: S }) {
  const { t, i18n } = useTranslation();
  const loading = useBacktestStore((x) => x.isLoading);
  const count = useBacktestStore((x) => x.portfolios.length);
  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-border-subtle pt-4">
      <div className="flex items-center gap-2">
        <RunButton
          isLoading={loading}
          onClick={s.runBacktest}
          label={t('Run Backtest')}
          loadingLabel={t('Backtesting...')}
          disabled={count === 0}
          data-testid="backtest-run"
        />
        <Button variant="secondary" onClick={() => void s.toggleLoad()}>
          <L.FolderOpen /> {t('Load Saved Backtest')} <L.ChevronDown className="size-3.5" />
        </Button>
        <Button variant="secondary" onClick={() => s.setSaveOpen(true)}>
          <L.Save className="size-4" /> {t('Save')}
        </Button>
      </div>
      {count === 0 ? (
        <p className="text-caption text-fg-tertiary">{t('Please add at least one portfolio')}</p>
      ) : null}
      {s.saveOpen ? (
        <div className="mt-2 flex items-center gap-1.5">
          <Input
            type="text"
            value={s.name}
            onChange={(e) => s.setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void s.save();
            }}
            placeholder={t('Enter scheme name')}
            className="flex-1"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: form input focus on modal open
            autoFocus
          />
          <Button variant="secondary" size="sm" onClick={() => void s.save()}>
            {t('Confirm')}
          </Button>
          <Button
            variant="destructive"
            size="icon"
            onClick={() => {
              s.setSaveOpen(false);
              s.setName('');
            }}
            title={t('Cancel')}
            aria-label={t('Cancel')}
          >
            <L.X />
          </Button>
        </div>
      ) : null}
      {s.loadOpen ? (
        <div className="mt-2 max-h-[240px] overflow-y-auto rounded-md border border-border-subtle bg-elevated">
          {s.saved.length === 0 ? (
            <TableEmpty message={t('No saved schemes')} className="px-3 py-3 text-caption" />
          ) : (
            s.saved.map((c) => (
              <div key={c.id} className={ROW_CL}>
                <button onClick={() => s.loadCfg(c)} className={ROW_BTN_CL}>
                  <div className="text-body font-medium text-fg">{c.name}</div>
                  <div className="text-caption text-fg-tertiary">
                    {fmtDate(c.savedAt, i18n.language)} · {c.portfolios.length} {t('portfolios')}
                  </div>
                </button>
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => void s.delCfg(c.id)}
                  title={t('Delete')}
                  aria-label={t('Delete')}
                >
                  <L.Trash2 />
                </Button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
const REL = [
  ...TOOLS.slice(0, 3).map((x) => ({ titleKey: x.labelKey, href: x.path })),
  { titleKey: 'nav.assetAnalysis', href: '/analysis' },
];
const config: ComputeToolConfig<S> = {
  titleKey: 'nav.portfolioBacktest',
  hidePageTitle: true,
  seoDescKey: 'backtest.seoDesc',
  seoFeatures: [
    { titleKey: 'backtest.seoModelable', descKey: 'backtest.seoModelableDesc' },
    { titleKey: 'analysis.seoViewable', descKey: 'backtest.seoViewableDesc' },
  ],
  relatedTools: REL,
  params: BacktestParamsForm,
  afterParams: ({ state }) => (
    <Card className="p-5">
      <PortfolioEditor />
      <BacktestToolbar state={state} />
    </Card>
  ),
  results: ResultsContent,
};
export default function BacktestPage() {
  const state = useBacktestPageState();
  return (
    <>
      <BacktestHero />
      <div className="page-container border-t border-border-subtle" />
      <ComputeToolShell config={config} state={state} />
    </>
  );
}
