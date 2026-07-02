/**
 * @file 错误边界组件
 * @description 捕获子组件树渲染异常，展示降级 UI 防止整页白屏
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * ErrorBoundary 组件的 Props。
 */
interface ErrorBoundaryProps {
  /** 子组件树，将被错误边界包裹。 */
  children: ReactNode;
}

/**
 * ErrorBoundary 组件的 State。
 */
interface ErrorBoundaryState {
  /** 是否已捕获到渲染异常。true 时显示错误 UI。 */
  hasError: boolean;
  /** 捕获到的错误对象。 */
  error: Error | null;
}

/**
 * React 错误边界组件。
 *
 * 捕获子组件树在渲染、生命周期及构造函数中抛出的 JavaScript 错误，
 * 并展示友好的错误提示页面，避免整个应用白屏崩溃。
 *
 * 注意：错误边界不会捕获事件回调、异步代码、SSR 或错误边界自身的错误。
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 */
const ERROR_CONTAINER_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  padding: '24px',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  color: '#1f2937',
  textAlign: 'center',
};

const ERROR_DETAIL_STYLE: React.CSSProperties = {
  fontSize: '12px',
  color: '#9ca3af',
  margin: '0 0 16px',
  maxWidth: '500px',
  wordBreak: 'break-word',
  fontFamily: 'monospace',
};

const REFRESH_BTN_STYLE: React.CSSProperties = {
  padding: '10px 24px',
  fontSize: '14px',
  fontWeight: 500,
  color: '#ffffff',
  backgroundColor: '#2563eb',
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

  /**
   * 在子组件抛出错误时更新 state，触发错误 UI 渲染。
   */
  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  /**
   * 捕获错误信息，可用于上报日志。
   *
   * @param error - 抛出的错误对象。
   * @param errorInfo - React 组件栈信息。
   */
  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // 前端错误日志输出到浏览器控制台（前端标准日志位置）
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  /**
   * 刷新当前页面，用于从错误状态恢复。
   */
  private handleRefresh = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) return this.renderErrorUI();
    return this.props.children;
  }

  private renderErrorUI(): ReactNode {
    return (
      <div style={ERROR_CONTAINER_STYLE}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }} role="img" aria-label="出错提示">
          ⚠️
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 600, margin: '0 0 8px' }}>页面出错了</h1>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 24px', maxWidth: '400px' }}>
          抱歉，页面遇到了问题。请刷新页面，如果问题持续存在，请联系管理员。
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
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#1d4ed8';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#2563eb';
          }}
        >
          刷新页面
        </button>
      </div>
    );
  }
}
