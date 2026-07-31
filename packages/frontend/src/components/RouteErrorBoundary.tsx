import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n/index.js';
import { reportError } from '../utils/errorReporter.js';
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
  boxShadow: 'var(--shadow-card)'
};
const ROUTE_RETRY_BTN_STYLE: React.CSSProperties = {
  padding: '8px 20px',
  fontSize: '14px',
  fontWeight: 500,
  color: 'var(--brand-fg)',
  backgroundColor: 'hsl(var(--brand))',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer'
};
const ROUTE_ERROR_DETAIL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: 'hsl(var(--fg-tertiary))',
  margin: '8px 0 16px',
  maxWidth: '500px',
  wordBreak: 'break-word',
  fontFamily: 'monospace'
};
export default class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
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
      componentStack: errorInfo.componentStack
    });
  }
  private handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      resetKey: prev.resetKey + 1
    }));
  };
  render(): ReactNode {
    if (this.state.hasError) return this.renderErrorUI();
    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
  private renderErrorUI(): ReactNode {
    const routeName = this.props.routeName;
    const title = routeName ? i18n.t('errors.routeErrorTitle', { route: routeName }) : i18n.t('errors.pageErrorTitle');
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
            maxWidth: '420px'
          }}
        >
          {i18n.t('errors.routeErrorMessage')}
        </p>
        {this.state.error && <p style={ROUTE_ERROR_DETAIL_STYLE}>{this.state.error.message?.slice(0, 200) || String(this.state.error).slice(0, 200)}</p>}
        <button type="button" onClick={this.handleRetry} style={ROUTE_RETRY_BTN_STYLE}>
          {i18n.t('errors.routeRetry')}
        </button>
      </div>
    );
  }
}
