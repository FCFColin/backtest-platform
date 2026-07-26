/**
 * @file Account Sheet 抽屉
 * @description P3-4: Navbar 右上角点头像弹出 Sheet 抽屉（保持在当前页）。
 *   显示用户信息 + plan + Quick actions。
 */
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { LogOut, User, Crown, Settings } from 'lucide-react';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

/**
 * Account 抽屉组件。点击头像弹出，显示用户信息和快捷操作。
 * @returns Account Sheet 元素
 */
export function AccountSheet({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent side="right" className="w-[320px]">
        <SheetTitle className="text-h2 text-fg">{t('account.title')}</SheetTitle>
        <div className="mt-4 flex flex-col gap-2">
          <Link to="/workspace">
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <User className="mr-2 size-4" />
              {t('account.myWorkspace')}
            </Button>
          </Link>
          <Link to="/account">
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Settings className="mr-2 size-4" />
              {t('account.settings')}
            </Button>
          </Link>
          <Link to="/pricing">
            <Button variant="ghost" size="sm" className="w-full justify-start">
              <Crown className="mr-2 size-4" />
              {t('account.upgrade')}
            </Button>
          </Link>
          <div className="h-px bg-border-subtle my-2" />
          <Button
            variant="destructive"
            size="sm"
            className="w-full justify-start"
            onClick={() => {
              window.location.href = '/api/v1/auth/logout';
            }}
          >
            <LogOut className="mr-2 size-4" />
            {t('account.signOut')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
