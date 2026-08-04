import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TickerInput from '../../../packages/frontend/src/components/TickerInput.js';

vi.mock('../../../packages/frontend/src/i18n/index.js', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      if (!params) return key;
      return key.replace(/\{\{(\w+)\}\}/g, (_, k) => String(params[k] ?? ''));
    },
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
  Trans: ({ i18nKey }: { i18nKey: string }) => i18nKey,
}));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
});

describe('TickerInput', () => {
  it('使用初始值渲染', () => {
    render(<TickerInput value="SPY" onChange={() => {}} />);
    expect(screen.getByDisplayValue('SPY')).toBeTruthy();
  });

  it('onChange 在输入时被调用', () => {
    const onChange = vi.fn();
    render(<TickerInput value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Enter ticker, e.g. VTI');
    fireEvent.change(input, { target: { value: 'AAPL' } });
    expect(onChange).toHaveBeenCalledWith('AAPL');
  });

  it('使用自定义 placeholder', () => {
    render(<TickerInput value="" onChange={() => {}} placeholder="输入股票代码" />);
    expect(screen.getByPlaceholderText('输入股票代码')).toBeTruthy();
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
    render(<TickerInput value="" onChange={() => {}} />);
    const input = screen.getByPlaceholderText('Enter ticker, e.g. VTI') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'SPY' } });
    await screen.findByText('S&P 500 ETF');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/backtest/search?query=SPY'),
      expect.anything(),
    );
  });
});
