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
  textAlign: 'center'
};
const STYLE_TAG = <style>{`.error-refresh-btn:hover { background-color: var(--brand-hover) !important; }`}</style>;
const ERROR_DETAIL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--text-muted)',
  margin: '0 0 16px',
  maxWidth: '500px',
  wordBreak: 'break-word',
  fontFamily: 'monospace'
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
  transition: 'background-color 0.2s'
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
      componentStack: errorInfo.componentStack
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
          <div style={{ fontSize: '48px', marginBottom: '16px' }} role="img" aria-label={i18n.t('components.errorBoundary.errorAlert')}>
            ⚠️
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>{i18n.t('errors.pageErrorTitle')}</h1>
          <p
            style={{
              fontSize: '14px',
              color: 'var(--text-muted)',
              margin: '0 0 24px',
              maxWidth: '400px'
            }}
          >
            {i18n.t('errors.pageErrorMessage')}
          </p>
          {this.state.error && <p style={ERROR_DETAIL_STYLE}>{this.state.error.message?.slice(0, 200) || String(this.state.error).slice(0, 200)}</p>}
          <button type="button" onClick={this.handleRefresh} style={REFRESH_BTN_STYLE} className="error-refresh-btn">
            {i18n.t('errors.pageRefresh')}
          </button>
        </div>
      </>
    );
  }
}
