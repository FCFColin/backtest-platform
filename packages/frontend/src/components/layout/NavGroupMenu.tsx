/**
 * @file 导航分组配置与渲染
 * @description 合并自 navConfig.ts（NAV_GROUP_KEYS 路由分组数据）与 NavGroupMenu.tsx（NavGroup 渲染器）。
 *   路由分组数据与渲染器紧密耦合：NavGroup 直接消费 NAV_GROUP_KEYS 类型与 items 结构。
 */
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';

// ============ 导航分组配置 ============

export const NAV_GROUP_KEYS = [
  {
    key: 'backtest',
    items: [
      { to: '/', key: 'portfolioBacktest' },
      { to: '/backtest-optimizer', key: 'backtestOptimizer' },
      { to: '/rebalancing-sensitivity', key: 'rebalancingSensitivity' },
    ],
  },
  {
    key: 'analysis',
    items: [
      { to: '/analysis', key: 'assetAnalysis' },
      { to: '/factor-regression', key: 'factorRegression' },
      { to: '/pca', key: 'pca' },
    ],
  },
  {
    key: 'optimize',
    items: [
      { to: '/optimizer', key: 'portfolioOptimize' },
      { to: '/efficient-frontier', key: 'efficientFrontier' },
      { to: '/monte-carlo', key: 'monteCarlo' },
      { to: '/goal-optimizer', key: 'goalOptimizer' },
    ],
  },
  {
    key: 'tactical',
    items: [
      { to: '/tactical', key: 'tacticalAllocation' },
      { to: '/tactical-grid', key: 'tacticalGrid' },
      { to: '/signal-analyzer', key: 'signalAnalyzer' },
      { to: '/dual-signal', key: 'dualSignal' },
      { to: '/multi-signal', key: 'multiSignal' },
    ],
  },
  {
    key: 'more',
    items: [
      { to: '/lumpsum-vs-dca', key: 'lumpsumVsDca' },
      { to: '/letf-slippage', key: 'letfSlippage' },
      { to: '/calculators', key: 'calculators' },
      { to: '/data-engine', key: 'dataEngine' },
    ],
  },
] as const;

// ============ NavGroup 渲染器 ============

function NavDropdownItems({
  group,
  isActive,
  onToggle,
  t,
}: {
  group: (typeof NAV_GROUP_KEYS)[number];
  isActive: (to: string) => boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="navbar-dropdown">
      {group.items.map((item) => {
        const active = isActive(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`navbar-dropdown-item${active ? ' active' : ''}`}
            onClick={() => onToggle('')}
          >
            {t(`nav.${item.key}`)}
          </Link>
        );
      })}
    </div>
  );
}

export function NavGroup({
  group,
  isActive,
  isOpen,
  onToggle,
  t,
}: {
  group: (typeof NAV_GROUP_KEYS)[number];
  isActive: (to: string) => boolean;
  isOpen: boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
}) {
  const groupActive = group.items.some((item) => isActive(item.to));
  return (
    <div className="navbar-group">
      <button
        className={`navbar-group-btn${groupActive ? ' active' : ''}${isOpen ? ' open' : ''}`}
        onClick={() => onToggle(isOpen ? '' : group.key)}
      >
        {t(`nav.${group.key}`)}
        <ChevronDown className="chevron" />
        {groupActive && <span className="navbar-group-indicator" />}
      </button>
      {isOpen && <NavDropdownItems group={group} isActive={isActive} onToggle={onToggle} t={t} />}
    </div>
  );
}
