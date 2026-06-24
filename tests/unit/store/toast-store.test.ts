import { describe, it, expect, beforeEach } from 'vitest';
import { useToastStore } from '../../../src/store/toastStore.js';

beforeEach(() => {
  // 清空toast
  const { toasts } = useToastStore.getState();
  toasts.forEach(t => useToastStore.getState().removeToast(t.id));
});

describe('ToastStore', () => {
  it('addToast添加通知', () => {
    useToastStore.getState().addToast('success', '测试通知');
    const after = useToastStore.getState().toasts;
    expect(after.length).toBeGreaterThanOrEqual(1);
    const last = after[after.length - 1];
    expect(last.type).toBe('success');
    expect(last.message).toBe('测试通知');
  });

  it('removeToast删除通知', () => {
    useToastStore.getState().addToast('error', '待删除');
    const toasts = useToastStore.getState().toasts;
    const id = toasts[toasts.length - 1].id;
    useToastStore.getState().removeToast(id);
    const after = useToastStore.getState().toasts;
    expect(after.find(t => t.id === id)).toBeUndefined();
  });

  it('多种类型通知', () => {
    useToastStore.getState().addToast('success', '成功');
    useToastStore.getState().addToast('warning', '警告');
    useToastStore.getState().addToast('error', '错误');
    const after = useToastStore.getState().toasts;
    const types = after.slice(-3).map(t => t.type);
    expect(types).toContain('success');
    expect(types).toContain('warning');
    expect(types).toContain('error');
  });
});
