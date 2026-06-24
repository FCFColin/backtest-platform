/**
 * @file 顶部导航栏
 * @description 平台主导航栏，分组工具菜单结构（对标 testfol.io），右侧含引擎状态、语言切换、主题切换、关于、升级
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Info, Zap, ChevronDown, Sun, Moon, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EngineStatusIndicator } from '../EngineStatusIndicator';
import { useTheme } from '@/hooks/useTheme';

/** 导航分组 key 映射 */
const NAV_GROUP_KEYS = [
  {
    key: 'backtest',
    items: [
      { to: '/', key: 'portfolioBacktest' },
      { to: '/backtest-optimizer', key: 'backtestOptimizer' },
      { to: '/rebalancing-sensitivity', key: 'rebalancingSensitivity' },
    ],
  },
  {
    key: 'analysis',
    items: [
      { to: '/analysis', key: 'assetAnalysis' },
      { to: '/factor-regression', key: 'factorRegression' },
      { to: '/pca', key: 'pca' },
    ],
  },
  {
    key: 'optimize',
    items: [
      { to: '/optimizer', key: 'portfolioOptimize' },
      { to: '/efficient-frontier', key: 'efficientFrontier' },
      { to: '/monte-carlo', key: 'monteCarlo' },
      { to: '/goal-optimizer', key: 'goalOptimizer' },
    ],
  },
  {
    key: 'tactical',
    items: [
      { to: '/tactical', key: 'tacticalAllocation' },
      { to: '/tactical-grid', key: 'tacticalGrid' },
      { to: '/signal-analyzer', key: 'signalAnalyzer' },
      { to: '/dual-signal', key: 'dualSignal' },
      { to: '/multi-signal', key: 'multiSignal' },
    ],
  },
  {
    key: 'more',
    items: [
      { to: '/lumpsum-vs-dca', key: 'lumpsumVsDca' },
      { to: '/letf-slippage', key: 'letfSlippage' },
      { to: '/calculators', key: 'calculators' },
      { to: '/data-engine', key: 'dataEngine' },
    ],
  },
] as const;

export default function Navbar() {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  // 点击外部关闭下拉
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenGroup(null);
      }
    };
    if (openGroup) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openGroup]);

  const isActive = (to: string) => location.pathname === to;

  const toggleLang = () => {
    i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN');
  };

  const linkStyle = (active: boolean): React.CSSProperties => ({
    minHeight: 44,
    padding: '0 12px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.15px',
    lineHeight: 1.05,
    color: active ? 'var(--brand)' : 'var(--text-muted)',
    background: active ? 'var(--brand-soft)' : 'transparent',
    transition: 'background-color .12s, color .12s',
    whiteSpace: 'nowrap',
  });

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center px-5"
      style={{
        height: 64,
        background: 'color-mix(in srgb, var(--bg-header) 92%, transparent)',
        backdropFilter: 'saturate(180%) blur(10px)',
        WebkitBackdropFilter: 'saturate(180%) blur(10px)',
        borderBottom: '1px solid var(--border-strong)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <Link
        to="/"
        className="flex items-center gap-1.5 mr-6 shrink-0 no-underline"
        style={{ color: 'var(--brand)' }}
      >
        <BarChart3 className="w-5 h-5" />
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.2px' }}>
          {t('nav.brandName')}
        </span>
      </Link>

      <div
        ref={navRef}
        className="flex items-center mx-auto"
        style={{
          border: '1px solid var(--border-strong)',
          background: 'color-mix(in srgb, var(--bg-elevated) 72%, var(--bg-subtle))',
          borderRadius: 16,
          padding: 4,
          boxShadow: 'inset 0 1px #ffffff59',
        }}
      >
        {NAV_GROUP_KEYS.map((group) => {
          const groupActive = group.items.some((item) => isActive(item.to));
          const isOpen = openGroup === group.key;
          return (
            <div key={group.key} style={{ position: 'relative' }}>
              <button
                className="flex items-center justify-center no-underline transition-colors"
                style={{
                  ...linkStyle(groupActive),
                  cursor: 'pointer',
                  border: 'none',
                  gap: 2,
                }}
                onClick={() => setOpenGroup(isOpen ? null : group.key)}
                onMouseEnter={(e) => {
                  if (!groupActive) {
                    e.currentTarget.style.background = 'var(--bg-subtle)';
                    e.currentTarget.style.color = 'var(--text-body)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!groupActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-muted)';
                  }
                }}
              >
                {t(`nav.${group.key}`)}
                <ChevronDown
                  className="w-3 h-3"
                  style={{
                    transition: 'transform .15s',
                    transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
                  }}
                />
              </button>

              {isOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    marginTop: 6,
                    minWidth: 180,
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow-md)',
                    padding: 6,
                    zIndex: 100,
                  }}
                >
                  {group.items.map((item) => {
                    const active = isActive(item.to);
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        className="flex items-center no-underline"
                        style={{
                          padding: '8px 10px',
                          borderRadius: 8,
                          fontSize: 12,
                          fontWeight: 600,
                          color: active ? 'var(--brand)' : 'var(--text-body)',
                          background: active ? 'var(--brand-soft)' : 'transparent',
                          transition: 'background-color .12s',
                          width: '100%',
                        }}
                        onClick={() => setOpenGroup(null)}
                        onMouseEnter={(e) => {
                          if (!active) {
                            e.currentTarget.style.background = 'var(--bg-subtle)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!active) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        {t(`nav.${item.key}`)}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="ml-auto flex items-center gap-1">
        <EngineStatusIndicator />
        <button
          onClick={toggleLang}
          title={t('lang.switchLang')}
          className="flex flex-col items-center justify-center px-2.5 no-underline transition-colors"
          style={{
            color: 'var(--text-muted)',
            borderRadius: 14,
            height: 44,
            minWidth: 44,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Globe className="w-4 h-4" />
          <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: 1 }}>
            {i18n.language === 'zh-CN' ? 'EN' : '中文'}
          </span>
        </button>
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
          className="flex flex-col items-center justify-center px-2.5 no-underline transition-colors"
          style={{
            color: 'var(--text-muted)',
            borderRadius: 14,
            height: 44,
            minWidth: 44,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: 1 }}>{t('nav.theme')}</span>
        </button>
        <Link
          to="/about"
          className="flex flex-col items-center justify-center px-2.5 no-underline transition-colors"
          style={{ color: 'var(--text-muted)', borderRadius: 14, height: 44, minWidth: 44 }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-subtle)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <Info className="w-4 h-4" />
          <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: 1 }}>{t('nav.about')}</span>
        </Link>
        <Link
          to="/upgrade"
          className="flex flex-col items-center justify-center px-3 text-white no-underline transition-colors"
          style={{ backgroundColor: 'var(--brand)', borderRadius: 14, height: 44, minWidth: 44 }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand-hover)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--brand)')}
        >
          <Zap className="w-4 h-4" />
          <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: 1 }}>{t('nav.upgrade')}</span>
        </Link>
      </div>
    </nav>
  );
}
