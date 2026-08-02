/**
 * SSRF 防护工具（C-003）。
 *
 * Webhook URL 由用户配置，若无校验，攻击者可让服务器向云元数据端点
 * （169.254.169.254）、localhost、内网服务等发起请求，窃取 IAM 凭证或探测内网，
 * 导致整个集群被接管。本模块在 fetch 前校验 URL，拒绝指向私网/链路本地/回环地址的请求。
 *
 * 防护层级（纵深防御）：
 * 1. URL 解析：仅 http/https，禁止 userinfo（避免 http://user@evil/ 注入）
 * 2. 端口校验：仅允许白名单端口（80/443/8080/8443）
 * 3. 主机名解析：IP 字面量直接校验（IPv4 + IPv6）；
 *    域名先 DNS 解析再逐个校验所有 A 记录（防 DNS rebinding）
 * 4. IP 校验：拒绝私网/链路本地/回环/未分配/多播/保留地址段
 *
 * 权衡：DNS 解析后 IP 仍可能在 fetch 时被 rebinding 改写，但 Node.js fetch
 * 内部会缓存短时间内 DNS 结果，且解析后立即投递，时间窗很小。完整防护需在
 * undici agent 层 pin IP，但当前复杂度不值得。
 */
import dns from 'dns/promises';
import { isIP } from 'net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

const DEFAULT_ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

export class SsrfValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string = 'SSRF_BLOCKED') {
    super(message);
    this.name = 'SsrfValidationError';
    this.code = code;
  }
}

interface SsrfCheckOptions {
  allowedPorts?: ReadonlySet<number>;
  resolveDns?: boolean;
}

function isInvalidOctet(p: number): boolean {
  return Number.isNaN(p) || p < 0 || p > 255;
}

/**
 * 校验 IPv4 首二字节是否落入禁止段。
 *
 * 私有段参考 RFC 1918 + RFC 3927（链路本地）+ RFC 5735（特殊用途）：
 * - 0.0.0.0/8        未分配（"本机"语义，可被解释为 localhost）
 * - 10.0.0.0/8       私网 A（RFC 1918）
 * - 100.64.0.0/10    CGNAT（RFC 6598，运营商级 NAT）
 * - 127.0.0.0/8      回环
 * - 169.254.0.0/16   链路本地（含 AWS/GCP/Azure 元数据 169.254.169.254）
 * - 172.16.0.0/12    私网 B（RFC 1918）
 * - 192.168.0.0/16   私网 C（RFC 1918）
 * - 224.0.0.0/4      多播
 * - 240.0.0.0/4      保留
 */
function isForbiddenIpv4Range(a: number, b: number): boolean {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return a >= 224;
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isInvalidOctet)) {
    return true; // 格式错误一律拒绝（防御性）
  }
  const [a, b] = parts;
  return isForbiddenIpv4Range(a, b);
}

/**
 * 校验单个 IPv6 地址是否为私网/保留地址。
 *
 * 安全策略：仅允许 2000::/3 全球单播（公网），其他保留段一律拒绝。
 * IPv6 字面量在 webhook URL 中极少出现，严格策略不影响实用性。
 */
function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // 回环 / 未指定
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // fc00::/7 ULA
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) {
    return true; // fe80::/10 链路本地
  }
  if (lower.startsWith('ff')) return true; // ff00::/8 多播
  if (!lower.startsWith('2') && !lower.startsWith('3')) return true;
  return false;
}

function isForbiddenIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false; // 非 IP 字面量，由调用方处理
}

function validateUrlBasics(parsed: URL, allowedPorts: ReadonlySet<number>): void {
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SsrfValidationError(
      `Protocol '${parsed.protocol}' not allowed (only http: and https: permitted)`,
      'SSRF_PROTOCOL_FORBIDDEN',
    );
  }

  if (parsed.username || parsed.password) {
    throw new SsrfValidationError(
      'URL must not contain userinfo (user:password@)',
      'SSRF_USERINFO_FORBIDDEN',
    );
  }

  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  if (!allowedPorts.has(port)) {
    throw new SsrfValidationError(
      `Port ${port} not allowed (permitted: ${[...allowedPorts].sort((a, b) => a - b).join(', ')})`,
      'SSRF_PORT_FORBIDDEN',
    );
  }
}

async function validateHostname(parsed: URL, resolveDns: boolean): Promise<void> {
  // IPv6 字面量在 URL 中带方括号（如 [::1]），WHATWG URL hostname 保留方括号，
  const rawHostname = parsed.hostname;
  const hostname =
    rawHostname.startsWith('[') && rawHostname.endsWith(']')
      ? rawHostname.slice(1, -1)
      : rawHostname;
  const ipFamily = isIP(hostname);
  if (ipFamily !== 0) {
    if (isForbiddenIp(hostname)) {
      throw new SsrfValidationError(
        `IP ${hostname} is forbidden (private/loopback/link-local)`,
        'SSRF_PRIVATE_IP',
      );
    }
    return;
  }

  if (!resolveDns) return;
  let addrs: string[];
  try {
    addrs = await dns.resolve4(hostname);
  } catch (err) {
    throw new SsrfValidationError(
      `DNS resolution failed for ${hostname}: ${(err as Error).message}`,
      'SSRF_DNS_FAILED',
    );
  }
  if (addrs.length === 0) {
    throw new SsrfValidationError(`DNS returned no A records for ${hostname}`, 'SSRF_DNS_EMPTY');
  }
  for (const addr of addrs) {
    if (isForbiddenIp(addr)) {
      throw new SsrfValidationError(
        `Resolved IP ${addr} for ${hostname} is forbidden (DNS rebinding to private/loopback)`,
        'SSRF_DNS_REBINDING',
      );
    }
  }
}

/**
 * @throws SsrfValidationError 当 URL 违反任一策略
 */
export async function assertSafeUrl(url: string, options: SsrfCheckOptions = {}): Promise<void> {
  const { allowedPorts = DEFAULT_ALLOWED_PORTS, resolveDns = true } = options;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfValidationError(`Invalid URL: ${url}`, 'SSRF_INVALID_URL');
  }

  validateUrlBasics(parsed, allowedPorts);
  await validateHostname(parsed, resolveDns);
}
