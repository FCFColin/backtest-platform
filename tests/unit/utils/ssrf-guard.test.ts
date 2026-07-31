import { describe, it, expect, vi, beforeEach } from 'vitest';
import dns from 'dns/promises';

vi.mock('dns/promises', () => ({ default: { resolve4: vi.fn() } }));

import { assertSafeUrl, SsrfValidationError } from '../../../packages/backend/src/utils/ssrfGuard.js';

const PUBLIC_IP = '93.184.216.34';

async function expectRejected(url: string, expectedCode?: string): Promise<void> {
  const result = await assertSafeUrl(url).then(() => null, (e: unknown) => e as SsrfValidationError);
  expect(result).toBeInstanceOf(SsrfValidationError);
  if (expectedCode) expect(result!.code).toBe(expectedCode);
}

async function expectPassed(url: string): Promise<void> {
  await expect(assertSafeUrl(url)).resolves.toBeUndefined();
}

describe('ssrfGuard', () => {
  beforeEach(() => {
    vi.mocked(dns.resolve4).mockReset();
    vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
  });

  it.each<[string, string | undefined]>([
    ['http://169.254.169.254/', 'SSRF_PRIVATE_IP'],
    ['http://10.0.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://127.0.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://192.168.1.1/', 'SSRF_PRIVATE_IP'],
    ['http://0.0.0.0/', 'SSRF_PRIVATE_IP'],
    ['http://0.1.2.3/', 'SSRF_PRIVATE_IP'],
    ['http://10.255.255.255/', 'SSRF_PRIVATE_IP'],
    ['http://100.64.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://100.128.0.1/', undefined],
    ['http://127.255.255.255/', 'SSRF_PRIVATE_IP'],
    ['http://169.254.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://169.254.255.255/', 'SSRF_PRIVATE_IP'],
    ['http://172.16.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://172.31.255.255/', 'SSRF_PRIVATE_IP'],
    ['http://172.32.0.1/', undefined],
    ['http://172.15.0.1/', undefined],
    ['http://192.168.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://192.168.255.255/', 'SSRF_PRIVATE_IP'],
    ['http://224.0.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://240.0.0.1/', 'SSRF_PRIVATE_IP'],
    ['http://8.8.8.8/', undefined],
    ['http://1.1.1.1/', undefined],
    ['https://8.8.8.8/', undefined],
    ['http://[::1]/', 'SSRF_PRIVATE_IP'],
    ['http://[::]/', 'SSRF_PRIVATE_IP'],
    ['http://[fe80::1]/', 'SSRF_PRIVATE_IP'],
    ['http://[fe80::]/', 'SSRF_PRIVATE_IP'],
    ['http://[fe90::]/', 'SSRF_PRIVATE_IP'],
    ['http://[fea0::]/', 'SSRF_PRIVATE_IP'],
    ['http://[feb0::]/', 'SSRF_PRIVATE_IP'],
    ['http://[fc00::1]/', 'SSRF_PRIVATE_IP'],
    ['http://[fd00::1]/', 'SSRF_PRIVATE_IP'],
    ['http://[ff00::1]/', 'SSRF_PRIVATE_IP'],
    ['http://[2001:db8::1]/', undefined],
    ['http://[2606:4700::1]/', undefined],
  ])('%s 应 %s', async (url, code) => {
    if (code) await expectRejected(url, code);
    else await expectPassed(url);
  });

  it.each<[string, string]>([
    ['ftp://example.com/', 'SSRF_PROTOCOL_FORBIDDEN'],
    ['file:///etc/passwd', 'SSRF_PROTOCOL_FORBIDDEN'],
    ['javascript:alert(1)', 'SSRF_PROTOCOL_FORBIDDEN'],
    ['data:text/html,<script>1</script>', 'SSRF_PROTOCOL_FORBIDDEN'],
    ['http://example.com:6379/', 'SSRF_PORT_FORBIDDEN'],
    ['http://example.com:3306/', 'SSRF_PORT_FORBIDDEN'],
    ['http://example.com:22/', 'SSRF_PORT_FORBIDDEN'],
    ['http://localhost:6379/', 'SSRF_PORT_FORBIDDEN'],
    ['http://user:pass@example.com/', 'SSRF_USERINFO_FORBIDDEN'],
    ['http://user@example.com/', 'SSRF_USERINFO_FORBIDDEN'],
    ['http://admin:secret@10.0.0.1/', 'SSRF_USERINFO_FORBIDDEN'],
    ['', 'SSRF_INVALID_URL'],
    ['not a url', 'SSRF_INVALID_URL'],
    ['http://', 'SSRF_INVALID_URL'],
  ])('%s 应拒绝 %s', async (url, code) => {
    await expectRejected(url, code);
  });

  it.each([
    ['http://example.com:80/'],
    ['https://example.com:443/'],
    ['http://example.com:8080/'],
    ['https://example.com:8443/'],
    ['http://example.com/'],
    ['https://example.com/'],
  ])('%s 应通过（DNS 解析公网 IP）', async (url) => {
    vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
    await expectPassed(url);
  });

  it.each<[string, string[], string]>([
    ['https://example.com/', ['8.8.8.8', '10.0.0.1'], 'SSRF_DNS_REBINDING'],
    ['https://example.com/', ['169.254.169.254'], 'SSRF_DNS_REBINDING'],
  ])('%s DNS 解析 %j 应拒绝 %s', async (url, ips, code) => {
    vi.mocked(dns.resolve4).mockResolvedValue(ips);
    await expectRejected(url, code);
  });

  it('localhost:8080 DNS 解析到 127.0.0.1 应拒绝（DNS rebinding）', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
    await expectRejected('http://localhost:8080/admin', 'SSRF_DNS_REBINDING');
  });

  it('DNS 解析失败应拒绝', async () => {
    vi.mocked(dns.resolve4).mockRejectedValue(new Error('ENOTFOUND'));
    await expectRejected('https://nonexistent.invalid/', 'SSRF_DNS_FAILED');
  });

  it('DNS 返回空数组应拒绝', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue([]);
    await expectRejected('https://example.com/', 'SSRF_DNS_EMPTY');
  });

  it('resolveDns=false 时跳过 DNS 解析（仅做 URL/端口校验）', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
    await expect(assertSafeUrl('https://example.com/', { resolveDns: false })).resolves.toBeUndefined();
    expect(dns.resolve4).not.toHaveBeenCalled();
  });

  it('自定义端口白名单允许 9000 端口', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
    await expect(assertSafeUrl('http://example.com:9000/', { allowedPorts: new Set([80, 443, 9000]) })).resolves.toBeUndefined();
  });

  it('自定义白名单不含 80 时 80 端口应拒绝', async () => {
    vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
    await expect(assertSafeUrl('http://example.com:80/', { allowedPorts: new Set([443]) })).rejects.toThrow(SsrfValidationError);
  });
});