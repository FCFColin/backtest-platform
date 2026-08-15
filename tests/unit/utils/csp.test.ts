import { describe, it, expect } from 'vitest';
import { buildCspHeader } from '../../../packages/backend/src/utils/csp.js';

describe('buildCspHeader', () => {
  it('默认在 script-src 中注入 nonce', () => {
    expect(buildCspHeader('abc123')).toContain("script-src 'self' 'nonce-abc123'");
  });

  it('includeNonce=false 时 script-src 仅 self 且不含 nonce', () => {
    const header = buildCspHeader('abc123', false);
    expect(header).toContain("script-src 'self'");
    expect(header).not.toContain('nonce');
  });

  it('包含 base 指令 default-src/style-src/img-src', () => {
    const header = buildCspHeader('n');
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("style-src 'self' 'unsafe-inline'");
    expect(header).toContain("img-src 'self' data:");
  });
});
