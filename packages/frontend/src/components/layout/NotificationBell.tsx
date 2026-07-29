/**
 * @file NotificationBell 组件
 * @description Bell 图标 + 未读红点 + Sheet 右侧抽屉展示公告列表。
 *   markAllRead 逻辑通过 localStorage 记录已读。
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet.js';
import { Button } from '@/components/ui/button.js';
import { useAnnouncements } from '@/hooks/useAnnouncements.js';

/**
 * 通知铃铛组件。
 * @returns 铃铛按钮 + Sheet 抽屉。
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const { announcements, unreadCount, markAllRead } = useAnnouncements();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v && unreadCount > 0) {
      markAllRead();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 relative"
          aria-label="Notifications"
          data-testid="notification-bell"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-danger animate-pulse" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[400px] p-0">
        <SheetHeader className="p-4 border-b border-border">
          <div className="flex items-center justify-between">
            <SheetTitle>{t('notifications.title')}</SheetTitle>
            <span className="text-caption text-fg-tertiary">{t('notifications.latest')}</span>
          </div>
        </SheetHeader>
        <div className="overflow-y-auto max-h-[calc(100dvh-4rem)]">
          {announcements.length === 0 ? (
            <div className="p-8 text-center text-caption text-fg-tertiary">{t('notifications.empty')}</div>
          ) : (
            announcements.map((ann) => (
              <div
                key={ann.id}
                className="p-4 border-b border-border-subtle hover:bg-hover/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-label-tiny text-fg-tertiary">#{ann.slug}</span>
                  <time className="text-caption text-fg-tertiary font-mono">{ann.publishedAt}</time>
                </div>
                <h4 className="text-body font-semibold mb-1">{ann.title}</h4>
                <p className="text-caption text-fg-secondary leading-relaxed mb-2">{ann.body}</p>
                {ann.ctaLabel && ann.ctaLink && (
                  <Link
                    to={ann.ctaLink}
                    className="text-caption text-brand hover:underline flex items-center gap-1"
                  >
                    {ann.ctaLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
