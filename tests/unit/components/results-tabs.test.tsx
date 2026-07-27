/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultsTabsV2 } from '../../../packages/frontend/src/components/results/ResultsTabsV2.js';

beforeEach(() => {
  localStorage.clear();
});

describe('ResultsTabsV2', () => {
  it('渲染 6 个一级 Tab', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    expect(screen.getByText('概览')).toBeTruthy();
    expect(screen.getByText('指标')).toBeTruthy();
    expect(screen.getByText('回撤')).toBeTruthy();
    expect(screen.getByText('收益')).toBeTruthy();
    expect(screen.getByText('现金流')).toBeTruthy();
    expect(screen.getByText('高级')).toBeTruthy();
  });

  it('点击 Tab 切换', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('回撤'));
    expect(screen.getByText('回撤片段')).toBeTruthy();
    expect(screen.getByText('回撤分析')).toBeTruthy();
  });

  it('概览 Tab 无二级 Tab', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('概览'));
    expect(screen.queryByText('统计指标')).toBeNull();
  });

  it('指标 Tab 有 3 个二级 Tab', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('指标'));
    expect(screen.getByText('统计指标')).toBeTruthy();
    expect(screen.getByText('自定义指标')).toBeTruthy();
    expect(screen.getByText('扩展指标')).toBeTruthy();
  });

  it('Tab 状态保存到 localStorage', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('收益'));
    const saved = localStorage.getItem('results-tabs-state');
    expect(saved).toBeTruthy();
    expect(JSON.parse(saved!).primary).toBe('returns');
  });

  it('渲染 children 内容', () => {
    render(
      <ResultsTabsV2>
        {(primary) => <div data-testid="content">{primary}</div>}
      </ResultsTabsV2>,
    );
    expect(screen.getByTestId('content')).toBeTruthy();
    expect(screen.getByTestId('content').textContent).toBe('summary');
  });
});
