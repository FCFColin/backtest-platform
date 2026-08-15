import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TickerInput from '../../../packages/frontend/src/components/TickerInput.js';

vi.mock('../../../packages/frontend/src/i18n/index.js', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('react-i18next', async () => (await import('../../helpers/i18nMock.js')).i18nMock);

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

const typeIn = (value: string) => {
  const input = screen.getByPlaceholderText('Enter ticker, e.g. VTI') as HTMLInputElement;
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
};

function ControlledTickerInput() {
  const [value, setValue] = useState('');
  return <TickerInput value={value} onChange={setValue} />;
}

describe('TickerInput', () => {
  it('使用初始值渲染', () => {
    render(<TickerInput value="SPY" onChange={() => {}} />);
    screen.getByDisplayValue('SPY');
  });

  it('onChange 在输入时被调用', () => {
    const onChange = vi.fn();
    render(<TickerInput value="" onChange={onChange} />);
    typeIn('AAPL');
    expect(onChange).toHaveBeenCalledWith('AAPL');
  });

  it('使用自定义 placeholder', () => {
    render(<TickerInput value="" onChange={() => {}} placeholder="输入股票代码" />);
    screen.getByPlaceholderText('输入股票代码');
  });

  it('输入时通过远端搜索显示建议下拉', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: [
          { ticker: 'SPY', name: 'S&P 500 ETF', market: 'US Equity' },
          { ticker: 'SPYSIM', name: 'S&P 500 Index', market: 'Index' },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ControlledTickerInput />);
    typeIn('SPY');
    await screen.findByText('S&P 500 ETF');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/backtest/search?query=SPY'),
      expect.anything(),
    );
  });

  it('远端无结果时显示空状态', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) }),
    );
    render(<ControlledTickerInput />);
    typeIn('ZZZ');
    await screen.findByText('No matching tickers');
  });
});
