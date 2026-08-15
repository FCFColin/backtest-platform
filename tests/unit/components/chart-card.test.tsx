import { describe, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChartCard from '../../../packages/frontend/src/components/ChartCard.js';

describe('ChartCard', () => {
  it('渲染标题和子内容', () => {
    render(
      <ChartCard title="测试图表" data={[]}>
        <div>图表内容</div>
      </ChartCard>,
    );
    screen.getByText('测试图表');
    screen.getByText('图表内容');
  });

  it('渲染 headerExtra 内容', () => {
    render(
      <ChartCard title="测试图表" data={[]} headerExtra={<button>额外操作</button>}>
        <div>图表内容</div>
      </ChartCard>,
    );
    screen.getByText('额外操作');
  });

  it('渲染复杂子元素', () => {
    render(
      <ChartCard title="回撤" data={[{ date: '2024-01', value: 100 }]} csvFilename="drawdown">
        <div data-testid="chart">图表区域</div>
      </ChartCard>,
    );
    screen.getByTestId('chart');
  });
});
