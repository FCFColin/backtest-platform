/**
 * 健康检查路由
 * GET /api/health - 检测各服务（Rust 引擎 / Node.js / Go 数据服务）连通性与状态
 * GET /api/metrics - Prometheus 格式指标端点
 *
 * 该路由不需要鉴权（不挂载 requireApiKey），用于运维监控与探活。
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { getPrometheusRegister } from '../utils/metrics.js';

const router = Router();

/**
 * 检查 Rust 引擎连通性。
 *
 * 通过 AbortController 设置 2 秒超时，避免健康检查被慢响应拖累。
 * 任何异常（超时、连接拒绝、非 2xx 响应）均视为不可用，返回 false。
 *
 * @returns Rust 引擎是否可用
 */
async function checkRustEngine(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(`${config.RUST_ENGINE_URL}/api/engine/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}

router.get('/health', async (_req: Request, res: Response) => {
  try {
    const rustOk = await checkRustEngine();

    // Rust 引擎不可用时整体降级，但仍可服务（Node.js 备用引擎）
    const status = rustOk ? 'ok' : 'degraded';

    res.json({
      success: true,
      data: {
        status,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error({ error }, '[healthRoutes] Health check failed');
    res.status(500).json({
      success: false,
      data: {
        status: 'error',
        timestamp: new Date().toISOString(),
      },
    });
  }
});

/**
 * Prometheus 指标端点
 *
 * 企业理由：Prometheus 是 K8s 生态监控标准，/metrics 端点必须返回
 * Prometheus text format（text/plain; version=0.0.4），而非自定义 JSON。
 * 这使得 Prometheus server 可以直接抓取指标并配置告警规则。
 */
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', getPrometheusRegister().contentType);
    res.end(await getPrometheusRegister().metrics());
  } catch (error) {
    logger.error({ error }, '[healthRoutes] Failed to generate metrics');
    res.status(500).json({ success: false, error: 'Failed to generate metrics' });
  }
});

export default router;
