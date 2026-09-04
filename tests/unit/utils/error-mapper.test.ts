import { describe, it, expect, beforeEach } from 'vitest';
import type { Response } from 'express';
import { createMockResponse } from '../../helpers/expressMocks.js';
import { translateToProblem } from '../../../packages/backend/src/utils/errorMapper.js';
import { EngineUnavailableError } from '../../../packages/backend/src/utils/engineClient.js';
import {
  UpstreamProblemError,
  ValidationError,
} from '../../../packages/backend/src/utils/errors.js';
import { TimeoutError } from '../../../packages/backend/src/utils/misc.js';

const makeRes = (): Response & { statusCode: number } =>
  createMockResponse() as Response & { statusCode: number };

describe('translateToProblem（全仓唯一错误→RFC 7807 映射）', () => {
  let res: Response & { statusCode: number };
  beforeEach(() => {
    res = makeRes();
  });

  it('EngineUnavailableError → 503 ENGINE_UNAVAILABLE + Retry-After', () => {
    const handled = translateToProblem(res, new EngineUnavailableError('/api/engine/backtest', 45));
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.header).toHaveBeenCalledWith('Retry-After', '45');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ status: 503, code: 'ENGINE_UNAVAILABLE' }),
      }),
    );
  });

  it('UpstreamProblemError → 4xx 透传（status/code 原样）', () => {
    const handled = translateToProblem(
      res,
      new UpstreamProblemError(400, 'BACKTEST_BAD_REQUEST', 'Bad Request', '参数组合无效'),
    );
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({
          status: 400,
          code: 'BACKTEST_BAD_REQUEST',
          title: 'Bad Request',
          detail: '参数组合无效',
        }),
      }),
    );
  });

  it('ValidationError（ApplicationError 子类）→ 422', () => {
    const handled = translateToProblem(res, new ValidationError('参数非法'));
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ status: 422, code: 'VALIDATION_ERROR' }),
      }),
    );
  });

  it('TimeoutError → 503 COMPUTE_TIMEOUT', () => {
    const handled = translateToProblem(res, new TimeoutError('超时'));
    expect(handled).toBe(true);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ status: 503, code: 'COMPUTE_TIMEOUT' }),
      }),
    );
  });

  it('未知错误 → 返回 false（交由调用方落 500）', () => {
    expect(translateToProblem(res, new Error('boom'))).toBe(false);
    expect(translateToProblem(res, 'string error')).toBe(false);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
