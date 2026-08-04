import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RunBacktestButton } from '../../../packages/frontend/src/components/portfolioEditor/portfolioEditor.js';

describe('RunBacktestButton', () => {
  it('idle 状态显示运行回测按钮', () => {
    render(<RunBacktestButton onRun={() => {}} isRunning={false} runComplete={false} />);
    expect(screen.getByText('Run Backtest')).toBeTruthy();
  });

  it('running 状态显示回测中', () => {
    render(<RunBacktestButton onRun={() => {}} isRunning={true} runComplete={false} />);
    expect(screen.getByText('Backtesting...')).toBeTruthy();
  });

  it('complete 状态显示完成', () => {
    render(<RunBacktestButton onRun={() => {}} isRunning={false} runComplete={true} />);
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('complete 状态显示耗时', () => {
    render(
      <RunBacktestButton onRun={() => {}} isRunning={false} runComplete={true} elapsedMs={1500} />,
    );
    expect(screen.getByText('1.5s complete')).toBeTruthy();
  });

  it('complete 状态 3 秒后消失', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <RunBacktestButton onRun={() => {}} isRunning={false} runComplete={false} />,
    );
    rerender(<RunBacktestButton onRun={() => {}} isRunning={false} runComplete={true} />);
    expect(screen.getByText('Complete')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.queryByText('Complete')).toBeNull();
    vi.useRealTimers();
  }, 10000);

  it('点击 idle 按钮触发 onRun', () => {
    const onRun = vi.fn();
    render(<RunBacktestButton onRun={onRun} isRunning={false} runComplete={false} />);
    fireEvent.click(screen.getByText('Run Backtest'));
    expect(onRun).toHaveBeenCalledOnce();
  });
});
