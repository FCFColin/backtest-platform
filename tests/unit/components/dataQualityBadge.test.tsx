import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataQualityBadge } from '@/components/DataQualityBadge';
import type { WarningInfo } from '@/utils/errorReporter';

describe('DataQualityBadge（U-1）', () => {
  it('无 warning 时渲染绿色校验通过态', () => {
    render(<DataQualityBadge warnings={[]} />);
    expect(screen.getByTestId('dq-badge-ok')).toBeTruthy();
    expect(screen.getByText('数据质量校验通过')).toBeTruthy();
  });
  it('有 warning 时渲染黄色可展开明细（aria-expanded 切换 + tickers 列表）', async () => {
    const ws: WarningInfo[] = [{ code: 'TICKER_NOT_FOUND', tickers: ['MISS', 'GONE'] }];
    const { getByTestId, getByText, queryByText } = render(<DataQualityBadge warnings={ws} />);
    const btn = getByTestId('dq-badge-warn').querySelector('button')!;
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(queryByText('MISS, GONE')).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(getByText(/MISS, GONE/)).toBeTruthy();
  });
});
