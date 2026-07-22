/** @file Skeleton screen mirroring DataEngineDashboard layout — shown while stats load */
import type { CSSProperties } from 'react';

const CARD_STYLE: CSSProperties = { padding: 16 };

const GRID_2: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  margin: '8px 0',
};

const OVERVIEW_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: 12,
  margin: '8px 0',
};

function Bar({ width, height = 10 }: { width: string; height?: string | number }) {
  return <div className="skeleton-bar" style={{ width, height, borderRadius: 4 }} />;
}

function ActionButtonsSkeleton() {
  return (
    <div className="bt-main-card card" style={CARD_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Bar key={i} width="120px" height={36} />
        ))}
      </div>
    </div>
  );
}

function OverviewCardsSkeleton() {
  return (
    <div style={OVERVIEW_GRID}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card" style={CARD_STYLE}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Bar width="20px" height={20} />
            <Bar width="80px" height={12} />
          </div>
          <Bar width="60%" height={24} />
          <div style={{ marginTop: 8 }}>
            <Bar width="90%" height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CoverageBarsSkeleton() {
  return (
    <div className="bt-main-card card" style={CARD_STYLE}>
      <Bar width="160px" height={14} />
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <Bar width="30%" height={10} />
              <Bar width="20%" height={10} />
            </div>
            <Bar width="100%" height={8} />
          </div>
        ))}
      </div>
    </div>
  );
}

function DistributionCardSkeleton() {
  return (
    <div className="card" style={{ padding: 16 }}>
      <Bar width="50%" height={14} />
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bar width="16px" height={16} />
            <Bar width="40%" height={10} />
            <Bar width="20%" height={10} />
          </div>
        ))}
      </div>
    </div>
  );
}

function SampleTickersSkeleton() {
  return (
    <div className="card" style={{ padding: 16 }}>
      <Bar width="40%" height={14} />
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Bar width="30%" height={12} />
            <Bar width="25%" height={12} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DataEngineSkeleton() {
  return (
    <>
      <ActionButtonsSkeleton />
      <OverviewCardsSkeleton />
      <CoverageBarsSkeleton />
      <div style={GRID_2}>
        <DistributionCardSkeleton />
        <DistributionCardSkeleton />
      </div>
      <div className="bt-main-card card" style={CARD_STYLE}>
        <Bar width="40%" height={14} />
        <div
          style={{ marginTop: 16, height: 180, display: 'flex', alignItems: 'flex-end', gap: 6 }}
        >
          {Array.from({ length: 10 }).map((_, i) => (
            <Bar key={i} width="100%" height={`${30 + ((i * 13) % 60)}%`} />
          ))}
        </div>
      </div>
      <div className="bt-main-card card" style={CARD_STYLE}>
        <Bar width="40%" height={14} />
        <div
          style={{ marginTop: 16, height: 160, display: 'flex', alignItems: 'flex-end', gap: 4 }}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <Bar key={i} width="100%" height={`${20 + ((i * 17) % 70)}%`} />
          ))}
        </div>
      </div>
      <div style={GRID_2}>
        <SampleTickersSkeleton />
        <SampleTickersSkeleton />
      </div>
    </>
  );
}
