/**
 * @file ResultsTabsV2 组件
 * @description 6 一级 Tab + 二级 Tab 智能显示。
 *   一级 tab: py-3 px-4 text-body，底部 border-brand 高亮线。
 *   二级 tab: px-3 py-1.5 text-caption，bg-hover 选中。
 *   tab 状态 localStorage 保存。
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils.js';

interface SubTab {
  key: string;
  labelKey: string;
}

interface TabGroup {
  key: string;
  labelKey: string;
  subTabs: SubTab[];
}

/** Tab 结构定义（label 字段为 i18n key，运行时通过 t() 解析） */
const TAB_STRUCTURE: TabGroup[] = [
  { key: 'summary', labelKey: 'results.tabs.summary', subTabs: [] },
  {
    key: 'metrics',
    labelKey: 'results.tabs.metrics',
    subTabs: [
      { key: 'stats', labelKey: 'results.tabs.stats' },
      { key: 'custom', labelKey: 'results.tabs.custom' },
      { key: 'extended', labelKey: 'results.tabs.extended' },
    ],
  },
  {
    key: 'drawdowns',
    labelKey: 'results.tabs.drawdowns',
    subTabs: [
      { key: 'episodes', labelKey: 'results.tabs.episodes' },
      { key: 'analysis', labelKey: 'results.tabs.analysis' },
    ],
  },
  {
    key: 'returns',
    labelKey: 'results.tabs.returns',
    subTabs: [
      { key: 'distribution', labelKey: 'results.tabs.distribution' },
      { key: 'rolling', labelKey: 'results.tabs.rolling' },
      { key: 'seasonality', labelKey: 'results.tabs.seasonality' },
      { key: 'yearly', labelKey: 'results.tabs.yearly' },
    ],
  },
  {
    key: 'cashflows',
    labelKey: 'results.tabs.cashflows',
    subTabs: [
      { key: 'flows', labelKey: 'results.tabs.flows' },
      { key: 'turnover', labelKey: 'results.tabs.turnover' },
      { key: 'rebalance', labelKey: 'results.tabs.rebalance' },
    ],
  },
  {
    key: 'advanced',
    labelKey: 'results.tabs.advanced',
    subTabs: [
      { key: 'allocation', labelKey: 'results.tabs.allocation' },
      { key: 'pie', labelKey: 'results.tabs.pie' },
      { key: 'correlation', labelKey: 'results.tabs.correlation' },
      { key: 'regression', labelKey: 'results.tabs.regression' },
      { key: 'trend', labelKey: 'results.tabs.trend' },
    ],
  },
];

const STORAGE_KEY = 'results-tabs-state';

interface ResultsTabsV2Props {
  onTabChange?: (primary: string, sub?: string) => void;
  children?: (primary: string, sub: string | undefined) => React.ReactNode;
}

/**
 * 结果 Tab 组件（6 一级 + 二级智能显示）。
 * @param props - onTabChange/children render prop。
 * @returns Tab 容器元素。
 */
export function ResultsTabsV2({ onTabChange, children }: ResultsTabsV2Props) {
  const { t } = useTranslation();
  const [primaryTab, setPrimaryTab] = useState('summary');
  const [subTabState, setSubTabState] = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state = JSON.parse(saved);
        setPrimaryTab(state.primary ?? 'summary');
        setSubTabState(state.sub ?? {});
      }
    } catch {
      // 忽略解析错误
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ primary: primaryTab, sub: subTabState }));
  }, [primaryTab, subTabState]);

  const currentTab = TAB_STRUCTURE.find((tab) => tab.key === primaryTab);
  const currentSubTab = subTabState[primaryTab] ?? currentTab?.subTabs[0]?.key;

  const handlePrimaryChange = (key: string) => {
    setPrimaryTab(key);
    const tab = TAB_STRUCTURE.find((tab) => tab.key === key);
    const sub = subTabState[key] ?? tab?.subTabs[0]?.key;
    onTabChange?.(key, sub);
  };

  const handleSubChange = (subKey: string) => {
    setSubTabState({ ...subTabState, [primaryTab]: subKey });
    onTabChange?.(primaryTab, subKey);
  };

  return (
    <div>
      {/* 一级 Tab */}
      <div className="border-b border-border">
        <div className="flex items-center gap-1">
          {TAB_STRUCTURE.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handlePrimaryChange(tab.key)}
              className={cn(
                'py-3 px-4 text-body font-medium relative transition-colors',
                primaryTab === tab.key ? 'text-fg' : 'text-fg-tertiary hover:text-fg',
              )}
            >
              {t(tab.labelKey)}
              {primaryTab === tab.key && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 二级 Tab */}
      {currentTab && currentTab.subTabs.length > 0 && (
        <div className="border-b border-border-subtle bg-surface-sunken/50 px-4">
          <div className="flex items-center gap-1 py-2">
            {currentTab.subTabs.map((subTab) => (
              <button
                key={subTab.key}
                onClick={() => handleSubChange(subTab.key)}
                className={cn(
                  'px-3 py-1.5 text-caption font-medium rounded-md transition-colors',
                  currentSubTab === subTab.key
                    ? 'bg-hover text-fg'
                    : 'text-fg-tertiary hover:text-fg hover:bg-hover/50',
                )}
              >
                {t(subTab.labelKey)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 内容区 */}
      <div className="pt-6">{children?.(primaryTab, currentSubTab)}</div>
    </div>
  );
}