import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wifi, WifiOff } from 'lucide-react';
const BACK_ONLINE_DURATION_MS = 3000;
export function OfflineBanner() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [justCameBack, setJustCameBack] = useState(false);
  const timerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setJustCameBack(false);
    };
    const handleOnline = () => {
      setIsOffline(false);
      setJustCameBack(true);
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
      timerRef.current = window.setTimeout(() => setJustCameBack(false), BACK_ONLINE_DURATION_MS);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      if (timerRef.current !== undefined) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);
  if (!isOffline && !justCameBack) return null;
  const isBack = !isOffline && justCameBack;
  return (
    <div role="status" aria-live="polite" className={isBack ? 'flex items-center justify-center gap-2 bg-success px-4 py-2 text-body text-white' : 'flex items-center justify-center gap-2 bg-danger px-4 py-2 text-body text-white'}>
      {isBack ? <Wifi className="size-4" aria-hidden="true" /> : <WifiOff className="size-4" aria-hidden="true" />}
      <span>{isBack ? t('common.backOnline') : t('common.offlineBanner')}</span>
    </div>
  );
}
export default OfflineBanner;
