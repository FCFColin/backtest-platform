/**
 * @file 顶部导航栏
 * @description 平台主导航栏，对标 testfol.io 风格：汉堡菜单、Logo、PUBLIC 标签、
 *   导航分组菜单、语言/主题/货币切换、Create Free Account 按钮。暗色金融平台主题，
 *   使用 shadcn Button/Badge/Sheet 与设计 token。移动端通过 Sheet 折叠导航分组。
 */
import { useState, useEffect, startTransition } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { BarChart3, Menu, Sun, Moon, Globe, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useTheme } from '@/hooks/useTheme';
import { useBacktestStore } from '@/store/backtestStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { NAV_GROUP_KEYS, NavGroup } from './NavGroupMenu.js';

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
    <div className={cn('flex items-center gap-1', className)}>
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
 * 导航工具条：语言切换、主题切换、货币切换、Create Free Account 按钮。
 * @param props - theme/toggleTheme/t/i18n。
 * @returns 工具条元素。
 */
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
    <div className="ml-auto flex items-center gap-1">
      <Button
        variant="icon"
        size="icon"
        onClick={() =>
          startTransition(() => i18n.changeLanguage(i18n.language === 'zh-CN' ? 'en' : 'zh-CN'))
        }
        title={t('lang.switchLang')}
        aria-label={t('lang.switchLang')}
      >
        <Globe />
      </Button>
      <Button
        variant="icon"
        size="icon"
        onClick={toggleTheme}
        title={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
        aria-label={theme === 'dark' ? t('nav.switchToLight') : t('nav.switchToDark')}
      >
        {theme === 'dark' ? <Sun /> : <Moon />}
      </Button>
      <Button
        variant="secondary"
        size="sm"
        onClick={toggleCurrency}
        title={t('lang.switchCurrency')}
        aria-label={t('lang.switchCurrency')}
      >
        {baseCurrency === 'usd' ? 'USD' : 'CNY'}
        <ChevronDown className="size-3" />
      </Button>
      <Button variant="primary" size="default" className="ml-1">
        {t('common.createFreeAccount')}
      </Button>
    </div>
  );
}

/**
 * 顶部导航栏组件（固定定位，由 App.tsx 的 main padding-top 偏移补偿）。
 * @returns 固定在视口顶部的导航栏元素。
 */
export default function Navbar() {
  const location = useLocation();
  const [openGroup, setOpenGroup] = useState<string>('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    setMobileOpen(false);
    setOpenGroup('');
  }, [location.pathname]);

  const isActive = (to: string) => location.pathname === to;

  return (
    <nav className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 border-b border-border bg-surface px-4 sm:px-6">
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
        </SheetContent>
      </Sheet>

      <Link
        to="/"
        className="flex items-center gap-2 text-fg transition-colors duration-150 ease-out-quart hover:text-brand"
      >
        <BarChart3 className="size-5 text-brand" />
        <span className="text-h2 text-fg">{t('nav.brandName')}</span>
      </Link>
      <Badge variant="secondary" size="sm" className="uppercase tracking-wider">
        PUBLIC
      </Badge>

      <div className="hidden md:flex">
        <NavGroupsContainer
          openGroup={openGroup}
          isActive={isActive}
          onToggle={setOpenGroup}
          t={t}
          className="ml-4"
        />
      </div>

      <NavToolbar theme={theme} toggleTheme={toggleTheme} t={t} i18n={i18n} />
    </nav>
  );
}
