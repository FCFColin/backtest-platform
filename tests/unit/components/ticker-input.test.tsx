/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TickerInput from '../../../packages/frontend/src/components/TickerInput.js';

vi.mock('../../../packages/frontend/src/utils/tickerPresets.js', () => ({
  ALL_TICKER_PRESETS: [],
}));

vi.mock('../../../packages/frontend/src/i18n/index.js', () => ({
  default: { t: (key: string) => key },
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
    const input = screen.getByPlaceholderText('输入代码');
    fireEvent.change(input, { target: { value: 'AAPL' } });
    expect(onChange).toHaveBeenCalledWith('AAPL');
  });

  it('使用自定义 placeholder', () => {
    render(<TickerInput value="" onChange={() => {}} placeholder="输入股票代码" />);
    expect(screen.getByPlaceholderText('输入股票代码')).toBeTruthy();
  });

  it('输入时显示建议下拉', () => {
    render(<TickerInput value="" onChange={() => {}} />);
    const input = screen.getByPlaceholderText('输入代码') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'SPY' } });
    const spyItems = screen.getAllByText((_content, element) => {
      return element?.textContent?.includes('SPY') ?? false;
    });
    expect(spyItems.length).toBeGreaterThan(0);
  });
});
