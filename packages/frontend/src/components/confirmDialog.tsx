import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/uiComponents';

interface ConfirmRequest {
  message: string;
  onConfirm: () => void;
  danger?: boolean;
}
export function useConfirmDialog() {
  const { t } = useTranslation();
  const [req, setReq] = useState<ConfirmRequest | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const confirm = useCallback(
    (message: string, onConfirm: () => void, danger = false) =>
      setReq({ message, onConfirm, danger }),
    [],
  );
  const close = useCallback(() => setReq(null), []);
  const run = () => {
    const r = req;
    close();
    r?.onConfirm();
  };
  useEffect(() => {
    if (!req) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req, close]);
  const dialog = req ? (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-app/70 backdrop-blur-sm p-4"
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={req.message}
        className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 shadow-lg"
      >
        <p className="text-body text-fg leading-relaxed">{req.message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" size="sm" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button variant={req.danger ? 'danger' : 'primary'} size="sm" onClick={run}>
            {t('Confirm')}
          </Button>
        </div>
      </div>
    </div>
  ) : null;
  return [dialog, confirm] as const;
}
