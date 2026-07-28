/**
 * SSRF 防护工具（C-003）
 *
 * Architecture: 通用安全工具 — 在服务端发起外部 HTTP 请求前校验目标 URL。
 * 企业为何需要：Webhook URL 由用户配置，若无校验，攻击者可让服务器向
 * 云元数据端点（169.254.169.254）、localhost、内网服务等发起请求，
 * 窃取 IAM 凭证或探测内网，导致整个集群被接管。本模块在 fetch 前校验
 * URL，拒绝指向私网/链路本地/回环地址的请求。
 *
 * 防护层级（纵深防御）：
 * 1. URL 解析：仅 http/https，禁止 userinfo（避免 http://user@evil/ 注入）
 * 2. 端口校验：仅允许白名单端口（80/443/8080/8443）
 * 3. 主机名解析：
 *    - IP 字面量直接校验（IPv4 + IPv6）
 *    - 域名先 DNS 解析再逐个校验所有 A 记录（防 DNS rebinding）
 * 4. IP 校验：拒绝私网/链路本地/回环/未分配/多播/保留地址段
 *
 * 权衡：DNS 解析后 IP 仍可能在 fetch 时被 rebinding 改写，但 Node.js
 * fetch 内部会缓存短时间内 DNS 结果，且解析后立即投递，时间窗很小。
 * 完整防护需在 undici agent 层 pin IP，但当前复杂度不值得。
 */
import dns from 'dns/promises';
import { isIP } from 'net';

/** 允许的协议 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** 默认允许的端口（HTTP 标准 + 常见 webhook 端口） */
const DEFAULT_ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/**
 * SSRF 校验失败错误。
 *
 * 携带 error code 便于调用方区分失败原因（协议/端口/IP/DNS），
 * 路由层可据此返回差异化错误响应。
 */
export class SsrfValidationError extends Error {
  readonly code: string;
  constructor(message: string, code: string = 'SSRF_BLOCKED') {
    super(message);
    this.name = 'SsrfValidationError';
    this.code = code;
  }
}

/** 校验选项 */
export interface SsrfCheckOptions {
  /** 允许的端口集合（默认 [80, 443, 8080, 8443]） */
  allowedPorts?: ReadonlySet<number>;
  /** 是否执行 DNS 解析后校验 IP（防 DNS rebinding，默认 true） */
  resolveDns?: boolean;
}

/**
 * 校验单个 IPv4 地址是否为私网/保留地址。
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
 *
 * @param ip - IPv4 字符串（已通过 isIP 校验格式）
 * @returns true 表示地址被禁止
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return true; // 格式错误一律拒绝（防御性）
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 未分配
  if (a === 10) return true; // 10.0.0.0/8 私网 A
  if (a === 127) return true; // 127.0.0.0/8 回环
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 链路本地（云元数据）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 私网 B
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 私网 C
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // 224.0.0.0/4 多播 + 240.0.0.0/4 保留
  return false;
}

/**
 * 校验单个 IPv6 地址是否为私网/保留地址。
 *
 * 拒绝段：
 * - ::1            回环
 * - ::             未指定
 * - fc00::/7       ULA（RFC 4193，对应 IPv4 私网）
 * - fe80::/10      链路本地
 * - ff00::/8       多播
 *
 * 安全策略：仅允许 2000::/3 全球单播（公网），其他保留段一律拒绝。
 * IPv6 字面量在 webhook URL 中极少出现，严格策略不影响实用性。
 *
 * @param ip - IPv6 字符串（压缩形式，已通过 isIP 校验格式）
 * @returns true 表示地址被禁止
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
  // 仅允许 2000::/3 全球单播（第一位为 2 或 3）；其他保留段拒绝
  if (!lower.startsWith('2') && !lower.startsWith('3')) return true;
  return false;
}

/**
 * 校验 IP 字面量是否被禁止（IPv4 或 IPv6）。
 *
 * @param ip - IP 字符串
 * @returns true 表示地址被禁止（私网/保留/链路本地等）
 */
function isForbiddenIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return false; // 非 IP 字面量，由调用方处理
}

/**
 * 校验 URL 是否符合 SSRF 防护策略。
 *
 * 步骤：
 * 1. URL 必须可解析且协议为 http/https
 * 2. 禁止 URL 中嵌入 userinfo（避免通过 userinfo 注入或混淆）
 * 3. 端口必须在白名单内（默认 80/443/8080/8443）
 * 4. 主机名为 IP 字面量时直接校验；为域名时 DNS 解析后逐个校验
 *
 * @param url - 待校验的完整 URL 字符串
 * @param options - 可选配置（自定义端口白名单、是否解析 DNS）
 * @throws SsrfValidationError 当 URL 违反任一策略
 */
export async function assertSafeUrl(
  url: string,
  options: SsrfCheckOptions = {},
): Promise<void> {
  const { allowedPorts = DEFAULT_ALLOWED_PORTS, resolveDns = true } = options;

  // 1. URL 解析
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfValidationError(`Invalid URL: ${url}`, 'SSRF_INVALID_URL');
  }

  // 2. 协议校验
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new SsrfValidationError(
      `Protocol '${parsed.protocol}' not allowed (only http: and https: permitted)`,
      'SSRF_PROTOCOL_FORBIDDEN',
    );
  }

  // 3. 禁止 userinfo（避免 http://user:pass@evil/ 注入与凭证泄露）
  if (parsed.username || parsed.password) {
    throw new SsrfValidationError(
      'URL must not contain userinfo (user:password@)',
      'SSRF_USERINFO_FORBIDDEN',
    );
  }

  // 4. 端口校验（未显式端口时使用协议默认端口）
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  if (!allowedPorts.has(port)) {
    throw new SsrfValidationError(
      `Port ${port} not allowed (permitted: ${[...allowedPorts].sort((a, b) => a - b).join(', ')})`,
      'SSRF_PORT_FORBIDDEN',
    );
  }

  // 5. 主机名校验：IP 字面量直接校验，域名 DNS 解析后校验
  // IPv6 字面量在 URL 中带方括号（如 [::1]），WHATWG URL hostname 保留方括号，
  // 而 isIP 无法识别带括号的形式，需先剥离方括号再校验
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

  // 域名：DNS 解析后逐个校验所有 A 记录（防 DNS rebinding）
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
    throw new SsrfValidationError(
      `DNS returned no A records for ${hostname}`,
      'SSRF_DNS_EMPTY',
    );
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
