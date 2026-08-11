import { Card, Skeleton } from '@/components/ui/uiComponents';

function Bar({ width, height = 10 }: { width: string; height?: string | number }) {
  return <Skeleton style={{ width, height }} />;
}
interface SkeletonRow {
  bars: Array<{ w: string; h: string | number }>;
  rowClass?: string;
}
const rowsOf = (
  n: number,
  rowClass: string,
  bars: Array<{ w: string; h: string | number }>,
): SkeletonRow[] => Array.from({ length: n }, () => ({ rowClass, bars }));
function SkeletonRowsCard({
  titleW,
  rows,
  wrapperClass = 'mt-4 flex flex-col gap-2.5',
}: {
  titleW: string;
  rows: SkeletonRow[];
  wrapperClass?: string;
}) {
  return (
    <Card className="p-4">
      <Bar width={titleW} height={14} />
      <div className={wrapperClass}>
        {rows.map((row, i) => (
          <div key={i} className={row.rowClass}>
            {row.bars.map((b, j) => (
              <Bar key={j} width={b.w} height={b.h} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}
const COVERAGE_SKELETON_ROWS: SkeletonRow[] = Array.from({ length: 12 }, (_, i) =>
  i % 2 === 0
    ? {
        rowClass: 'mb-1 flex justify-between',
        bars: [
          { w: '30%', h: 10 },
          { w: '20%', h: 10 },
        ],
      }
    : { bars: [{ w: '100%', h: 8 }] },
);
function HistogramSkeleton({
  barClass,
  n,
  pct,
}: {
  barClass: string;
  n: number;
  pct: (i: number) => string;
}) {
  return (
    <Card className="p-4">
      <Bar width="40%" height={14} />
      <div className={`mt-4 flex items-end ${barClass}`}>
        {Array.from({ length: n }).map((_, i) => (
          <Bar key={i} width="100%" height={pct(i)} />
        ))}
      </div>
    </Card>
  );
}
export function DataEngineSkeleton() {
  const distRows = rowsOf(5, 'flex items-center gap-2', [
    { w: '16px', h: 16 },
    { w: '40%', h: 10 },
    { w: '20%', h: 10 },
  ]);
  const sampleRows = rowsOf(6, 'flex justify-between', [
    { w: '30%', h: 12 },
    { w: '25%', h: 12 },
  ]);
  return (
    <>
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Bar key={i} width="120px" height={36} />
          ))}
        </div>
      </Card>
      <div className="my-2 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Bar width="20px" height={20} />
              <Bar width="80px" height={12} />
            </div>
            <Bar width="60%" height={24} />
            <div className="mt-2">
              <Bar width="90%" height={12} />
            </div>
          </Card>
        ))}
      </div>
      <SkeletonRowsCard titleW="160px" rows={COVERAGE_SKELETON_ROWS} />
      <div className="my-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SkeletonRowsCard titleW="50%" wrapperClass="mt-4 flex flex-col gap-2" rows={distRows} />
        <SkeletonRowsCard titleW="50%" wrapperClass="mt-4 flex flex-col gap-2" rows={distRows} />
      </div>
      <HistogramSkeleton barClass="h-60 gap-1.5" n={10} pct={(i) => `${30 + ((i * 13) % 60)}%`} />
      <HistogramSkeleton barClass="h-60 gap-1" n={12} pct={(i) => `${20 + ((i * 17) % 70)}%`} />
      <div className="my-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <SkeletonRowsCard titleW="40%" wrapperClass="mt-4 flex flex-col gap-2" rows={sampleRows} />
        <SkeletonRowsCard titleW="40%" wrapperClass="mt-4 flex flex-col gap-2" rows={sampleRows} />
      </div>
    </>
  );
}
