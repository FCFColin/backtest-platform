/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ResultsTabsV2 } from '../../../packages/frontend/src/components/results/ResultsTabsV2.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('ResultsTabsV2', () => {
  it('渲染 6 个一级 Tab', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    expect(screen.getByText('results.tabs.summary')).toBeTruthy();
    expect(screen.getByText('results.tabs.metrics')).toBeTruthy();
    expect(screen.getByText('results.tabs.drawdowns')).toBeTruthy();
    expect(screen.getByText('results.tabs.returns')).toBeTruthy();
    expect(screen.getByText('results.tabs.cashflows')).toBeTruthy();
    expect(screen.getByText('results.tabs.advanced')).toBeTruthy();
  });

  it('点击 Tab 切换', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('results.tabs.drawdowns'));
    expect(screen.getByText('results.tabs.episodes')).toBeTruthy();
    expect(screen.getByText('results.tabs.analysis')).toBeTruthy();
  });

  it('概览 Tab 无二级 Tab', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('results.tabs.summary'));
    expect(screen.queryByText('results.tabs.stats')).toBeNull();
  });

  it('指标 Tab 有 3 个二级 Tab', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('results.tabs.metrics'));
    expect(screen.getByText('results.tabs.stats')).toBeTruthy();
    expect(screen.getByText('results.tabs.custom')).toBeTruthy();
    expect(screen.getByText('results.tabs.extended')).toBeTruthy();
  });

  it('Tab 状态保存到 localStorage', () => {
    render(<ResultsTabsV2>{() => null}</ResultsTabsV2>);
    fireEvent.click(screen.getByText('results.tabs.returns'));
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