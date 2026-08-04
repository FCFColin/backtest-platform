import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../../../packages/frontend/src/components/errorBoundaries.js';

vi.mock('../../../packages/frontend/src/i18n/index.js', () => ({
  default: {
    t: (key: string) => key,
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
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    expect(
      screen.getByText(
        'Sorry, the page encountered an error. Please refresh. If the problem persists, contact the administrator.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Refresh page')).toBeTruthy();
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
    // eslint-disable-next-line no-console -- 断言错误上报被触发
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

    fireEvent.click(screen.getByText('Refresh page'));
    expect(reload).toHaveBeenCalledOnce();
  });
});
