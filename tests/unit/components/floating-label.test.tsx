import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FloatingLabelInput } from '../../../packages/frontend/src/components/BacktestParamsForm.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
}));

describe('FloatingLabelInput', () => {
  it('渲染标签文本', () => {
    render(<FloatingLabelInput label="STARTING VALUE" />);
    expect(screen.getByText('STARTING VALUE')).toBeTruthy();
  });

  it('渲染前缀', () => {
    render(<FloatingLabelInput label="AMOUNT" prefix="$" />);
    expect(screen.getByText('$')).toBeTruthy();
  });

  it('渲染后缀', () => {
    render(<FloatingLabelInput label="WINDOW" suffix="months" />);
    expect(screen.getByText('months')).toBeTruthy();
  });

  it('渲染错误信息', () => {
    render(<FloatingLabelInput label="FIELD" error="Invalid value" />);
    expect(screen.getByText('Invalid value')).toBeTruthy();
  });

  it('渲染提示信息（无错误时）', () => {
    render(<FloatingLabelInput label="FIELD" hint="Enter a number" />);
    expect(screen.getByText('Enter a number')).toBeTruthy();
  });

  it('有错误时不显示提示', () => {
    render(<FloatingLabelInput label="FIELD" error="Error" hint="Hint" />);
    expect(screen.queryByText('Hint')).toBeNull();
  });

  it('输入值正确传递', () => {
    render(<FloatingLabelInput label="FIELD" value="100" onChange={() => {}} />);
    const input = screen.getByDisplayValue('100');
    expect(input).toBeTruthy();
  });

  it('disabled 状态正确传递', () => {
    render(<FloatingLabelInput label="FIELD" disabled />);
    const input = screen.getByLabelText('FIELD');
    expect((input as HTMLInputElement).disabled).toBe(true);
  });

  it('错误状态下容器包含 border-danger', () => {
    const { container } = render(<FloatingLabelInput label="FIELD" error="err" />);
    const wrapper = container.querySelector('.h-14');
    expect(wrapper?.className).toContain('border-danger');
  });

  it('无错误时容器包含 border-border', () => {
    const { container } = render(<FloatingLabelInput label="FIELD" />);
    const wrapper = container.querySelector('.h-14');
    expect(wrapper?.className).toContain('border-border');
  });

  it('支持自定义 containerClassName', () => {
    const { container } = render(
      <FloatingLabelInput label="FIELD" containerClassName="w-[200px]" />,
    );
    const wrapper = container.querySelector('.w-\\[200px\\]');
    expect(wrapper).toBeTruthy();
  });

  it('type=date 时渲染日期输入框', () => {
    render(
      <FloatingLabelInput label="START DATE" type="date" value="2024-01-15" onChange={() => {}} />,
    );
    const input = screen.getByDisplayValue('2024-01-15');
    expect(input.getAttribute('type')).toBe('date');
  });
});
