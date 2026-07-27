/**
 * @file ResultsTabsV2 组件
 * @description 6 一级 Tab + 二级 Tab 智能显示。
 *   一级 tab: py-3 px-4 text-body，底部 border-brand 高亮线。
 *   二级 tab: px-3 py-1.5 text-caption，bg-hover 选中。
 *   tab 状态 localStorage 保存。
 */
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils.js';

interface SubTab {
  key: string;
  label: string;
}

interface TabGroup {
  key: string;
  label: string;
  subTabs: SubTab[];
}

/** Tab 结构定义 */
const TAB_STRUCTURE: TabGroup[] = [
  { key: 'summary', label: '概览', subTabs: [] },
  {
    key: 'metrics',
    label: '指标',
    subTabs: [
      { key: 'stats', label: '统计指标' },
      { key: 'custom', label: '自定义指标' },
      { key: 'extended', label: '扩展指标' },
    ],
  },
  {
    key: 'drawdowns',
    label: '回撤',
    subTabs: [
      { key: 'episodes', label: '回撤片段' },
      { key: 'analysis', label: '回撤分析' },
    ],
  },
  {
    key: 'returns',
    label: '收益',
    subTabs: [
      { key: 'distribution', label: '收益分布' },
      { key: 'rolling', label: '滚动指标' },
      { key: 'seasonality', label: '季节性' },
      { key: 'yearly', label: '年度收益' },
    ],
  },
  {
    key: 'cashflows',
    label: '现金流',
    subTabs: [
      { key: 'flows', label: '现金流详情' },
      { key: 'turnover', label: '周转与税务' },
      { key: 'rebalance', label: '再平衡统计' },
    ],
  },
  {
    key: 'advanced',
    label: '高级',
    subTabs: [
      { key: 'allocation', label: '配置' },
      { key: 'pie', label: '配置饼图' },
      { key: 'correlation', label: '相关性与Beta' },
      { key: 'regression', label: '回归分析' },
      { key: 'trend', label: '趋势图' },
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

  const currentTab = TAB_STRUCTURE.find((t) => t.key === primaryTab);
  const currentSubTab = subTabState[primaryTab] ?? currentTab?.subTabs[0]?.key;

  const handlePrimaryChange = (key: string) => {
    setPrimaryTab(key);
    const tab = TAB_STRUCTURE.find((t) => t.key === key);
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
              {tab.label}
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
                {subTab.label}
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
