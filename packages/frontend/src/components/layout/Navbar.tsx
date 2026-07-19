/**
 * @file 顶部导航栏
 * @description 平台主导航栏，分组工具菜单结构（对标 testfol.io），右侧含引擎状态、语言切换、主题切换、关于、升级
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Info, Zap, Sun, Moon, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EngineStatusIndicator } from '../EngineStatusIndicator.js';
import { useTheme } from '@/hooks/useTheme';
import AuthMenu from './AuthMenu.js';
import { NAV_GROUP_KEYS } from './navConfig.js';
import { NavIconButton, NavIconLink } from './NavIconComponents.js';
import { labelStyle } from './navIconData.js';
import { NavGroup } from './NavGroupMenu.js';

/** 导航分组容器 */
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

/** 右侧工具栏 */
function NavToolbar({
  theme,
  toggleTheme,
  t,
  i18n,
}: {
  theme: string;
  toggleTheme: () => void;
  t: (key: string) => string;
  i18n: { language: string; changeLanguage: (lng: string) => void };
}) {
  return (
    <div className="ml-auto flex items-center gap-1">
      <EngineStatusIndicator />
      <NavIconButton
        onClick={() => i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN')}
        title={t('lang.switchLang')}
      >
        <Globe className="w-4 h-4" />
        <span style={{ ...labelStyle, minWidth: 28 }}>
          {i18n.language === 'zh-CN' ? 'EN' : t('lang.zh')}
        </span>
      </NavIconButton>
      <NavIconButton
        onClick={toggleTheme}
        title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
      >
        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        <span style={labelStyle}>{t('nav.theme')}</span>
      </NavIconButton>
      <NavIconLink to="/about" title={t('nav.about')}>
        <Info className="w-4 h-4" />
        <span style={labelStyle}>{t('nav.about')}</span>
      </NavIconLink>
      <NavIconLink to="/upgrade" title={t('nav.upgrade')} variant="brand">
        <Zap className="w-4 h-4" />
        <span style={labelStyle}>{t('nav.upgrade')}</span>
      </NavIconLink>
      <AuthMenu />
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
        <BarChart3 className="w-5 h-5 shrink-0" />
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '0.2px', minWidth: 72 }}>
          {t('nav.brandName')}
        </span>
      </Link>
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
