import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FloatingField } from '../../../packages/frontend/src/components/BacktestParamsForm.js';

vi.mock('react-i18next', async () => (await import('../../helpers/i18nMock.js')).i18nMock);

describe('FloatingField', () => {
  it('渲染标签文本', () => {
    render(<FloatingField label="STARTING VALUE" />);
    expect(screen.getByText('STARTING VALUE')).toBeTruthy();
  });

  it('渲染前缀', () => {
    render(<FloatingField label="AMOUNT" prefix="$" />);
    expect(screen.getByText('$')).toBeTruthy();
  });

  it('渲染后缀', () => {
    render(<FloatingField label="WINDOW" suffix="months" />);
    expect(screen.getByText('months')).toBeTruthy();
  });

  it('输入值正确传递', () => {
    render(<FloatingField label="FIELD" value="100" onChange={() => {}} />);
    const input = screen.getByDisplayValue('100');
    expect(input).toBeTruthy();
  });

  it('disabled 状态正确传递', () => {
    render(<FloatingField label="FIELD" disabled />);
    const input = screen.getByLabelText('FIELD');
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it('无错误时容器包含 border-border', () => {
    const { container } = render(<FloatingField label="FIELD" />);
    const wrapper = container.querySelector('.h-14');
    expect(wrapper?.className).toContain('border-border');
  });

  it('支持自定义 containerClassName', () => {
    const { container } = render(<FloatingField label="FIELD" containerClassName="w-[200px]" />);
    const wrapper = container.querySelector('.w-\\[200px\\]');
    expect(wrapper).toBeTruthy();
  });

  it('type=date 时渲染日期输入框', () => {
    render(<FloatingField label="START DATE" type="date" value="2024-01-15" onChange={() => {}} />);
    const input = screen.getByDisplayValue('2024-01-15');
    expect(input.getAttribute('type')).toBe('date');
  });
});
