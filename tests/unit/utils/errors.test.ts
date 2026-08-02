import { describe, it, expect } from 'vitest';
import { sendProblem } from '../../../packages/backend/src/utils/errors.js';
import { createMockResponse } from '../../helpers/expressMocks.js';

function createMockRes(path?: string) {
  const res = createMockResponse();
  res.req = path ? { path } : undefined;
  return res;
}

describe('sendProblem', () => {
  it('应设置正确的状态码', () => {
    const res = createMockRes('/api/backtest');
    sendProblem(res, 400, 'BAD_REQUEST', '请求参数错误', { detail: '详情' });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('应设置 Content-Type 为 application/problem+json', () => {
    const res = createMockRes('/api/backtest');
    sendProblem(res, 400, 'BAD_REQUEST', '请求参数错误');
    expect(res.header).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
  });

  it('应构造符合 RFC 7807 的错误体', () => {
    const res = createMockRes('/api/backtest');
    sendProblem(res, 404, 'NOT_FOUND', '资源不存在', { detail: '详情说明' });

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          type: 'https://backtest.platform/errors/NOT_FOUND',
          title: '资源不存在',
          status: 404,
          code: 'NOT_FOUND',
          detail: '详情说明',
        }),
      }),
    );
  });

  it('应从 res.req.path 提取 instance 字段', () => {
    const res = createMockRes('/api/backtest/portfolio');
    sendProblem(res, 500, 'INTERNAL', '内部错误');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          instance: '/api/backtest/portfolio',
        }),
      }),
    );
  });

  it('res.req 不存在时 instance 应为 undefined', () => {
    const res = createMockRes();
    sendProblem(res, 500, 'INTERNAL', '内部错误');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          instance: undefined,
        }),
      }),
    );
  });

  it('detail 缺省时应传入 undefined', () => {
    const res = createMockRes('/api/test');
    sendProblem(res, 422, 'VALIDATION', '校验失败');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          detail: undefined,
        }),
      }),
    );
  });

  it('type 字段应基于 code 拼接 URL', () => {
    const res = createMockRes();
    sendProblem(res, 401, 'UNAUTHORIZED', '未授权');

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          type: 'https://backtest.platform/errors/UNAUTHORIZED',
          code: 'UNAUTHORIZED',
        }),
      }),
    );
  });

  it('应支持 5xx 状态码', () => {
    const res = createMockRes();
    sendProblem(res, 503, 'SERVICE_UNAVAILABLE', '服务不可用', { detail: '维护中' });

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          status: 503,
          code: 'SERVICE_UNAVAILABLE',
        }),
      }),
    );
  });

  it('应支持链式调用（status/header/json 返回 this）', () => {
    const res = createMockRes();
    sendProblem(res, 400, 'BAD', '错误');
    expect(res.status).toHaveBeenCalledTimes(1);
    expect(res.header).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledTimes(1);
  });
});
