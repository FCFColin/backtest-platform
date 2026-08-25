import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, TriangleAlert, ChevronDown } from 'lucide-react';
import type { WarningInfo } from '@/utils/errorReporter.js';

/**
 * U-1 数据质量校验徽章：把"数字可验证"工程纪律翻译为结果页常驻信任信号。
 * 绿=本次回测无任何结构化 warning；黄=存在降级/缺失，可展开逐条明细。
 */
export function DataQualityBadge({ warnings }: { warnings: WarningInfo[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const degraded = warnings.length > 0;
  if (!degraded)
    return (
      <div
        role="status"
        className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface px-3 py-1 text-caption text-fg-secondary"
        data-testid="dq-badge-ok"
      >
        <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden />
        <span>{t('Data quality verified')}</span>
      </div>
    );
  return (
    <div
      className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-caption"
      data-testid="dq-badge-warn"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex w-full items-center gap-1.5 text-left text-warning"
      >
        <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="flex-1">
          {t('{{count}} data quality notice(s)', { count: warnings.length })}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>
      {open && (
        <ul className="mt-2 space-y-1 pl-5 text-fg-secondary">
          {warnings.map((w, i) => (
            <li key={i}>
              {w.message ?? t('Data quality notice')}
              {w.tickers?.length ? `: ${w.tickers.join(', ')}` : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
