import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanBadge } from '../../../packages/frontend/src/components/layout/Navbar.js';
import { planTier } from '../../../packages/frontend/src/utils/orgPlan.js';

describe('PlanBadge', () => {
  it('渲染 free tier 并显示 FREE 标签', () => {
    render(<PlanBadge tier="free" />);
    screen.getByText('FREE');
  });

  it('渲染 pro tier 并显示 PRO 标签', () => {
    render(<PlanBadge tier="pro" />);
    screen.getByText('PRO');
  });

  it('渲染 pro-plus tier 并显示 PRO+ 标签', () => {
    render(<PlanBadge tier="pro-plus" />);
    screen.getByText('PRO+');
  });

  it('渲染 public tier 并显示 PUBLIC 标签', () => {
    render(<PlanBadge tier="public" />);
    screen.getByText('PUBLIC');
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

  it('渲染 enterprise tier 并显示 ENTERPRISE 标签', () => {
    render(<PlanBadge tier="enterprise" />);
    screen.getByText('ENTERPRISE');
  });

  it('enterprise 计划映射到 enterprise 徽章而非 fallback 到 free', () => {
    expect(planTier('enterprise')).toBe('enterprise');
    expect(planTier('free')).toBe('free');
  });

  it('支持自定义 className', () => {
    const { container } = render(<PlanBadge tier="free" className="custom-class" />);
    const badge = container.querySelector('span');
    expect(badge?.className).toContain('custom-class');
  });
});
