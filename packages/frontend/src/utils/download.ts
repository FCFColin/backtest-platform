/**
 * 客户端文件导出工具 — 统一 CSV/JSON 下载实现。
 *
 * 消除 ChartExporter / BacktestResults / PortfolioEditor 三处重复的
 * Blob → createObjectURL → a[download] → click → revoke 样板。
 */

/**
 * 将记录数组序列化为 CSV（RFC 4180 转义：逗号/引号/换行加引号）。
 *
 * @param data - 扁平记录数组，表头取首行 key
 * @returns CSV 字符串（空数组返回 ''）
 */
export function toCSV(data: Array<Record<string, string | number | undefined | null>>): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const escapeCell = (val: string | number | undefined | null): string => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const rows = data.map((row) => headers.map((h) => escapeCell(row[h])).join(','));
  return [headers.join(','), ...rows].join('\n');
}

/**
 * 触发浏览器下载。
 *
 * @param content - 文件内容
 * @param filename - 文件名（含扩展名）
 * @param type - MIME 类型
 */
export function downloadFile(content: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** 以今日日期生成文件名：`${base}-YYYY-MM-DD.ext` */
export function dateSuffixedFilename(base: string, ext: string): string {
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${base}-${dateStr}.${ext}`;
}

/**
 * 将记录数组导出为 CSV 并触发下载。
 *
 * @param data - 记录数组
 * @param base - 文件名基础（不含日期与扩展名）
 */
export function downloadCSV(data: Array<Record<string, string | number | undefined | null>>, base: string): void {
  const csv = toCSV(data);
  if (!csv) return;
  downloadFile(csv, dateSuffixedFilename(base, 'csv'), 'text/csv;charset=utf-8;');
}

/**
 * 将对象导出为 JSON 文件并触发下载。
 *
 * @param data - 任意可序列化对象
 * @param filename - 完整文件名（含 .json）
 */
export function downloadJSON(data: unknown, filename: string): void {
  downloadFile(JSON.stringify(data, null, 2), filename, 'application/json');
}
