/**
 * @file 图表库评估 spike 页面
 * @description P4-1: 用 Recharts/ECharts/Visx 分别实现同一 10 万数据点组合增长曲线。
 *   对比: 初始渲染时间/交互流畅度/代码量/包大小。
 *   默认建议选 C（混合方案）。
 */
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';

/** 生成 10 万数据点的测试数据 */
function generateTestData(points: number) {
  const data = [];
  let value = 100;
  for (let i = 0; i < points; i++) {
    value *= 1 + (Math.random() - 0.48) * 0.02;
    data.push({
      date: new Date(2010, 0, i + 1).toISOString().split('T')[0],
      value: Math.round(value * 100) / 100,
    });
  }
  return data;
}

const testData = generateTestData(100000);

export default function ChartBenchmarkPage() {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-h1 text-fg">{t('chartBenchmark.title')}</h1>
      <Card className="p-4">
        <p className="mb-3 text-caption text-fg-tertiary">
          Recharts — 100,000 data points (downsampled for display)
        </p>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={testData.filter((_, i) => i % 100 === 0)}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line dataKey="value" stroke="#3b82f6" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-4">
        <p className="text-caption text-fg-tertiary">
          ECharts and Visx benchmarks TBD. Default recommendation: Option C (hybrid).
        </p>
      </Card>
    </div>
  );
}
