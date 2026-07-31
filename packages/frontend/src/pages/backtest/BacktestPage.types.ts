import type { TFunction } from 'i18next';
import type { BacktestParameters, Portfolio } from '@backtest/shared';
import type { SavedPortfolio } from '@/utils/portfolioStorage';
export interface BacktestPageState {
  t: TFunction;
  seoProps: {
    desc: string;
    features: { title: string; desc: string }[];
    related: { title: string; href: string }[];
    relatedLabel: string;
  };
  runBacktest: () => void;
  parameters: BacktestParameters;
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
export type BacktestToolbarProps = Pick<BacktestPageState, 'runBacktest' | 'showSaveInput' | 'setShowSaveInput' | 'configName' | 'setConfigName' | 'handleSaveConfig' | 'showLoadList' | 'handleOpenLoadList' | 'savedConfigs' | 'handleLoadConfig' | 'handleDeleteConfig' | 'handleShareLink'>;
