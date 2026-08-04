import { expect } from 'vitest';
import type { vi } from 'vitest';

/** 断言 mock Response 返回 RFC 7807 Problem Details 错误。 */
export function expectProblem(
  res: { status: ReturnType<typeof vi.fn>; json: ReturnType<typeof vi.fn> },
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

/** 断言 fetch Response 返回指定错误状态码（及可选错误码）。 */
export function expectError(
  res: Response,
  json: { success: boolean; error?: { code?: string } },
  status: number,
  code?: string,
) {
  expect(res.status).toBe(status);
  expect(json.success).toBe(false);
  if (code) expect(json.error?.code).toBe(code);
}
