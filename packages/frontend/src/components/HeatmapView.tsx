import { useTranslation } from 'react-i18next';
import type { HeatmapData } from '../pages/tactical/tacticalGridUtils.js';
import {
  computeHeatmapRange,
  getCellDisplayValue,
  getHeatmapColor,
  getHeatmapTextColor,
  getObjectiveLabelKey,
} from '../pages/tactical/tacticalGridUtils.js';

const HEATMAP_TH =
  'sticky top-0 z-10 min-w-[56px] border-b-2 border-r border-border-subtle bg-elevated px-2 py-1.5 text-caption font-semibold text-fg-tertiary';

function HeatmapCell({
  cell,
  p1,
  p2,
  heatmap,
  range,
  objectiveLabel,
}: {
  cell: number | null;
  p1: number;
  p2: number;
  heatmap: HeatmapData;
  range: { min: number; max: number };
  objectiveLabel: string;
}) {
  const { t } = useTranslation();
  if (cell == null)
    return (
      <td className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center text-caption text-fg-tertiary">
        -
      </td>
    );
  const displayVal = getCellDisplayValue(cell, heatmap.objective);
  return (
    <td
      title={t('{{p1Label}}={{p1}}, {{p2Label}}={{p2}}\n{{objectiveLabel}}: {{value}}', {
        p1Label: heatmap.param1Label,
        p1,
        p2Label: heatmap.param2Label,
        p2,
        objectiveLabel,
        value: displayVal,
      })}
      className="cursor-default border-b border-r border-border-subtle px-2 py-1.5 text-center font-mono text-caption font-semibold tabular-nums"
      style={{
        backgroundColor: getHeatmapColor(cell, range.min, range.max),
        color: getHeatmapTextColor(cell, range.min, range.max),
      }}
    >
      {displayVal}
    </td>
  );
}
function HeatmapLegend({ objectiveLabel }: { objectiveLabel: string }) {
  const { t } = useTranslation();
  return (
    <div className="mt-2 flex items-center gap-2 text-caption text-fg-tertiary">
      <span>{t('{{label}} Low', { label: objectiveLabel })}</span>
      <div
        className="h-3 w-28 rounded-sm"
        style={{
          background:
            'linear-gradient(to right, hsl(0,70%,45%), hsl(60,70%,45%), hsl(120,70%,45%))',
        }}
      />
      <span>{t('{{label}} High', { label: objectiveLabel })}</span>
    </div>
  );
}
export function HeatmapView({ heatmap }: { heatmap: HeatmapData }) {
  const { t } = useTranslation();
  const { param1Values, param2Values, matrix } = heatmap;
  const range = computeHeatmapRange(matrix);
  const objLabel = t(getObjectiveLabelKey(heatmap.objective));
  return (
    <div className="overflow-x-auto">
      <table className="my-2 border-collapse text-caption">
        <thead>
          <tr>
            <th className={HEATMAP_TH}>
              {t('{{p1Label}}  {{p2Label}}', {
                p1Label: heatmap.param1Label,
                p2Label: heatmap.param2Label,
              })}
            </th>
            {param2Values.map((p2) => (
              <th key={p2} className={HEATMAP_TH}>
                {p2}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {param1Values.map((p1, i) => (
            <tr key={p1}>
              <td className="border-b border-r border-border-subtle bg-input-bg/40 px-2 py-1.5 text-caption font-semibold text-fg">
                {p1}
              </td>
              {param2Values.map((p2, j) => (
                <HeatmapCell
                  key={p2}
                  cell={matrix[i]?.[j] ?? null}
                  p1={p1}
                  p2={p2}
                  heatmap={heatmap}
                  range={range}
                  objectiveLabel={objLabel}
                />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <HeatmapLegend objectiveLabel={objLabel} />
    </div>
  );
}
