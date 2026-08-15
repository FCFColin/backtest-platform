import { createRequire } from 'module';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { trace, context } from '@opentelemetry/api';
import { requestContextStorage } from './requestContext.js';

const isDev = process.env.NODE_ENV === 'development';

// esbuild bundle 会把 pino-pretty 内联，导致 pino transport 找不到文件；仅当可解析时才启用 pretty 输出
const prettyTransport = (() => {
  if (!isDev) return false;
  try {
    createRequire(import.meta.url).resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
})();

function otelMixin(): Record<string, string> {
  const span = trace.getSpan(context.active());
  const result: Record<string, string> = {};
  if (span) {
    const spanContext = span.spanContext();
    result.trace_id = spanContext.traceId;
    result.span_id = spanContext.spanId;
  }
  const requestId = requestContextStorage.getStore()?.requestId;
  if (requestId) result.request_id = requestId;
  return result;
}

const logger = pino({
  level: isDev ? 'debug' : 'info',
  mixin: otelMixin,
  // Security: 日志脱敏，防止凭证泄露到日志系统。日志聚合系统（Loki/ES）的访问权限
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers["x-engine-auth"]',
      'req.headers["x-data-service-auth"]',
      'req.headers["x-admin-api-key"]',
      'req.headers.cookie',
      'req.headers["stripe-signature"]',
      'req.body.refreshToken',
      'req.body.accessToken',
      'req.body.apiKey',
      'req.body.api_key',
      'req.body.password',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
      '*.api_key',
    ],
    censor: '[Redacted]',
  },
  ...(prettyTransport
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

const httpLogger = pinoHttp({
  logger: logger.child({ module: 'api' }),
  genReqId: (req) => {
    const incoming = req.headers['x-request-id'];
    // Security: 仅允许 [a-zA-Z0-9-] 字符，防止日志注入——x-request-id 会被写入日志，
    if (
      typeof incoming === 'string' &&
      incoming.length > 0 &&
      incoming.length <= 128 &&
      /^[a-zA-Z0-9-]+$/.test(incoming)
    ) {
      return incoming;
    }
    return randomUUID();
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // Security: req 自定义序列化器剥离 query string，防止敏感参数（token、key）泄露到日志
  serializers: {
    err: pino.stdSerializers.err,
    req: (req) => ({
      ...pino.stdSerializers.req(req),
      url: typeof req.url === 'string' ? req.url.split('?')[0] : req.url,
    }),
    res: pino.stdSerializers.res,
  },
});

const SENSITIVE_PATTERNS: { pattern: RegExp; replacement: string }[] = [
  {
    pattern: /(api[_-]?key|apikey|token|secret|password|auth|credential)[=:]\s*['"]?\S+['"]?/gi,
    replacement: '$1=***',
  },
  {
    // JSON 形态（"apiKey":"xxx"）的键带引号，上面的模式匹配不到
    pattern: /"(api[_-]?key|apikey|token|secret|password|auth|credential)"\s*:\s*"[^"]*"/gi,
    replacement: '"$1":"***"',
  },
  {
    pattern: /(Authorization|X-Engine-Auth|X-Data-Service-Auth|X-Api-Key):\s*\S+/gi,
    replacement: '$1: ***',
  },
  { pattern: /\b(?=[0-9a-fA-F]*[0-9])[0-9a-fA-F]{32,}\b/g, replacement: '***' },
  {
    pattern: /\beyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g,
    replacement: '***',
  },
];

export function sanitizeLog(s: string, maxLen = 50): string {
  let result = s.replace(/[\n\r]/g, '');
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result.substring(0, maxLen);
}
export { logger, httpLogger };
