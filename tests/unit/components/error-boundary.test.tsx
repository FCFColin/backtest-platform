/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../../packages/frontend/src/components/ErrorBoundary.js';

vi.mock('../../../packages/frontend/src/i18n/index.js', () => ({
  default: {
    t: (key: string) => {
      const map: Record<string, string> = {
        'errors.pageErrorTitle': '页面出错了',
        'errors.pageErrorMessage': '请刷新页面重试',
        'errors.pageRefresh': '刷新页面',
      };
      return map[key] ?? key;
    },
  },
}));

function NormalChild() {
  return <div>正常内容</div>;
}

function BrokenChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('测试错误');
  return <div>正常内容</div>;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ErrorBoundary', () => {
  it('正常渲染子组件', () => {
    render(
      <ErrorBoundary>
        <NormalChild />
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常内容')).toBeTruthy();
  });

  it('捕获错误并显示错误 UI', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('页面出错了')).toBeTruthy();
    expect(screen.getByText('请刷新页面重试')).toBeTruthy();
    expect(screen.getByText('刷新页面')).toBeTruthy();
  });

  it('显示错误信息', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('测试错误')).toBeTruthy();
  });

  it('在捕获错误时调用 console.error', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(console.error).toHaveBeenCalled();
  });

  it('刷新按钮调用 window.location.reload', () => {
    const reload = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { reload },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>,
    );

    fireEvent.click(screen.getByText('刷新页面'));
    expect(reload).toHaveBeenCalledOnce();
  });
});
