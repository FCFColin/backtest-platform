import { Router } from 'express';
import { backtestQueue } from '../queues/backtestQueue.js';

// Architecture: 任务状态查询端点
// 企业为何需要：异步任务提交后，客户端需轮询获取结果
// 权衡：轮询模式不如WebSocket实时，但实现简单且RESTful

export const jobRoutes = Router();

jobRoutes.get('/jobs/:id', async (req, res) => {
  try {
    const job = await backtestQueue.getJob(req.params.id);
    if (!job) {
      res.status(404).json({
        type: 'https://httpstatuses.com/404',
        title: 'Not Found',
        status: 404,
        detail: `Job ${req.params.id} not found`,
      });
      return;
    }

    const state = await job.getState();
    const result: Record<string, unknown> = {
      id: job.id,
      type: job.data.type,
      state,
      createdAt: job.timestamp,
      processedAt: job.processedOn,
      finishedAt: job.finishedOn,
    };

    if (state === 'completed' && job.returnvalue) {
      result.result = job.returnvalue;
    } else if (state === 'failed' && job.failedReason) {
      result.error = job.failedReason;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      type: 'https://httpstatuses.com/500',
      title: 'Internal Server Error',
      status: 500,
      detail: 'Failed to fetch job status',
    });
  }
});
