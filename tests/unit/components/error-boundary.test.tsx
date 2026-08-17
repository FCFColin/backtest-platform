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
    screen.getByText('正常内容');
  });

  it('捕获错误并显示通用错误 UI，不泄露错误详情', () => {
    render(
      <ErrorBoundary>
        <BrokenChild shouldThrow={true} />
      </ErrorBoundary>,
    );
    screen.getByText('Something went wrong');
    screen.getByText('Refresh page');
    expect(screen.queryByText('测试错误')).toBeNull();
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
