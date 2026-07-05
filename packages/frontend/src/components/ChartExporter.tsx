/**
 * @file 图表 CSV 导出组件
 * @description 将图表数据导出为 CSV 文件，文件名带日期后缀。
 * @example
 * <ChartExporter data={[{ date: '2024-01', value: 100 }]} filename="growth-chart" />
 */
import { Download } from 'lucide-react';

/** ChartExporter 组件 Props */
export interface ChartExporterProps {
  /** 图表数据（每行为一个键值对象） */
  data: Array<Record<string, string | number>>;
  /** 导出文件名（不含扩展名），默认 'chart-data' */
  filename?: string;
  /** 按钮文本，默认 '导出 CSV' */
  label?: string;
}

/**
 * 工具函数：将数据转为 CSV 字符串
 *
 * - 首行为表头（取自第一个对象的所有键）
 * - 自动转义包含逗号、引号或换行的值（用双引号包裹，内部引号双写）
 * @param data 数据数组
 * @returns CSV 字符串，空数据返回空字符串
 */
function toCSV(data: Array<Record<string, string | number>>): string {
  if (data.length === 0) return '';
  const headers = Object.keys(data[0]);
  const escapeCell = (val: string | number | undefined): string => {
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
 * 图表 CSV 导出组件
 *
 * - 渲染一个导出按钮，点击后生成 CSV 并触发浏览器下载
 * - 导出文件名格式：`{filename}-{YYYY-MM-DD}.csv`
 * - 按钮使用项目现有 toolbar-btn 样式，数据为空时禁用
 */
export function ChartExporter({
  data,
  filename = 'chart-data',
  label = '导出 CSV',
}: ChartExporterProps) {
  const handleExport = () => {
    const csv = toCSV(data);
    if (!csv) return;

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const fullFilename = `${filename}-${dateStr}.csv`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fullFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const disabled = data.length === 0;

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled}
      className="toolbar-btn"
      style={{ opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      <Download className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
