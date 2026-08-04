import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n/index.js';
import { reportError } from '../utils/errorReporter.js';

interface ErrorBoundaryProps {
  children: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}
const ERROR_CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: 'var(--text-strong)',
  textAlign: 'center',
};
const STYLE_TAG = (
  <style>{`.error-refresh-btn:hover { background-color: var(--brand-hover) !important; }`}</style>
);
const ERROR_DETAIL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  margin: '0 0 16px',
  maxWidth: '500px',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
};
const REFRESH_BTN_STYLE: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--bg-elevated)',
  backgroundColor: 'var(--brand)',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  transition: 'background-color 0.2s',
};
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      component: 'ErrorBoundary',
      action: 'componentDidCatch',
      componentStack: errorInfo.componentStack,
    });
  }
  private handleRefresh = (): void => {
    window.location.reload();
  };
  render(): ReactNode {
    if (this.state.hasError) return this.renderErrorUI();
    return this.props.children;
  }
  private renderErrorUI(): ReactNode {
    return (
      <>
        {STYLE_TAG}
        <div style={ERROR_CONTAINER_STYLE}>
          <div
            style={{ fontSize: '48px', marginBottom: '16px' }}
            role="img"
            aria-label={i18n.t('Error')}
          >
            ⚠️
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>
            {i18n.t('Something went wrong')}
          </h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              margin: '0 0 24px',
              maxWidth: '400px',
            }}
          >
            {i18n.t(
              'Sorry, the page encountered an error. Please refresh. If the problem persists, contact the administrator.',
            )}
          </p>
          {this.state.error && (
            <p style={ERROR_DETAIL_STYLE}>
              {this.state.error.message?.slice(0, 200) || String(this.state.error).slice(0, 200)}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleRefresh}
            style={REFRESH_BTN_STYLE}
            className="error-refresh-btn"
          >
            {i18n.t('Refresh page')}
          </button>
        </div>
      </>
    );
  }
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeName?: string;
}
interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetKey: number;
}
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
export class RouteErrorBoundary extends Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
  }
  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    reportError(error, {
      component: 'RouteErrorBoundary',
      action: 'componentDidCatch',
      routeName: this.props.routeName,
      componentStack: errorInfo.componentStack,
    });
  }
  private handleRetry = (): void => {
    this.setState((prev) => ({ hasError: false, error: null, resetKey: prev.resetKey + 1 }));
  };
  render(): ReactNode {
    if (this.state.hasError) return this.renderErrorUI();
    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
  private renderErrorUI(): ReactNode {
    const routeName = this.props.routeName;
    const title = routeName
      ? i18n.t('This section could not load ({{route}})', { route: routeName })
      : i18n.t('Something went wrong');
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
          {i18n.t(
            'Something went wrong while rendering this page. You can retry without reloading the whole app.',
          )}
        </p>
        {this.state.error && (
          <p style={ROUTE_ERROR_DETAIL_STYLE}>
            {this.state.error.message?.slice(0, 200) || String(this.state.error).slice(0, 200)}
          </p>
        )}
        <button type="button" onClick={this.handleRetry} style={ROUTE_RETRY_BTN_STYLE}>
          {i18n.t('Retry')}
        </button>
      </div>
    );
  }
}
