import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/uiComponents';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from 'recharts';
function generateTestData(points: number) {
  const data = [];
  let value = 100;
  for (let i = 0; i < points; i++) {
    value *= 1 + (Math.random() - 0.48) * 0.02;
    data.push({
      date: new Date(2010, 0, i + 1).toISOString().split('T')[0],
      value: Math.round(value * 100) / 100
    });
  }
  return data;
}
const testData = generateTestData(100000);
export default function ChartBenchmarkPage() {
  const { t } = useTranslation();
  const chartData = testData.filter((_, i) => i % 100 === 0);
  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-h1 text-fg">{t('chartBenchmark.title')}</h1>
      <Card className="p-4">
        <p className="mb-3 text-caption text-fg-tertiary">Recharts — 100,000 data points (downsampled for display)</p>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={chartData}>
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip isAnimationActive={false} />
            <Line dataKey="value" stroke="#3b82f6" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card className="p-4">
        <p className="text-caption text-fg-tertiary">ECharts and Visx benchmarks TBD. Default recommendation: Option C (hybrid).</p>
      </Card>
    </div>
  );
}
