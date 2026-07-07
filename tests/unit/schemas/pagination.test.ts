import { describe, it, expect } from 'vitest';
import { paginationSchema } from '../../../packages/backend/src/schemas/pagination.js';

describe('paginationSchema', () => {
  it('应使用默认值（limit=100, offset=0）', () => {
    const r = paginationSchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(100);
      expect(r.data.offset).toBe(0);
    }
  });

  it('应接受合法值', () => {
    const r = paginationSchema.safeParse({ limit: 50, offset: 10 });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(50);
      expect(r.data.offset).toBe(10);
    }
  });

  it('limit 小于 1 应拒绝', () => {
    const r = paginationSchema.safeParse({ limit: 0 });
    expect(r.success).toBe(false);
  });

  it('limit 大于 1000 应拒绝', () => {
    const r = paginationSchema.safeParse({ limit: 1001 });
    expect(r.success).toBe(false);
  });

  it('offset 为负数应拒绝', () => {
    const r = paginationSchema.safeParse({ offset: -1 });
    expect(r.success).toBe(false);
  });

  it('limit 为非整数应拒绝', () => {
    const r = paginationSchema.safeParse({ limit: 1.5 });
    expect(r.success).toBe(false);
  });

  it('字符串数字应被 coerce', () => {
    const r = paginationSchema.safeParse({ limit: '50', offset: '5' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.limit).toBe(50);
      expect(r.data.offset).toBe(5);
    }
  });
});
