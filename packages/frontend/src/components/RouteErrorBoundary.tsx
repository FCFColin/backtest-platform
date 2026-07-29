/**
 * @file 路由级错误边界组件
 * @description 捕获单个路由子树的渲染异常，展示上下文相关的降级 UI 与重试按钮。
 *   相较于顶层 ErrorBoundary（整页降级），RouteErrorBoundary 仅隔离当前路由，
 *   避免单页崩溃导致整站白屏，并允许用户就地重试。
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n/index.js';
import { reportError } from '../utils/errorReporter.js';

/**
 * RouteErrorBoundary 组件的 Props。
 */
interface RouteErrorBoundaryProps {
  /** 子组件树，将被错误边界包裹。 */
  children: ReactNode;
  /** 路由名称，用于错误上下文与日志归因。 */
  routeName?: string;
}

/**
 * RouteErrorBoundary 组件的 State。
 */
interface RouteErrorBoundaryState {
  /** 是否已捕获到渲染异常。true 时显示错误 UI。 */
  hasError: boolean;
  /** 捕获到的错误对象。 */
  error: Error | null;
  /** 用于强制重新挂载子树的 nonce，重试时递增。 */
  resetKey: number;
}

/** 容器样式：紧凑卡片，不占满整屏 */
const ROUTE_ERROR_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '320px',
  padding: '32px 24px',
  margin: '24px auto',
  maxWidth: '640px',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: 'var(--text-strong)',
  textAlign: 'center',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-soft)',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-card)',
};

const ROUTE_RETRY_BTN_STYLE: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--brand-fg)',
  backgroundColor: 'hsl(var(--brand))',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
};

const ROUTE_ERROR_DETAIL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: 'hsl(var(--fg-tertiary))',
  margin: '8px 0 16px',
  maxWidth: '500px',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
};

/**
 * 路由级 React 错误边界组件。
 *
 * 捕获单个路由子树的渲染异常，展示上下文相关的降级 UI 与「重试」按钮。
 * 重试时会递增 resetKey 强制重新挂载子组件树，无需整页刷新。
 *
 * @param props - 组件属性
 * @param props.children - 被包裹的路由组件
 * @param props.routeName - 路由名称，用于错误归因
 *
 * @example
 * ```tsx
 * <RouteErrorBoundary routeName="backtest">
 *   <BacktestPage />
 * </RouteErrorBoundary>
 * ```
 */
export default class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
  }

  /**
   * 在子组件抛出错误时更新 state，触发错误 UI 渲染。
   */
  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { hasError: true, error };
  }

  /**
   * 捕获错误信息并上报。
   *
   * @param error - 抛出的错误对象。
   * @param errorInfo - React 组件栈信息。
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      component: 'RouteErrorBoundary',
      action: 'componentDidCatch',
      routeName: this.props.routeName,
      componentStack: errorInfo.componentStack,
    });
  }

  /**
   * 重置错误状态并强制重新挂载子组件树，用于就地恢复。
   */
  private handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1,
    }));
  };

  render(): ReactNode {
    if (this.state.hasError) return this.renderErrorUI();
    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }

  private renderErrorUI(): ReactNode {
    const routeName = this.props.routeName;
    const title = routeName
      ? i18n.t('errors.routeErrorTitle', { route: routeName })
      : i18n.t('errors.pageErrorTitle');
    return (
      <div style={ROUTE_ERROR_STYLE} role="alert" aria-live="assertive">
        <div style={{ fontSize: '36px', marginBottom: '12px' }} role="img" aria-hidden="true">
          ⚠️
        </div>
        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px' }}>{title}</h2>
        <p
          style={{
            fontSize: '14px',
            color: 'hsl(var(--fg-secondary))',
            margin: '0 0 12px',
            maxWidth: '420px',
          }}
        >
          {i18n.t('errors.routeErrorMessage')}
        </p>
        {this.state.error && (
          <p style={ROUTE_ERROR_DETAIL_STYLE}>
            {this.state.error.message?.slice(0, 200) || String(this.state.error).slice(0, 200)}
          </p>
        )}
        <button type="button" onClick={this.handleRetry} style={ROUTE_RETRY_BTN_STYLE}>
          {i18n.t('errors.routeRetry')}
        </button>
      </div>
    );
  }
}
