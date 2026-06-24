// DDD: Domain Event — RebalanceTriggered
// 企业为何需要：事件驱动架构的基础，解耦触发者和执行者
// 权衡：事件增加系统复杂度，但解耦后各模块可独立演进

export interface RebalanceTriggered {
  type: 'RebalanceTriggered';
  portfolioId: string;
  timestamp: Date;
  reason: string;
  currentWeights: Record<string, number>;
}
