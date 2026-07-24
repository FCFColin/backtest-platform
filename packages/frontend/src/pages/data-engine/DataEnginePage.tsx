import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDataEngineState } from '../../hooks/useDataEngineState.js';
import { DataEngineDashboard } from '../../components/dataEngine/DataEngineDashboard.js';
import { DataEngineSkeleton } from '../../components/dataEngine/DataEngineSkeleton.js';

/**
 * DataEngineError: 数据引擎加载错误卡片，含重试按钮。
 * @param props - error/onRetry。
 * @returns 渲染的错误卡片。
 */
function DataEngineError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="flex flex-col items-center p-10 text-center">
      <div className="mb-3 text-body leading-relaxed text-danger">{error}</div>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        <RotateCcw className="size-3.5" /> {t('common.retry')}
      </Button>
    </Card>
  );
}

/**
 * DataEnginePage: 数据引擎页面，展示数据覆盖统计与管理动作。
 * @returns 渲染的数据引擎页面。
 */
export default function DataEnginePage() {
  const { t } = useTranslation();
  const { stats, universe, actionMsg, error, loadStage, fetchStats, doAction } =
    useDataEngineState();

  return (
    <div className="flex w-full flex-col gap-3">
      <h1 className="text-display text-fg">{t('dataEngine.title')}</h1>
      {error ? (
        <DataEngineError error={error} onRetry={() => fetchStats(true)} />
      ) : !stats ? (
        <>
          <DataEngineSkeleton />
          <div
            aria-live="polite"
            className="min-h-4 text-center text-caption text-fg-tertiary"
          >
            {loadStage}
          </div>
        </>
      ) : (
        <DataEngineDashboard
          stats={stats}
          universe={universe}
          actionMsg={actionMsg}
          fetchStats={fetchStats}
          doAction={doAction}
        />
      )}
    </div>
  );
}
