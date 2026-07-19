/**
 * @file 回测页面共享类型
 * @description 定义 useBacktestPageState hook 的返回值类型，供 BacktestPage 主容器与
 *              BacktestToolbar 等子组件消费；保持 hook 与 UI 解耦，避免 prop 漂移。
 */
import type { TFunction } from 'i18next';
import type { BacktestParameters, Portfolio } from '@backtest/shared';
import type { SavedPortfolio } from '@/utils/portfolioStorage';

/**
 * useBacktestPageState 返回的页面状态与动作集合。
 *
 * - state.*: UI 受控状态（保存/加载面板的展开、当前编辑名称、已加载列表）
 * - actions.*: 触发副作用（执行回测、保存/加载/删除方案、生成分享链接）
 * - t / seoProps: 主容器渲染标题与 SEO 卡片所需
 */
export interface BacktestPageState {
  /** i18n 翻译函数（主容器渲染标题使用） */
  t: TFunction;
  /** ToolSeoCard 的属性（由 buildBacktestSeoProps 构造） */
  seoProps: {
    desc: string;
    features: { title: string; desc: string }[];
    related: { title: string; href: string }[];
    relatedLabel: string;
  };
  /** 触发回测执行（来自 backtestStore） */
  runBacktest: () => void;
  /** 当前回测参数（来自 backtestStore，保存方案时使用） */
  parameters: BacktestParameters;
  /** 当前组合列表（来自 backtestStore，保存方案时使用） */
  portfolios: Portfolio[];

  showSaveInput: boolean;
  setShowSaveInput: (v: boolean) => void;
  configName: string;
  setConfigName: (v: string) => void;
  showLoadList: boolean;
  savedConfigs: SavedPortfolio[];

  handleSaveConfig: () => Promise<void>;
  handleOpenLoadList: () => Promise<void>;
  handleLoadConfig: (config: SavedPortfolio) => void;
  handleDeleteConfig: (id: string) => Promise<void>;
  handleShareLink: () => Promise<void>;
}

/** BacktestToolbar 组件的 props（state 的子集，仅包含工具栏所需字段） */
export type BacktestToolbarProps = Pick<
  BacktestPageState,
  | 'runBacktest'
  | 'showSaveInput'
  | 'setShowSaveInput'
  | 'configName'
  | 'setConfigName'
  | 'handleSaveConfig'
  | 'showLoadList'
  | 'handleOpenLoadList'
  | 'savedConfigs'
  | 'handleLoadConfig'
  | 'handleDeleteConfig'
  | 'handleShareLink'
>;
