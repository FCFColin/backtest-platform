import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n/index.js';
import { reportError } from '../utils/errorReporter.js';
import { Button } from './ui/uiComponents.js';

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
  color: 'hsl(var(--fg))',
  textAlign: 'center',
};
const ERROR_DETAIL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: 'hsl(var(--fg-tertiary))',
  margin: '0 0 16px',
  maxWidth: '500px',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
};
export function ErrorFallback({
  title,
  description,
  error,
  actionLabel,
  onAction,
  headingSize,
  containerStyle,
}: {
  title: string;
  description: string;
  error: Error | null;
  actionLabel: string;
  onAction: () => void;
  headingSize: number;
  containerStyle: React.CSSProperties;
}) {
  return (
    <div style={containerStyle} role="alert">
      <div style={{ fontSize: `${headingSize * 2}px`, marginBottom: '12px' }} aria-hidden="true">
        ⚠️
      </div>
      <h2 style={{ fontSize: `${headingSize}px`, fontWeight: 600, margin: '0 0 8px' }}>{title}</h2>
      <p
        style={{
          fontSize: '14px',
          color: 'hsl(var(--fg-tertiary))',
          margin: '0 0 16px',
          maxWidth: '420px',
        }}
      >
        {description}
      </p>
      {error && (
        <p style={ERROR_DETAIL_STYLE}>
          {error.message?.slice(0, 200) || String(error).slice(0, 200)}
        </p>
      )}
      <Button variant="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}
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
      <ErrorFallback
        containerStyle={ERROR_CONTAINER_STYLE}
        title={i18n.t('Something went wrong')}
        description={i18n.t(
          'Sorry, the page encountered an error. Please refresh. If the problem persists, contact the administrator.',
        )}
        error={this.state.error}
        actionLabel={i18n.t('Refresh page')}
        onAction={this.handleRefresh}
        headingSize={24}
      />
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
  color: 'hsl(var(--fg))',
  textAlign: 'center',
  background: 'hsl(var(--surface))',
  border: '1px solid hsl(var(--border-subtle))',
  borderRadius: '12px',
  boxShadow: 'var(--shadow-card)',
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
      <ErrorFallback
        containerStyle={ROUTE_ERROR_STYLE}
        title={title}
        description={i18n.t(
          'Something went wrong while rendering this page. You can retry without reloading the whole app.',
        )}
        error={this.state.error}
        actionLabel={i18n.t('Retry')}
        onAction={this.handleRetry}
        headingSize={18}
      />
    );
  }
}
