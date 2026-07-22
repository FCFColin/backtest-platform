/**
 * @file 顶部导航栏
 * @description 平台主导航栏，对标 testfol.io 风格：汉堡菜单、Logo、PUBLIC标签、导航菜单、暗色模式切换、货币选择、Create Free Account按钮
 */
import { useState, useRef, useEffect, startTransition } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Menu, Sun, Moon, Globe, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/hooks/useTheme';
import { useBacktestStore } from '@/store/backtestStore';
import { NAV_GROUP_KEYS } from './navConfig.js';
import { NavGroup } from './NavGroupMenu.js';

function NavGroupsContainer({
  navRef,
  openGroup,
  isActive,
  onToggle,
  t,
}: {
  navRef: React.RefObject<HTMLDivElement>;
  openGroup: string;
  isActive: (to: string) => boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div ref={navRef} className="navbar-groups">
      {NAV_GROUP_KEYS.map((group) => (
        <NavGroup
          key={group.key}
          group={group}
          isActive={isActive}
          isOpen={openGroup === group.key}
          onToggle={onToggle}
          t={t}
        />
      ))}
    </div>
  );
}

function NavToolbar({
  theme,
  toggleTheme,
  t,
  i18n,
}: {
  theme: string;
  toggleTheme: () => void;
  t: (key: string, opts?: { defaultValue?: string }) => string;
  i18n: { language: string; changeLanguage: (lng: string) => void };
}) {
  const baseCurrency = useBacktestStore(useShallow((s) => s.parameters.baseCurrency));
  const updateParameter = useBacktestStore((s) => s.updateParameter);

  const toggleCurrency = () => {
    updateParameter('baseCurrency', baseCurrency === 'usd' ? 'cny' : 'usd');
  };

  return (
    <div className="navbar-toolbar">
      <button
        onClick={() =>
          startTransition(() => i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN'))
        }
        className="navbar-icon-btn"
        title={t('lang.switchLang')}
      >
        <Globe className="w-4 h-4" />
      </button>
      <button
        onClick={toggleTheme}
        className="navbar-icon-btn"
        title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>
      <button
        className="navbar-currency-btn"
        onClick={toggleCurrency}
        title={t('lang.switchCurrency')}
      >
        {baseCurrency === 'usd' ? 'USD' : 'CNY'} <ChevronDown className="w-3 h-3" />
      </button>
      <button className="navbar-create-account-btn">{t('common.createFreeAccount')}</button>
    </div>
  );
}

export default function Navbar() {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string>('');
  const navRef = useRef<HTMLDivElement>(null);
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenGroup('');
    };
    if (openGroup) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openGroup]);

  const isActive = (to: string) => location.pathname === to;

  return (
    <nav className="navbar">
      <button className="navbar-hamburger" aria-label="Menu">
        <Menu className="w-5 h-5" />
      </button>
      <Link to="/" className="navbar-brand">
        <BarChart3 className="navbar-brand-icon" />
        <span className="navbar-brand-name">{t('nav.brandName')}</span>
      </Link>
      <span className="navbar-public-badge">PUBLIC</span>
      <NavGroupsContainer
        navRef={navRef}
        openGroup={openGroup}
        isActive={isActive}
        onToggle={setOpenGroup}
        t={t}
      />
      <NavToolbar theme={theme} toggleTheme={toggleTheme} t={t} i18n={i18n} />
    </nav>
  );
}
