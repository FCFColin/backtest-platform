/**
 * @file 战术网格搜索（Tactical Grid Search）页面
 * @description 遍历信号参数网格（周期 × 阈值），对每个参数组合运行回测，
 *              通过热力图直观展示参数组合表现，并给出 Top N 最优参数组合。
 * @route /tactical-grid
 */
import { useTranslation } from 'react-i18next';
import { ToolPageLayout } from '../../components/layout/ToolPageLayout.js';
import { useTacticalGridState } from '@/hooks/useTacticalGridState.js';
import { GridParamsPanel } from './TacticalGridParams.js';
import { GridResultsPanel } from './TacticalGridResults.js';

export default function TacticalGridPage() {
  const { t } = useTranslation();
  const state = useTacticalGridState(t);
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">{t('tacticalGrid.title')}</h1>
      </div>
      <ToolPageLayout
        title={t('tacticalGrid.paramsSettings')}
        params={<GridParamsPanel state={state} />}
        results={<GridResultsPanel state={state} />}
      />
    </div>
  );
}
