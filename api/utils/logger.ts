/**
 * 结构化日志模块
 *
 * 基于 pino 提供：
 * - `logger`：通用日志实例，按运行环境配置日志级别与输出格式
 * - `httpLogger`：pino-http 中间件，用于记录 HTTP 请求日志
 *
 * 开发环境（NODE_ENV=development）：
 *   - 日志级别 `debug`
 *   - 使用 pino-pretty 美化输出（若已安装）
 * 生产环境（NODE_ENV=production）：
 *   - 日志级别 `info`
 *   - 输出 JSON 格式，便于日志采集系统消费
 *
 * 企业理由：request_id 是分布式系统中关联日志的最小可行单元。
 * 无 request_id 时，多服务日志无法关联，排障只能靠猜时间戳。
 * 权衡：UUID 生成有微秒级开销，但对回测平台可忽略。
 */

import pino from 'pino';
import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { trace, context } from '@opentelemetry/api';
import { config } from '../config/index.js';

const isDev = config.NODE_ENV === 'development';

/**
 * pino mixin：将 OTel trace_id/span_id 注入每条日志。
 *
 * 企业理由：日志↔链路双向关联是 SRE 排障的基础能力。
 * 无 trace_id 时，一条请求的日志无法跳转到对应 trace，
 * 一条 trace 也无法反查相关日志，排障只能靠猜时间戳。
 * OTel context 通过 AsyncLocalStorage 在异步链路中隐式传播，
 * 此处在每条日志写入时读取当前活跃 span 的上下文。
 * 权衡：每条日志多一次 context 读取（纳秒级），换取排障效率数量级提升。
 */
function otelMixin(): Record<string, string> {
  const span = trace.getSpan(context.active());
  if (!span) return {};
  const spanContext = span.spanContext();
  return {
    trace_id: spanContext.traceId,
    span_id: spanContext.spanId,
  };
}

/**
 * pino logger 实例
 *
 * 开发环境通过 transport 调用 pino-pretty 进行美化输出；
 * 若 pino-pretty 不可用，pino 会回退到默认 JSON 输出。
 */
const logger = pino({
  level: isDev ? 'debug' : 'info',
  // 企业理由：mixin 在每条日志写入时调用，注入当前 OTel span 的 trace_id/span_id
  mixin: otelMixin,
  // Security: 日志脱敏，防止凭证泄露到日志系统
  // 企业为何需要：日志聚合系统（Loki/ES）的访问权限通常低于数据库，凭证泄露风险更高
  // 权衡：脱敏后排查问题时无法看到完整请求头，但安全性远高于便利性
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["x-api-key"]',
      'req.headers.cookie',
      '*.password',
      '*.token',
      '*.secret',
      '*.apiKey',
    ],
    censor: '[Redacted]',
  },
  ...(isDev
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

/**
 * HTTP 请求日志中间件
 *
 * 使用 logger 子实例并附加 `module: 'api'` 字段，
 * 便于在日志采集中区分 API 层请求日志。
 *
 * 企业理由：genReqId 为每个请求生成唯一 request_id，
 * 支持从 x-request-id 请求头传入（便于上游网关传递），
 * 使日志可通过 request_id 关联同一请求的全链路日志。
 */
const httpLogger = pinoHttp({
  logger: logger.child({ module: 'api' }),
  // 企业理由：request_id 是分布式 tracing 最小可行单元
  genReqId: (req) => {
    const incoming = req.headers['x-request-id'];
    // Security: 仅允许 [a-zA-Z0-9-] 字符，防止日志注入
    // 企业为何需要：x-request-id 会被写入日志，若包含换行符或控制字符，
    // 攻击者可伪造日志条目绕过日志分析或注入恶意内容
    if (typeof incoming === 'string' && incoming.length > 0 && incoming.length <= 128 && /^[a-zA-Z0-9-]+$/.test(incoming)) {
      return incoming;
    }
    return randomUUID();
  },
  // 按状态码区分日志级别：4xx=warn, 5xx=error, 其余=info
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  // 序列化 error 对象，保留 stack trace
  serializers: {
    err: pino.stdSerializers.err,
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
  },
});

export { logger, httpLogger };
export default logger;
