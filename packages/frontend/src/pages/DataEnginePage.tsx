/**
 * @file 数据引擎页面
 * @description 展示底层数据引擎的缓存统计、市场分布、数据质量及覆盖范围等元信息
 * @route /data-engine
 */
import { useDataEngineState } from '../hooks/useDataEngineState.js';
import {
  DataEngineDashboard,
  DataEngineLoading,
} from '../components/dataEngine/DataEngineDashboard.js';
import { UniverseInfo } from '../components/dataEngine/DataEnginePresets.js';

export default function DataEnginePage() {
  const { stats, universe, actionMsg, error, loadStage, fetchStats, doAction } =
    useDataEngineState();

  if (!stats)
    return (
      <DataEngineLoading error={error} loadStage={loadStage} onRetry={() => fetchStats(true)} />
    );

  return (
    <>
      <DataEngineDashboard
        stats={stats}
        universe={universe}
        actionMsg={actionMsg}
        fetchStats={fetchStats}
        doAction={doAction}
      />
      {universe && <UniverseInfo universe={universe} />}
    </>
  );
}
