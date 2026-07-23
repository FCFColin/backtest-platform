/**
 * @file 结果区外壳组件
 * @description 推广自 SignalResultsPanel 的 EmptyResultsHint/AnalysisErrorAlert/WarningBanners
 *              的通用结果区外壳，统一空态/错误态/警告横幅的展示模式。
 *
 * 调用方负责传入 i18n 文本（prefix/text），本组件不假设存在全局 common key。
 */
import { type ReactNode } from 'react';
import ErrorBanner from './ErrorBanner.js';
import type { WarningInfo } from '../utils/errorI18nMap.js';
import type { DateRangeInfo } from '../store/types.js';

/** 错误提示 Props */
interface AnalysisErrorAlertProps {
  /** 错误信息；为 null/undefined 时不渲染 */
  error: string | null | undefined;
  /** 错误前缀/标题，调用方负责传入 i18n 文本（如 t('pca.analysisFailedPrefix')） */
  prefix?: ReactNode;
  /** 自定义 className，默认 'card'；某些页面用 'bt-results-card card' */
  className?: string;
  /** 自定义渲染函数，覆盖默认的 `{prefix}{error}` 格式（用于定制 `：` `: ` 等分隔符） */
  children?: (error: string) => ReactNode;
}

/**
 * 分析失败错误提示
 *
 * 当 error 非空时渲染红色错误卡片。prefix 与 children 互斥：
 * - prefix：直接拼接 `{prefix}{error}`，调用方在 prefix 中包含分隔符
 * - children：完全自定义渲染，可处理 `：` `: ` 等分隔符差异
 */
export function AnalysisErrorAlert({
  error,
  prefix,
  className = 'card',
  children,
}: AnalysisErrorAlertProps) {
  if (!error) return null;
  return (
    <div className={className} style={{ color: 'var(--error)', textAlign: 'center', padding: 24 }}>
      {children ? (
        children(error)
      ) : (
        <>
          {prefix}
          {error}
        </>
      )}
    </div>
  );
}

/** 空结果提示 Props */
interface EmptyResultsHintProps {
  /** 提示文本，调用方负责传入 i18n 文本 */
  text?: ReactNode;
  /** 自定义 className，默认 'card' */
  className?: string;
}

/**
 * 空结果提示
 *
 * 在 results 为 null 且无错误且非加载中时显示的占位卡片。
 */
export function EmptyResultsHint({ text, className = 'card' }: EmptyResultsHintProps) {
  return (
    <div
      className={className}
      style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 48, fontSize: 14 }}
    >
      {text}
    </div>
  );
}

/** WarningBanners Props */
interface WarningBannersProps {
  /** 后端返回的警告列表 */
  warnings: WarningInfo[];
  /** 日期范围信息；clamped/missingTickers 用于生成额外横幅 */
  dateRange: DateRangeInfo | null;
}

/**
 * 警告横幅组
 *
 * 统一渲染日期范围裁剪、缺失标的、其他业务警告三类横幅。
 * 日期范围裁剪横幅会带上 requested/actual 字段供 i18n 插值。
 */
export function WarningBanners({ warnings, dateRange }: WarningBannersProps) {
  const banners: ReactNode[] = [];
  if (dateRange?.clamped) {
    banners.push(
      <ErrorBanner
        key="date-clamped"
        warning={{
          code: 'DATE_RANGE_CLAMPED',
          requestedStart: dateRange.requested.start,
          requestedEnd: dateRange.requested.end,
          actualStart: dateRange.actual.start,
          actualEnd: dateRange.actual.end,
        }}
        variant="info"
      />,
    );
  }
  if (dateRange?.missingTickers && dateRange.missingTickers.length > 0) {
    banners.push(
      <ErrorBanner
        key="missing-tickers"
        warning={{ code: 'TICKER_NOT_FOUND', tickers: dateRange.missingTickers }}
        variant="warning"
      />,
    );
  }
  for (const w of warnings) {
    if (w.code === 'DATE_RANGE_CLAMPED' || w.code === 'TICKER_NOT_FOUND') continue;
    banners.push(<ErrorBanner key={w.code || Math.random()} warning={w} variant="warning" />);
  }
  return <>{banners}</>;
}
