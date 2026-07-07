/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ProtectedRoute from '../../../packages/frontend/src/components/ProtectedRoute.js';

const mockState = vi.hoisted(() => ({
  user: null as Record<string, unknown> | null,
  initialized: false,
}));
const mockUseAuthStore = vi.hoisted(() =>
  vi.fn(() => ({ user: mockState.user, initialized: mockState.initialized })),
);

vi.mock('../../../packages/frontend/src/store/authStore.js', () => ({
  useAuthStore: mockUseAuthStore,
}));

beforeEach(() => {
  mockState.user = null;
  mockState.initialized = false;
});

describe('ProtectedRoute', () => {
  it('未初始化时返回 null', () => {
    const { container } = render(
      <ProtectedRoute>
        <div>受保护内容</div>
      </ProtectedRoute>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('未登录时重定向到 /login', () => {
    mockState.initialized = true;
    render(
      <ProtectedRoute>
        <div>受保护内容</div>
      </ProtectedRoute>,
    );
    expect(screen.getByTestId('navigate').textContent).toBe('/login');
    expect(screen.queryByText('受保护内容')).toBeNull();
  });

  it('已登录时渲染子组件', () => {
    mockState.initialized = true;
    mockState.user = {
      userId: '1',
      role: 'user',
      platformAdmin: false,
      tenantId: null,
      orgRole: null,
    };
    render(
      <ProtectedRoute>
        <div>受保护内容</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText('受保护内容')).toBeTruthy();
  });

  it('非管理员访问管理员路由时重定向到首页', () => {
    mockState.initialized = true;
    mockState.user = {
      userId: '1',
      role: 'user',
      platformAdmin: false,
      tenantId: null,
      orgRole: null,
    };
    render(
      <ProtectedRoute requireAdmin>
        <div>管理员内容</div>
      </ProtectedRoute>,
    );
    expect(screen.getByTestId('navigate').textContent).toBe('/');
    expect(screen.queryByText('管理员内容')).toBeNull();
  });

  it('管理员访问管理员路由时渲染子组件', () => {
    mockState.initialized = true;
    mockState.user = {
      userId: '1',
      role: 'admin',
      platformAdmin: true,
      tenantId: null,
      orgRole: null,
    };
    render(
      <ProtectedRoute requireAdmin>
        <div>管理员内容</div>
      </ProtectedRoute>,
    );
    expect(screen.getByText('管理员内容')).toBeTruthy();
  });
});
