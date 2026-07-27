/**
 * @file 顶部导航栏
 * @description 平台主导航栏：3 分组下拉 + 3 直达链接 + 工具区 + 认证区。
 *   暗色金融平台主题，sticky 定位，bg-app/95 backdrop-blur-md。
 *   移动端通过 Sheet 折叠导航分组。
 */
import { useState, useEffect, startTransition } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Menu, Sun, ChevronDown, Languages, MoonStar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/hooks/useTheme';
import { useBacktestStore } from '@/store/backtestStore';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { NAV_GROUP_KEYS, NavGroup } from './NavGroupMenu.js';
import { PlanBadge } from './PlanBadge.js';
import { NotificationBell } from './NotificationBell.js';

/** 直达导航链接样式 */
const navLinkClass =
  'px-3 py-2 text-body font-medium text-fg-secondary hover:text-fg rounded-md hover:bg-hover transition-colors duration-150';

/** 直达导航链接列表 */
const DIRECT_LINKS = [
  { to: '/data-engine', key: 'dataEngine' },
  { to: '/about', key: 'docs' },
  { to: '/pricing', key: 'pricing' },
] as const;

/**
 * 导航分组容器：横向（桌面）或纵向（移动端 Sheet 内）渲染所有 NavGroup。
 * @param props - openGroup/isActive/onToggle/t/className。
 * @returns 导航分组容器元素。
 */
function NavGroupsContainer({
  openGroup,
  isActive,
  onToggle,
  t,
  className,
}: {
  openGroup: string;
  isActive: (to: string) => boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
  className?: string;
}) {
  return (
    <div data-testid="nav-group" className={cn('flex items-center gap-1', className)}>
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

/**
 * 顶部导航栏组件（sticky 定位）。
 * @returns 固定在视口顶部的导航栏元素。
 */
export default function Navbar() {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const baseCurrency = useBacktestStore(useShallow((s) => s.parameters.baseCurrency));
  const updateParameter = useBacktestStore((s) => s.updateParameter);

  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup('');
  }, [location.pathname]);

  const isActive = (to: string) => location.pathname === to;

  const toggleCurrency = () => {
    updateParameter('baseCurrency', baseCurrency === 'usd' ? 'cny' : 'usd');
  };

  return (
    <nav className="sticky top-0 z-50 h-15 border-b border-border-subtle bg-app/95 backdrop-blur-md">
      <div className="max-w-[1440px] mx-auto h-full px-6 flex items-center gap-4">
        {/* 移动端汉堡菜单 */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="icon" size="icon" className="md:hidden" aria-label="Menu">
              <Menu />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-4">
            <SheetTitle className="text-h2 text-fg">{t('nav.brandName')}</SheetTitle>
            <NavGroupsContainer
              openGroup={openGroup}
              isActive={isActive}
              onToggle={setOpenGroup}
              t={t}
              className="mt-6 flex-col items-stretch gap-1"
            />
            <div className="mt-4 flex flex-col gap-1">
              {DIRECT_LINKS.map((link) => (
                <Link key={link.to} to={link.to} className={navLinkClass} data-testid="nav-direct">
                  {t(`nav.${link.key}`)}
                </Link>
              ))}
            </div>
          </SheetContent>
        </Sheet>

        {/* 左侧品牌区 */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            className="flex items-center gap-2 text-fg transition-colors duration-150 ease-out-quart hover:text-brand"
          >
            <BarChart3 className="size-5 text-brand" />
            <span className="text-h2 font-bold tracking-tight text-fg">{t('nav.brandName')}</span>
          </Link>
          <PlanBadge tier="free" />
        </div>

        {/* 中间弹性空间 */}
        <div className="flex-1" />

        {/* 中央导航 - 3 分组 + 直达链接 */}
        <div className="hidden md:flex items-center gap-1">
          <NavGroupsContainer
            openGroup={openGroup}
            isActive={isActive}
            onToggle={setOpenGroup}
            t={t}
          />
          {DIRECT_LINKS.map((link) => (
            <Link key={link.to} to={link.to} className={navLinkClass} data-testid="nav-direct">
              {t(`nav.${link.key}`)}
            </Link>
          ))}
        </div>

        {/* 分隔线 */}
        <div className="hidden md:block w-px h-6 bg-border" />

        {/* 右侧工具区 */}
        <div className="flex items-center gap-1">
          {/* 语言切换 */}
          <Button
            variant="icon"
            size="sm"
            onClick={() =>
              startTransition(() => void i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN'))
            }
            title={t('lang.switchLang')}
            aria-label={t('lang.switchLang')}
            className="gap-1 px-2"
            data-testid="language-selector"
          >
            <Languages className="size-4" />
            <span className="text-caption">{i18n.language === 'zh-CN' ? 'ZH' : 'EN'}</span>
          </Button>

          {/* 主题切换 */}
          <Button
            variant="icon"
            size="icon"
            onClick={toggleTheme}
            title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
            aria-label={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Sun /> : <MoonStar />}
          </Button>

          {/* 货币切换 */}
          <Button
            variant="secondary"
            size="sm"
            onClick={toggleCurrency}
            title={t('lang.switchCurrency')}
            aria-label={t('lang.switchCurrency')}
            data-testid="currency-selector"
          >
            {baseCurrency === 'usd' ? 'USD' : 'CNY'}
            <ChevronDown className="size-3" />
          </Button>

          {/* 分隔线 */}
          <div className="w-px h-6 bg-border mx-1" />

          {/* 通知铃铛 */}
          <NotificationBell />

          {/* 分隔线 */}
          <div className="w-px h-6 bg-border mx-1" />

          {/* 认证区 */}
          <Link to="/auth/login">
            <Button variant="ghost" size="sm">
              {t('auth.login.submit')}
            </Button>
          </Link>
          <Link to="/auth/signup">
            <Button variant="secondary" size="sm">
              {t('auth.signup.submit')}
            </Button>
          </Link>
        </div>
      </div>
    </nav>
  );
}
