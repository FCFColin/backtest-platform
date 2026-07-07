import { describe, it, expect } from 'vitest';
import {
  invertMatrix,
  matVecMul,
  dot,
  isWellConditioned,
} from '../../../packages/backend/src/engine/matrixOps.js';

describe('invertMatrix', () => {
  it('2x2 可逆矩阵', () => {
    const inv = invertMatrix([
      [2, 0],
      [0, 2],
    ]);
    expect(inv).not.toBeNull();
    if (inv) {
      expect(inv[0][0]).toBeCloseTo(0.5, 5);
      expect(inv[1][1]).toBeCloseTo(0.5, 5);
    }
  });

  it('奇异矩阵返回 null', () => {
    const inv = invertMatrix([
      [1, 2],
      [2, 4],
    ]);
    expect(inv).toBeNull();
  });

  it('空矩阵返回 null', () => {
    const inv = invertMatrix([]);
    expect(inv).toBeNull();
  });
});

describe('matVecMul', () => {
  it('2x2 矩阵乘 2 维向量', () => {
    const result = matVecMul(
      [
        [1, 2],
        [3, 4],
      ],
      [5, 6],
    );
    expect(result).toEqual([17, 39]);
  });
});

describe('dot', () => {
  it('两个向量的点积', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
  });

  it('零向量', () => {
    expect(dot([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe('isWellConditioned', () => {
  it('良态矩阵返回 true', () => {
    expect(
      isWellConditioned([
        [5, 0],
        [0, 3],
      ]),
    ).toBe(true);
  });

  it('比值在阈值内算良态', () => {
    // minDiag=1e-10, maxDiag=1, 比值=1e10 <= 1e10 → 良态
    expect(
      isWellConditioned([
        [1e-10, 0],
        [0, 1],
      ]),
    ).toBe(true);
  });

  it('病态矩阵（比值 > 1e10）返回 false', () => {
    // minDiag=1e-11, maxDiag=1, 比值=1e11 > 1e10 → 病态
    expect(
      isWellConditioned([
        [1e-11, 0],
        [0, 1],
      ]),
    ).toBe(false);
  });

  it('零对角元按当前逻辑视为良态', () => {
    // minDiag=0 → minDiag <= 0 → true
    expect(
      isWellConditioned([
        [0, 1],
        [2, 3],
      ]),
    ).toBe(true);
  });
});
