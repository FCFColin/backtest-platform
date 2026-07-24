/** @file Skeleton screen mirroring DataEngineDashboard layout — shown while stats load */
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Bar: 占位条，统一 Skeleton 样式 */
function Bar({ width, height = 10 }: { width: string; height?: string | number }) {
  return <Skeleton style={{ width, height }} />;
}

function ActionButtonsSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Bar key={i} width="120px" height={36} />
        ))}
      </div>
    </Card>
  );
}

function OverviewCardsSkeleton() {
  return (
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
  );
}

function CoverageBarsSkeleton() {
  return (
    <Card className="p-4">
      <Bar width="160px" height={14} />
      <div className="mt-4 flex flex-col gap-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div className="mb-1 flex justify-between">
              <Bar width="30%" height={10} />
              <Bar width="20%" height={10} />
            </div>
            <Bar width="100%" height={8} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function DistributionCardSkeleton() {
  return (
    <Card className="p-4">
      <Bar width="50%" height={14} />
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Bar width="16px" height={16} />
            <Bar width="40%" height={10} />
            <Bar width="20%" height={10} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function SampleTickersSkeleton() {
  return (
    <Card className="p-4">
      <Bar width="40%" height={14} />
      <div className="mt-4 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <Bar width="30%" height={12} />
            <Bar width="25%" height={12} />
          </div>
        ))}
      </div>
    </Card>
  );
}

/**
 * DataEngineSkeleton: 数据引擎加载占位骨架，镜像 Dashboard 布局。
 * @returns 渲染的骨架屏。
 */
export function DataEngineSkeleton() {
  return (
    <>
      <ActionButtonsSkeleton />
      <OverviewCardsSkeleton />
      <CoverageBarsSkeleton />
      <div className="my-2 grid grid-cols-2 gap-3">
        <DistributionCardSkeleton />
        <DistributionCardSkeleton />
      </div>
      <Card className="p-4">
        <Bar width="40%" height={14} />
        <div className="mt-4 flex h-44 items-end gap-1.5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Bar key={i} width="100%" height={`${30 + ((i * 13) % 60)}%`} />
          ))}
        </div>
      </Card>
      <Card className="p-4">
        <Bar width="40%" height={14} />
        <div className="mt-4 flex h-40 items-end gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <Bar key={i} width="100%" height={`${20 + ((i * 17) % 70)}%`} />
          ))}
        </div>
      </Card>
      <div className="my-2 grid grid-cols-2 gap-3">
        <SampleTickersSkeleton />
        <SampleTickersSkeleton />
      </div>
    </>
  );
}
