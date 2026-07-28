/**
 * SSRF 防护工具单元测试（C-003）
 *
 * 覆盖：
 * - 协议校验：仅 http/https 通过，ftp/file/javascript 等拒绝
 * - 端口校验：仅 80/443/8080/8443 通过，非标准端口拒绝
 * - IPv4 私网/保留地址拒绝（10.x / 127.x / 169.254.x / 172.16-31.x / 192.168.x / 100.64.x / 0.x / 224+）
 * - IPv6 私网/保留地址拒绝（::1 / fe80:: / fc00:: / ff00::）
 * - 域名 DNS 解析后 IP 校验（防 DNS rebinding）
 * - userinfo 禁止
 * - 无效 URL 拒绝
 * - DNS 解析失败拒绝
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import dns from 'dns/promises';

// ---------------------------------------------------------------------------
// Mock：dns/promises（控制 DNS 解析结果，避免测试依赖真实网络）
// ---------------------------------------------------------------------------
vi.mock('dns/promises', () => ({
  default: {
    resolve4: vi.fn(),
  },
}));

import { assertSafeUrl, SsrfValidationError } from '../../../packages/backend/src/utils/ssrfGuard.js';

/** 公网 IP（example.com 真实解析结果之一） */
const PUBLIC_IP = '93.184.216.34';

/** 断言 assertSafeUrl 拒绝指定 URL，并返回 SsrfValidationError */
async function expectRejected(url: string, expectedCode?: string): Promise<SsrfValidationError> {
  const result = await assertSafeUrl(url).then(
    () => null,
    (err: unknown) => err as SsrfValidationError,
  );
  expect(result).toBeInstanceOf(SsrfValidationError);
  if (expectedCode) {
    expect(result!.code).toBe(expectedCode);
  }
  return result!;
}

/** 断言 assertSafeUrl 通过指定 URL（不抛错） */
async function expectPassed(url: string): Promise<void> {
  await expect(assertSafeUrl(url)).resolves.toBeUndefined();
}

describe('ssrfGuard', () => {
  beforeEach(() => {
    vi.mocked(dns.resolve4).mockReset();
    // 默认模拟公网 IP 解析（域名类用例默认通过）
    vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
  });

  // =========================================================================
  // 任务要求的场景（C-003 验证清单）
  // =========================================================================
  describe('C-003 验证场景', () => {
    it('http://169.254.169.254/ 应拒绝（云元数据端点）', async () => {
      await expectRejected('http://169.254.169.254/', 'SSRF_PRIVATE_IP');
    });

    it('http://localhost:6379/ 应拒绝（6379 非白名单端口，端口校验先于 DNS 解析）', async () => {
      // 端口校验（步骤 4）在 DNS 解析（步骤 5）之前，6379 不在白名单即被拒绝；
      // DNS rebinding 路径由 "DNS rebinding 到 169.254.169.254 应拒绝" 用例覆盖
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
      await expectRejected('http://localhost:6379/', 'SSRF_PORT_FORBIDDEN');
    });

    it('http://localhost:8080/admin 应拒绝（8080 白名单端口，DNS 解析到 127.0.0.1）', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
      await expectRejected('http://localhost:8080/admin', 'SSRF_DNS_REBINDING');
    });

    it('http://10.0.0.1/ 应拒绝（私网 A）', async () => {
      await expectRejected('http://10.0.0.1/', 'SSRF_PRIVATE_IP');
    });

    it('http://127.0.0.1/ 应拒绝（回环）', async () => {
      await expectRejected('http://127.0.0.1/', 'SSRF_PRIVATE_IP');
    });

    it('http://192.168.1.1/ 应拒绝（私网 C）', async () => {
      await expectRejected('http://192.168.1.1/', 'SSRF_PRIVATE_IP');
    });

    it('https://example.com/ 应通过（域名解析为公网 IP）', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      await expectPassed('https://example.com/');
    });

    it('ftp://example.com/ 应拒绝（非 http 协议）', async () => {
      await expectRejected('ftp://example.com/', 'SSRF_PROTOCOL_FORBIDDEN');
    });

    it('http://example.com:22/ 应拒绝（非标准端口）', async () => {
      await expectRejected('http://example.com:22/', 'SSRF_PORT_FORBIDDEN');
    });
  });

  // =========================================================================
  // 协议校验
  // =========================================================================
  describe('协议校验', () => {
    it('http: 协议应通过（IP 字面量公网）', async () => {
      await expectPassed('http://8.8.8.8/');
    });

    it('https: 协议应通过（IP 字面量公网）', async () => {
      await expectPassed('https://8.8.8.8/');
    });

    it('file: 协议应拒绝', async () => {
      await expectRejected('file:///etc/passwd', 'SSRF_PROTOCOL_FORBIDDEN');
    });

    it('javascript: 协议应拒绝', async () => {
      await expectRejected('javascript:alert(1)', 'SSRF_PROTOCOL_FORBIDDEN');
    });

    it('data: 协议应拒绝', async () => {
      await expectRejected('data:text/html,<script>1</script>', 'SSRF_PROTOCOL_FORBIDDEN');
    });
  });

  // =========================================================================
  // 端口校验
  // =========================================================================
  describe('端口校验', () => {
    it('显式 80 端口应通过', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      await expectPassed('http://example.com:80/');
    });

    it('显式 443 端口应通过', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      await expectPassed('https://example.com:443/');
    });

    it('显式 8080 端口应通过', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      await expectPassed('http://example.com:8080/');
    });

    it('显式 8443 端口应通过', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      await expectPassed('https://example.com:8443/');
    });

    it('Redis 端口 6379 应拒绝', async () => {
      await expectRejected('http://example.com:6379/', 'SSRF_PORT_FORBIDDEN');
    });

    it('MySQL 端口 3306 应拒绝', async () => {
      await expectRejected('http://example.com:3306/', 'SSRF_PORT_FORBIDDEN');
    });

    it('SSH 端口 22 应拒绝', async () => {
      await expectRejected('http://example.com:22/', 'SSRF_PORT_FORBIDDEN');
    });

    it('未显式端口的 http 应默认 80 通过', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      await expectPassed('http://example.com/');
    });

    it('未显式端口的 https 应默认 443 通过', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      await expectPassed('https://example.com/');
    });
  });

  // =========================================================================
  // IPv4 私网/保留地址
  // =========================================================================
  describe('IPv4 私网/保留地址', () => {
    it('0.0.0.0 应拒绝（未分配）', async () => {
      await expectRejected('http://0.0.0.0/', 'SSRF_PRIVATE_IP');
    });

    it('0.0.0.0/8 段应拒绝', async () => {
      await expectRejected('http://0.1.2.3/', 'SSRF_PRIVATE_IP');
    });

    it('10.0.0.0/8 段应拒绝（私网 A）', async () => {
      await expectRejected('http://10.255.255.255/', 'SSRF_PRIVATE_IP');
    });

    it('100.64.0.0/10 段应拒绝（CGNAT）', async () => {
      await expectRejected('http://100.64.0.1/', 'SSRF_PRIVATE_IP');
    });

    it('100.128.0.1 应通过（CGNAT 段外）', async () => {
      await expectPassed('http://100.128.0.1/');
    });

    it('127.0.0.0/8 段应拒绝（回环）', async () => {
      await expectRejected('http://127.255.255.255/', 'SSRF_PRIVATE_IP');
    });

    it('169.254.0.0/16 段应拒绝（链路本地，含云元数据）', async () => {
      await expectRejected('http://169.254.0.1/', 'SSRF_PRIVATE_IP');
      await expectRejected('http://169.254.169.254/', 'SSRF_PRIVATE_IP');
      await expectRejected('http://169.254.255.255/', 'SSRF_PRIVATE_IP');
    });

    it('172.16.0.0/12 段应拒绝（私网 B）', async () => {
      await expectRejected('http://172.16.0.1/', 'SSRF_PRIVATE_IP');
      await expectRejected('http://172.31.255.255/', 'SSRF_PRIVATE_IP');
    });

    it('172.32.0.1 应通过（私网 B 段外）', async () => {
      await expectPassed('http://172.32.0.1/');
    });

    it('172.15.0.1 应通过（私网 B 段外）', async () => {
      await expectPassed('http://172.15.0.1/');
    });

    it('192.168.0.0/16 段应拒绝（私网 C）', async () => {
      await expectRejected('http://192.168.0.1/', 'SSRF_PRIVATE_IP');
      await expectRejected('http://192.168.255.255/', 'SSRF_PRIVATE_IP');
    });

    it('224.0.0.0/4 段应拒绝（多播）', async () => {
      await expectRejected('http://224.0.0.1/', 'SSRF_PRIVATE_IP');
    });

    it('240.0.0.0/4 段应拒绝（保留）', async () => {
      await expectRejected('http://240.0.0.1/', 'SSRF_PRIVATE_IP');
    });

    it('8.8.8.8 应通过（公网 DNS）', async () => {
      await expectPassed('http://8.8.8.8/');
    });

    it('1.1.1.1 应通过（公网 DNS）', async () => {
      await expectPassed('http://1.1.1.1/');
    });
  });

  // =========================================================================
  // IPv6 私网/保留地址
  // =========================================================================
  describe('IPv6 私网/保留地址', () => {
    it('::1 应拒绝（回环）', async () => {
      await expectRejected('http://[::1]/', 'SSRF_PRIVATE_IP');
    });

    it(':: 应拒绝（未指定）', async () => {
      await expectRejected('http://[::]/', 'SSRF_PRIVATE_IP');
    });

    it('fe80:: 应拒绝（链路本地）', async () => {
      await expectRejected('http://[fe80::1]/', 'SSRF_PRIVATE_IP');
    });

    it('fe8/fe9/fea/feb 前缀应拒绝（fe80::/10）', async () => {
      await expectRejected('http://[fe80::]/', 'SSRF_PRIVATE_IP');
      await expectRejected('http://[fe90::]/', 'SSRF_PRIVATE_IP');
      await expectRejected('http://[fea0::]/', 'SSRF_PRIVATE_IP');
      await expectRejected('http://[feb0::]/', 'SSRF_PRIVATE_IP');
    });

    it('fc00:: 应拒绝（ULA）', async () => {
      await expectRejected('http://[fc00::1]/', 'SSRF_PRIVATE_IP');
    });

    it('fd00:: 应拒绝（ULA）', async () => {
      await expectRejected('http://[fd00::1]/', 'SSRF_PRIVATE_IP');
    });

    it('ff00:: 应拒绝（多播）', async () => {
      await expectRejected('http://[ff00::1]/', 'SSRF_PRIVATE_IP');
    });

    it('2001:db8:: 应通过（全球单播 2000::/3）', async () => {
      await expectPassed('http://[2001:db8::1]/');
    });

    it('2606:4700:: 应通过（Cloudflare 公网）', async () => {
      await expectPassed('http://[2606:4700::1]/');
    });
  });

  // =========================================================================
  // 域名 DNS 解析（防 DNS rebinding）
  // =========================================================================
  describe('域名 DNS 解析', () => {
    it('DNS 解析为公网 IP 应通过', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34']);
      await expectPassed('https://example.com/');
    });

    it('DNS 解析为多个 IP，任一为私网应拒绝', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['8.8.8.8', '10.0.0.1']);
      await expectRejected('https://example.com/', 'SSRF_DNS_REBINDING');
    });

    it('DNS rebinding 到 169.254.169.254 应拒绝', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['169.254.169.254']);
      await expectRejected('https://example.com/', 'SSRF_DNS_REBINDING');
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
      // DNS 会返回私网 IP，但 resolveDns=false 跳过解析，仅校验协议/端口
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
      await expect(
        assertSafeUrl('https://example.com/', { resolveDns: false }),
      ).resolves.toBeUndefined();
      // 确认 DNS 未被调用
      expect(dns.resolve4).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // userinfo 禁止
  // =========================================================================
  describe('userinfo 禁止', () => {
    it('带 user:pass@ 的 URL 应拒绝', async () => {
      await expectRejected('http://user:pass@example.com/', 'SSRF_USERINFO_FORBIDDEN');
    });

    it('仅带 user@ 的 URL 应拒绝', async () => {
      await expectRejected('http://user@example.com/', 'SSRF_USERINFO_FORBIDDEN');
    });

    it('带 user:pass@ 且指向私网应拒绝（userinfo 优先校验）', async () => {
      const err = await expectRejected('http://admin:secret@10.0.0.1/');
      expect(err.code).toBe('SSRF_USERINFO_FORBIDDEN');
    });
  });

  // =========================================================================
  // 无效 URL
  // =========================================================================
  describe('无效 URL', () => {
    it('空字符串应拒绝', async () => {
      await expectRejected('', 'SSRF_INVALID_URL');
    });

    it('非 URL 字符串应拒绝', async () => {
      await expectRejected('not a url', 'SSRF_INVALID_URL');
    });

    it('仅协议头应拒绝', async () => {
      await expectRejected('http://', 'SSRF_INVALID_URL');
    });
  });

  // =========================================================================
  // 自定义端口白名单
  // =========================================================================
  describe('自定义端口白名单', () => {
    it('自定义白名单允许 9000 端口', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      const allowedPorts = new Set([80, 443, 9000]);
      await expect(
        assertSafeUrl('http://example.com:9000/', { allowedPorts }),
      ).resolves.toBeUndefined();
    });

    it('自定义白名单不含 80 时 80 端口应拒绝', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue([PUBLIC_IP]);
      const allowedPorts = new Set([443]);
      await expect(assertSafeUrl('http://example.com:80/', { allowedPorts })).rejects.toThrow(
        SsrfValidationError,
      );
    });
  });
});
