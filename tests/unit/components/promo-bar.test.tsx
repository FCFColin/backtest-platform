import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PromoBar } from '../../../packages/frontend/src/components/layout/Navbar.js';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'zh-CN', changeLanguage: vi.fn() },
  }),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

beforeEach(() => {
  localStorage.clear();
});

describe('PromoBar', () => {
  it('渲染消息文本', () => {
    render(<PromoBar id="test-1" message="Test message" />);
    expect(screen.getByText('Test message')).toBeTruthy();
  });

  it('渲染 CTA 链接', () => {
    render(<PromoBar id="test-2" message="Test" ctaLabel="Click here" ctaLink="/data-engine" />);
    expect(screen.getByText('Click here')).toBeTruthy();
  });

  it('不渲染 CTA 当 ctaLabel 或 ctaLink 缺失', () => {
    render(<PromoBar id="test-3" message="Test" ctaLabel="Click" />);
    expect(screen.queryByText('Click')).not.toBeTruthy();
  });

  it('点击关闭按钮后隐藏', () => {
    render(<PromoBar id="test-4" message="Dismissable" />);
    const closeBtn = screen.getByLabelText('Close announcement');
    fireEvent.click(closeBtn);
    expect(screen.queryByText('Dismissable')).not.toBeTruthy();
  });

  it('dismiss 状态持久化到 localStorage', () => {
    render(<PromoBar id="test-5" message="Persist" />);
    fireEvent.click(screen.getByLabelText('Close announcement'));
    expect(localStorage.getItem('promo-dismissed-test-5')).toBe('1');
  });

  it('已 dismiss 的 promo 不渲染', () => {
    localStorage.setItem('promo-dismissed-test-6', '1');
    render(<PromoBar id="test-6" message="Should not show" />);
    expect(screen.queryByText('Should not show')).not.toBeTruthy();
  });

  it('dismissible=false 时不显示关闭按钮', () => {
    render(<PromoBar id="test-7" message="No dismiss" dismissible={false} />);
    expect(screen.queryByLabelText('Close announcement')).not.toBeTruthy();
  });

  it('info variant 包含 brand 相关样式', () => {
    const { container } = render(<PromoBar id="test-8" message="Info" variant="info" />);
    const bar = container.querySelector('.border-b');
    expect(bar?.className).toContain('bg-brand-subtle');
  });

  it('success variant 包含 success 相关样式', () => {
    const { container } = render(<PromoBar id="test-9" message="Success" variant="success" />);
    const bar = container.querySelector('.border-b');
    expect(bar?.className).toContain('bg-success-subtle');
  });

  it('warning variant 包含 warning 相关样式', () => {
    const { container } = render(<PromoBar id="test-10" message="Warning" variant="warning" />);
    const bar = container.querySelector('.border-b');
    expect(bar?.className).toContain('bg-warning-subtle');
  });
});
