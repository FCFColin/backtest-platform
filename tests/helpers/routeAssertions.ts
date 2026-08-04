import { expect } from 'vitest';

/** 断言 mock Response 以指定 HTTP 状态码响应。 */
export function expectStatus(res: { status: ReturnType<typeof jest.fn> | number }, code: number) {
  if (typeof res.status === 'number') {
    expect(res.status).toBe(code);
  } else {
    expect(res.status).toHaveBeenCalledWith(code);
  }
}

/** 断言 mock Response 返回 RFC 7807 Problem Details 错误。 */
export function expectProblem(
  res: { status: ReturnType<typeof jest.fn>; json: ReturnType<typeof jest.fn> },
  code: string,
  status: number,
) {
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code }),
    }),
  );
}

/** 断言 mock Response 返回成功响应。 */
export function expectSuccess(res: { json: ReturnType<typeof jest.fn> }, dataMatcher?: unknown) {
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      ...(dataMatcher ? { data: dataMatcher } : {}),
    }),
  );
}
