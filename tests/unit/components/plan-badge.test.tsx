import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanBadge } from '../../../packages/frontend/src/components/layout/PlanBadge.js';

describe('PlanBadge', () => {
  it('渲染 free tier 并显示 FREE 标签', () => {
    render(<PlanBadge tier="free" />);
    expect(screen.getByText('FREE')).toBeTruthy();
  });

  it('渲染 pro tier 并显示 PRO 标签', () => {
    render(<PlanBadge tier="pro" />);
    expect(screen.getByText('PRO')).toBeTruthy();
  });

  it('渲染 pro-plus tier 并显示 PRO+ 标签', () => {
    render(<PlanBadge tier="pro-plus" />);
    expect(screen.getByText('PRO+')).toBeTruthy();
  });

  it('渲染 public tier 并显示 PUBLIC 标签', () => {
    render(<PlanBadge tier="public" />);
    expect(screen.getByText('PUBLIC')).toBeTruthy();
  });

  it('free tier 包含 brand 色相关样式', () => {
    const { container } = render(<PlanBadge tier="free" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('text-brand');
    expect(badge?.className).toContain('border-brand');
  });

  it('pro tier 包含 warning 色相关样式', () => {
    const { container } = render(<PlanBadge tier="pro" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('text-warning');
    expect(badge?.className).toContain('border-warning');
  });

  it('pro-plus tier 包含 success 色相关样式', () => {
    const { container } = render(<PlanBadge tier="pro-plus" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('text-success');
    expect(badge?.className).toContain('border-success');
  });

  it('包含 uppercase 和 rounded-full 样式', () => {
    const { container } = render(<PlanBadge tier="free" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('uppercase');
    expect(badge?.className).toContain('tracking-wider');
    expect(badge?.className).toContain('rounded-full');
    expect(badge?.className).toContain('font-semibold');
  });

  it('支持自定义 className', () => {
    const { container } = render(<PlanBadge tier="free" className="custom-class" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('custom-class');
  });
});
