import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DrawdownEpisodes } from '../../../packages/frontend/src/components/results/DrawdownEpisodes.js';
import type { DrawdownEpisode } from '@backtest/shared/types/backtest.js';

vi.mock('react-i18next', async () => (await import('../../helpers/i18nMock.js')).i18nMock);

const makeEpisode = (overrides: Partial<DrawdownEpisode> = {}): DrawdownEpisode => ({
  peakDate: '2022-01-03',
  troughDate: '2022-06-16',
  recoveryDate: '2022-08-10',
  depth: -0.15,
  timeToTrough: 164,
  recoveryTime: 55,
  totalTimeDurationDays: 219,
  recoveryFactor: 1.2,
  cagrDuring: -0.05,
  ulcerDuring: 8.5,
  ...overrides,
});

const episodes: DrawdownEpisode[] = [
  makeEpisode({ depth: -0.25, peakDate: '2020-02-19', troughDate: '2020-03-23', recoveryDate: '2020-08-18', totalTimeDurationDays: 181, timeToTrough: 33, recoveryTime: 148 }),
  makeEpisode({ depth: -0.12, peakDate: '2022-01-03', troughDate: '2022-06-16', recoveryDate: '2022-08-10', totalTimeDurationDays: 219, timeToTrough: 164, recoveryTime: 55 }),
  makeEpisode({ depth: -0.05, peakDate: '2023-07-31', troughDate: '2023-10-27', recoveryDate: '2023-12-12', totalTimeDurationDays: 134, timeToTrough: 88, recoveryTime: 46 }),
];

describe('DrawdownEpisodes', () => {
  it('渲染面板标题和汇总', () => {
    render(<DrawdownEpisodes episodes={episodes} />);
    screen.getByText('Drawdown Episodes');
    screen.getByText('3');
  });

  it('默认按深度排序，最深回撤排第一', () => {
    render(<DrawdownEpisodes episodes={episodes} />);
    const depths = screen.getAllByText(/^-?\d+\.\d+%$/);
    expect(depths[0].textContent).toBe('-25.00%');
  });

  it('按持续时间排序', () => {
    render(<DrawdownEpisodes episodes={episodes} />);
    fireEvent.change(screen.getByTestId('sort-selector'), { target: { value: 'duration' } });
    const durations = screen.getAllByText(/days|mo|y/);
    expect(durations.length).toBeGreaterThan(0);
  });

  it('按恢复因子排序', () => {
    render(<DrawdownEpisodes episodes={episodes} />);
    fireEvent.change(screen.getByTestId('sort-selector'), { target: { value: 'recovery' } });
    expect(screen.getAllByTestId('episode-duration').length).toBe(3);
  });

  it.each(['severe', 'moderate', 'mild'] as const)('严重度筛选：%s', (severity) => {
    render(<DrawdownEpisodes episodes={episodes} />);
    fireEvent.change(screen.getByTestId('filter-severity'), { target: { value: severity } });
    expect(screen.getAllByText(/Recovered|Ongoing/)).toHaveLength(1);
  });

  it('展开行显示详情', () => {
    render(<DrawdownEpisodes episodes={episodes} />);
    const buttons = screen.getAllByRole('button');
    const firstEpisode = buttons.find((b) => b.textContent?.includes('-25.00%'));
    fireEvent.click(firstEpisode!);
    screen.getByText('Time to Trough');
    screen.getByText('Recovery Time');
    screen.getByText('Recovery Factor');
  });

  it('Show more 按钮加载更多', () => {
    const many = Array.from({ length: 8 }, (_, i) =>
      makeEpisode({ depth: -(0.05 + i * 0.03), peakDate: `202${i}-01-01` }),
    );
    render(<DrawdownEpisodes episodes={many} />);
    expect(screen.getAllByText(/Recovered|Ongoing/)).toHaveLength(5);
    fireEvent.click(screen.getByTestId('show-more-episodes'));
    expect(screen.getAllByText(/Recovered|Ongoing/)).toHaveLength(8);
  });

  it('空 episodes 渲染汇总但无行', () => {
    const { container } = render(<DrawdownEpisodes episodes={[]} />);
    screen.getByText('Drawdown Episodes');
    expect(screen.queryByTestId('drawdown-timeline')).toBeNull();
    expect(container.querySelectorAll('[data-testid="episode-status"]')).toHaveLength(0);
  });
});
