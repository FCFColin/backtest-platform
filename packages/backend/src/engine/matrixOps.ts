export function isWellConditioned(result: number[][]): boolean {
  const diagElements = result.map((row, i) => Math.abs(row[i]));
  const maxDiag = Math.max(...diagElements);
  const minDiag = Math.min(...diagElements);
  return minDiag <= 0 || maxDiag / minDiag <= 1e10;
}

export function findPivotRow(aug: number[][], col: number, n: number): number {
  let maxRow = col;
  for (let row = col + 1; row < n; row++) {
    if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row;
  }
  return maxRow;
}

export function normalizePivotRow(aug: number[][], col: number, n: number): void {
  const pivot = aug[col][col];
  for (let j = 0; j < 2 * n; j++) aug[col][j] /= pivot;
}

export function eliminateColumn(aug: number[][], col: number, n: number): void {
  for (let row = 0; row < n; row++) {
    if (row === col) continue;
    const factor = aug[row][col];
    for (let j = 0; j < 2 * n; j++) aug[row][j] -= factor * aug[col][j];
  }
}

export function invertMatrix(mat: number[][]): number[][] | null {
  const n = mat.length;
  const aug: number[][] = mat.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    const maxRow = findPivotRow(aug, col, n);
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-12) return null;

    normalizePivotRow(aug, col, n);
    eliminateColumn(aug, col, n);
  }

  const result = aug.map((row) => row.slice(n));
  return isWellConditioned(result) ? result : null;
}

export function matVecMul(mat: number[][], vec: number[]): number[] {
  return mat.map((row) => row.reduce((s, v, j) => s + v * vec[j], 0));
}

export function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0);
}
