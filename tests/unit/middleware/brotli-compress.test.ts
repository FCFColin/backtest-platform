import { describe, it, expect, vi } from 'vitest';
import zlib from 'node:zlib';
import { brotliCompress } from '../../../packages/backend/src/middleware/brotliCompress.js';

function createMockRes() {
  const chunks: Buffer[] = [];
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    setHeader: vi.fn((k: string, v: string) => {
      headers[k.toLowerCase()] = String(v);
    }),
    removeHeader: vi.fn((k: string) => {
      delete headers[k.toLowerCase()];
    }),
    write: vi.fn((chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    }),
    end: vi.fn((chunk?: Buffer | string) => {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }),
    getBody: () => Buffer.concat(chunks),
    headers,
  };
}

function invoke(req: { headers: Record<string, string | undefined> }, statusCode = 200) {
  const res = createMockRes();
  res.statusCode = statusCode;
  const next = vi.fn();
  brotliCompress(req as never, res as never, next);
  return { res, next };
}

const bigBody = 'x'.repeat(5000);

describe('brotliCompress', () => {
  it.each([
    ['无 Accept-Encoding', {}],
    ['x-no-compression', { 'x-no-compression': '1', 'accept-encoding': 'br' }],
    ['不含 br/gzip', { 'accept-encoding': 'deflate' }],
  ])('%s 时直接透传（不劫持 write/end）', (_name, headers) => {
    const { res, next } = invoke({ headers });
    expect(next).toHaveBeenCalledTimes(1);
    res.end(bigBody);
    expect(res.getBody().toString()).toBe(bigBody);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('小响应（<1024B）原样透传并设置 Content-Length', () => {
    const { res } = invoke({ headers: { 'accept-encoding': 'br' } });
    res.end('ok');
    expect(res.getBody().toString()).toBe('ok');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers['content-length']).toBe('2');
  });

  it('204/304 响应不压缩', () => {
    const { res } = invoke({ headers: { 'accept-encoding': 'br' } }, 204);
    res.end(bigBody);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it.each([
    ['br', zlib.brotliDecompressSync],
    ['gzip', zlib.gunzipSync],
  ])('Accept-Encoding: %s 时输出压缩体并设置编码头', async (encoding, decompress) => {
    const { res } = invoke({ headers: { 'accept-encoding': encoding } });
    res.end(bigBody);
    await vi.waitFor(() => expect(res.getBody().length).toBeGreaterThan(0));
    expect(res.headers['content-encoding']).toBe(encoding);
    expect(res.headers['vary']).toBe('Accept-Encoding');
    expect(res.headers['content-length']).toBeUndefined();
    expect(decompress(res.getBody()).toString()).toBe(bigBody);
  });
});
