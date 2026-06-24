export interface BacktestCompleted {
  type: 'BacktestCompleted';
  portfolioId: string;
  timestamp: Date;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
}
