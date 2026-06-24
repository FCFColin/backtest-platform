/**
 * @file 回测参数面板
 * @description 回测核心参数配置面板，包括标的、权重、日期范围及调仓策略等设置。
 * 使用 ParamsPanel/ParamsSection 组件组织可折叠分区，对标 testfol.io 参数区风格。
 */
import { useBacktestStore } from '@/store/backtestStore';
import { useToastStore } from '@/store/toastStore';
import { Plus, X } from 'lucide-react';
import TickerInput from './TickerInput';
import { ParamsPanel, ParamsSection } from './ParamsPanel';
import type { RebalanceBands } from '../../shared/types';

function validateDateChange(
  field: 'startDate' | 'endDate',
  value: string,
  otherDate: string,
  otherField: 'startDate' | 'endDate',
): string | null {
  if (!value) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (field === 'endDate' && value > today) return '结束日期不能晚于今天';
  if (field === 'startDate' && otherDate && value > otherDate) return '开始日期不能晚于结束日期';
  if (field === 'endDate' && otherDate && value < otherDate) return '结束日期不能早于开始日期';
  return null;
}

export default function ParameterPanel() {
  const parameters = useBacktestStore(s => s.parameters);
  const updateParameter = useBacktestStore(s => s.updateParameter);
  const portfolios = useBacktestStore(s => s.portfolios);
  const updatePortfolio = useBacktestStore(s => s.updatePortfolio);
  const addCashflowLeg = useBacktestStore(s => s.addCashflowLeg);
  const removeCashflowLeg = useBacktestStore(s => s.removeCashflowLeg);
  const updateCashflowLeg = useBacktestStore(s => s.updateCashflowLeg);
  const addOneTimeCashflow = useBacktestStore(s => s.addOneTimeCashflow);
  const removeOneTimeCashflow = useBacktestStore(s => s.removeOneTimeCashflow);
  const updateOneTimeCashflow = useBacktestStore(s => s.updateOneTimeCashflow);

  return (
    <div className="params-section">
      <div className="params-title">参数设置</div>

      <ParamsPanel>
        {/* ============ 基本参数 ============ */}
        <ParamsSection
          title="基本参数"
          info="设置回测的日期范围、初始资金、货币、通胀调整、滚动窗口及基准标的。"
        >
          <div className="params-row">
            {/* 全部历史 */}
            <label className="param-check">
              <input
                type="checkbox"
                checked={parameters.startDate === '' && parameters.endDate === ''}
                onChange={(e) => {
                  if (e.target.checked) {
                    updateParameter('startDate', '');
                    updateParameter('endDate', '');
                  } else {
                    updateParameter('startDate', '2010-01-01');
                    updateParameter('endDate', '2024-12-31');
                  }
                }}
              />
              <span>全部历史</span>
            </label>

            {/* 日期范围 */}
            <div className="param-field">
              <label className="param-label">开始日期</label>
              <input
                type="date"
                value={parameters.startDate}
                onChange={(e) => {
                  const err = validateDateChange('startDate', e.target.value, parameters.endDate, 'endDate');
                  if (err) { useToastStore.getState().addToast('warning', err); return; }
                  updateParameter('startDate', e.target.value);
                }}
                className="param-input"
              />
            </div>
            <div className="param-field">
              <label className="param-label">结束日期</label>
              <input
                type="date"
                value={parameters.endDate}
                onChange={(e) => {
                  const err = validateDateChange('endDate', e.target.value, parameters.startDate, 'startDate');
                  if (err) { useToastStore.getState().addToast('warning', err); return; }
                  updateParameter('endDate', e.target.value);
                }}
                className="param-input"
              />
            </div>

            {/* 初始资金 */}
            <div className="param-field param-field-start-val">
              <label className="param-label">初始资金</label>
              <div className="param-input-prefix-wrap">
                <span className="param-input-prefix">{parameters.baseCurrency === 'usd' ? '$' : '¥'}</span>
                <input
                  type="number"
                  value={parameters.startingValue}
                  onChange={(e) => updateParameter('startingValue', Math.max(1, Number(e.target.value) || 0))}
                  min={1}
                  step={1000}
                  className="param-input param-input-with-prefix"
                />
              </div>
            </div>

            {/* 基础货币 */}
            <div className="param-field" style={{ width: 90 }}>
              <label className="param-label">货币</label>
              <select
                value={parameters.baseCurrency}
                onChange={(e) => updateParameter('baseCurrency', e.target.value as 'usd' | 'cny')}
                className="param-input"
              >
                <option value="usd">USD ($)</option>
                <option value="cny">CNY (¥)</option>
              </select>
            </div>

            {/* 通胀调整 */}
            <label className="param-toggle">
              <span>通胀调整</span>
              <div
                className={`toggle-switch ${parameters.adjustForInflation ? 'active' : ''}`}
                onClick={() => updateParameter('adjustForInflation', !parameters.adjustForInflation)}
              />
            </label>
            {parameters.adjustForInflation && (
              <span className="param-hint" style={{ color: '#f59e0b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                {parameters.baseCurrency === 'usd' ? '使用美国CPI' : '使用中国CPI'}
              </span>
            )}

            {/* 滚动窗口 */}
            <div className="param-field param-field-rolling">
              <label className="param-label">滚动窗口</label>
              <div className="param-input-suffix-wrap">
                <input
                  type="number"
                  value={parameters.rollingWindowMonths}
                  onChange={(e) => updateParameter('rollingWindowMonths', Math.max(1, Number(e.target.value) || 12))}
                  min={1}
                  max={120}
                  className="param-input param-input-with-suffix"
                />
                <span className="param-input-suffix">月</span>
              </div>
            </div>

            {/* 扩展提款统计 */}
            <label className="param-check">
              <input
                type="checkbox"
                checked={parameters.extendedWithdrawalStats}
                onChange={(e) => updateParameter('extendedWithdrawalStats', e.target.checked)}
              />
              <span>扩展提款统计</span>
            </label>

            {/* 基准标的 */}
            <label className="param-check">
              <input
                type="checkbox"
                checked={parameters.benchmarkTicker !== ''}
                onChange={(e) => {
                  if (e.target.checked) {
                    updateParameter('benchmarkTicker', 'SPY');
                  } else {
                    updateParameter('benchmarkTicker', '');
                  }
                }}
              />
              <span>选择基准</span>
            </label>
            {parameters.benchmarkTicker !== '' && (
              <div className="param-field" style={{ width: 120 }}>
                <TickerInput
                  value={parameters.benchmarkTicker}
                  onChange={(v) => updateParameter('benchmarkTicker', v)}
                  placeholder="SPY"
                />
              </div>
            )}
          </div>
        </ParamsSection>

        {/* ============ 组合高级设置：Drag / TotalReturn / RebalanceBands ============ */}
        <ParamsSection
          title="组合高级设置"
          defaultOpen={false}
          info="为每个组合设置年度拖累、总回报模式及再平衡偏离带。偏离带支持对称（绝对/相对）与非对称（上限/下限）两种模式。"
        >
          <div className="params-subsection-body">
            {portfolios.map((portfolio) => (
              <div key={portfolio.id} className="cashflow-leg-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
                <div className="text-[12px] font-semibold" style={{ color: 'var(--text-strong)', width: '100%', marginBottom: '2px' }}>
                  {portfolio.name}
                </div>

                {/* Drag */}
                <div className="param-field" style={{ width: 100 }}>
                  <label className="param-label">年度拖累</label>
                  <div className="param-input-suffix-wrap">
                    <input
                      type="number"
                      value={portfolio.drag ?? 0}
                      onChange={(e) => updatePortfolio(portfolio.id, { drag: Number(e.target.value) || 0 })}
                      min={0}
                      max={10}
                      step={0.1}
                      className="param-input param-input-with-suffix"
                    />
                    <span className="param-input-suffix">%</span>
                  </div>
                </div>

                {/* Total Return */}
                <label className="param-check" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={portfolio.totalReturn ?? true}
                    onChange={(e) => updatePortfolio(portfolio.id, { totalReturn: e.target.checked })}
                  />
                  <span>总回报模式</span>
                </label>

                {/* Rebalance Bands 启用 */}
                <label className="param-check" style={{ marginBottom: 0 }}>
                  <input
                    type="checkbox"
                    checked={portfolio.rebalanceBands?.enabled ?? false}
                    onChange={(e) => {
                      const current = portfolio.rebalanceBands || { enabled: false };
                      const updated: RebalanceBands = { ...current, enabled: e.target.checked };
                      if (e.target.checked && updated.absoluteBand === undefined) {
                        updated.absoluteBand = 5;
                      }
                      if (e.target.checked && updated.relativeBand === undefined) {
                        updated.relativeBand = 20;
                      }
                      updatePortfolio(portfolio.id, { rebalanceBands: updated });
                    }}
                  />
                  <span>启用再平衡带</span>
                </label>

                {portfolio.rebalanceBands?.enabled && (
                  <>
                    {/* 对称带：绝对 / 相对 */}
                    <div className="param-field" style={{ width: 100 }}>
                      <label className="param-label">绝对带 (对称)</label>
                      <div className="param-input-suffix-wrap">
                        <input
                          type="number"
                          value={portfolio.rebalanceBands?.absoluteBand ?? 5}
                          onChange={(e) => {
                            const current = portfolio.rebalanceBands || { enabled: true };
                            updatePortfolio(portfolio.id, {
                              rebalanceBands: { ...current, absoluteBand: Number(e.target.value) || 0 },
                            });
                          }}
                          min={0}
                          max={50}
                          step={0.5}
                          className="param-input param-input-with-suffix"
                        />
                        <span className="param-input-suffix">±%</span>
                      </div>
                    </div>
                    <div className="param-field" style={{ width: 100 }}>
                      <label className="param-label">相对带 (对称)</label>
                      <div className="param-input-suffix-wrap">
                        <input
                          type="number"
                          value={portfolio.rebalanceBands?.relativeBand ?? 20}
                          onChange={(e) => {
                            const current = portfolio.rebalanceBands || { enabled: true };
                            updatePortfolio(portfolio.id, {
                              rebalanceBands: { ...current, relativeBand: Number(e.target.value) || 0 },
                            });
                          }}
                          min={0}
                          max={100}
                          step={1}
                          className="param-input param-input-with-suffix"
                        />
                        <span className="param-input-suffix">±%</span>
                      </div>
                    </div>

                    {/* 非对称带：上限 / 下限 */}
                    <div className="param-field" style={{ width: 100 }}>
                      <label className="param-label">上限 (非对称)</label>
                      <div className="param-input-suffix-wrap">
                        <input
                          type="number"
                          value={portfolio.rebalanceBands?.upperBand ?? ''}
                          onChange={(e) => {
                            const current = portfolio.rebalanceBands || { enabled: true };
                            const v = e.target.value === '' ? undefined : Number(e.target.value);
                            updatePortfolio(portfolio.id, {
                              rebalanceBands: { ...current, upperBand: v },
                            });
                          }}
                          min={0}
                          max={50}
                          step={0.5}
                          className="param-input param-input-with-suffix"
                          placeholder="—"
                        />
                        <span className="param-input-suffix">%</span>
                      </div>
                    </div>
                    <div className="param-field" style={{ width: 100 }}>
                      <label className="param-label">下限 (非对称)</label>
                      <div className="param-input-suffix-wrap">
                        <input
                          type="number"
                          value={portfolio.rebalanceBands?.lowerBand ?? ''}
                          onChange={(e) => {
                            const current = portfolio.rebalanceBands || { enabled: true };
                            const v = e.target.value === '' ? undefined : Number(e.target.value);
                            updatePortfolio(portfolio.id, {
                              rebalanceBands: { ...current, lowerBand: v },
                            });
                          }}
                          min={0}
                          max={50}
                          step={0.5}
                          className="param-input param-input-with-suffix"
                          placeholder="—"
                        />
                        <span className="param-input-suffix">%</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </ParamsSection>

        {/* ============ 现金流腿 ============ */}
        <ParamsSection
          title="现金流腿"
          defaultOpen={false}
          info="周期性现金流：设定金额、类型（投入/提取）、频率、偏移与结束日期，可添加多条腿。"
        >
          <div className="params-subsection-body">
            {(parameters.cashflowLegs || []).map((leg) => (
              <div key={leg.id} className="cashflow-leg-row">
                {/* 金额 */}
                <div className="param-field" style={{ width: 100 }}>
                  <label className="param-label">金额</label>
                  <div className="param-input-prefix-wrap">
                    <span className="param-input-prefix">{parameters.baseCurrency === 'usd' ? '$' : '¥'}</span>
                    <input
                      type="number"
                      value={leg.amount || ''}
                      onChange={(e) => updateCashflowLeg(leg.id, { amount: Math.abs(Number(e.target.value) || 0) })}
                      className="param-input param-input-with-prefix"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* 类型 */}
                <div className="param-field" style={{ width: 100 }}>
                  <label className="param-label">现金流类型</label>
                  <select
                    value={leg.type}
                    onChange={(e) => updateCashflowLeg(leg.id, { type: e.target.value as 'contribution' | 'withdrawal' })}
                    className="param-input"
                  >
                    <option value="contribution">投入</option>
                    <option value="withdrawal">提取</option>
                  </select>
                </div>

                {/* 频率 */}
                <div className="param-field" style={{ width: 100 }}>
                  <label className="param-label">频率</label>
                  <select
                    value={leg.frequency}
                    onChange={(e) => updateCashflowLeg(leg.id, { frequency: e.target.value as 'yearly' | 'monthly' | 'quarterly' | 'weekly' })}
                    className="param-input"
                  >
                    <option value="yearly">每年</option>
                    <option value="quarterly">每季度</option>
                    <option value="monthly">每月</option>
                    <option value="weekly">每周</option>
                  </select>
                </div>

                {/* 偏移 */}
                <div className="param-field" style={{ width: 70 }}>
                  <label className="param-label">偏移</label>
                  <input
                    type="number"
                    value={leg.offset || ''}
                    onChange={(e) => updateCashflowLeg(leg.id, { offset: Number(e.target.value) || 0 })}
                    className="param-input"
                    placeholder="0"
                  />
                </div>

                {/* 结束日期 */}
                <div className="param-field" style={{ width: 120 }}>
                  <label className="param-label">直到</label>
                  <input
                    type="date"
                    value={leg.until || ''}
                    onChange={(e) => updateCashflowLeg(leg.id, { until: e.target.value })}
                    className="param-input"
                  />
                </div>

                {/* 删除 */}
                <button
                  className="row-remove-btn"
                  onClick={() => removeCashflowLeg(leg.id)}
                  title="删除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button className="toolbar-btn" onClick={addCashflowLeg}>
              <Plus className="w-3.5 h-3.5" />
              添加现金流腿
            </button>
          </div>
        </ParamsSection>

        {/* ============ 一次性现金流 ============ */}
        <ParamsSection
          title="一次性现金流"
          defaultOpen={false}
          info="在指定日期发生的一次性投入或提取，可添加多条。"
        >
          <div className="params-subsection-body">
            {(parameters.oneTimeCashflows || []).map((cf) => (
              <div key={cf.id} className="cashflow-leg-row">
                {/* 金额 */}
                <div className="param-field" style={{ width: 100 }}>
                  <label className="param-label">金额</label>
                  <div className="param-input-prefix-wrap">
                    <span className="param-input-prefix">{parameters.baseCurrency === 'usd' ? '$' : '¥'}</span>
                    <input
                      type="number"
                      value={cf.amount || ''}
                      onChange={(e) => updateOneTimeCashflow(cf.id, { amount: Math.abs(Number(e.target.value) || 0) })}
                      className="param-input param-input-with-prefix"
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* 类型 */}
                <div className="param-field" style={{ width: 100 }}>
                  <label className="param-label">类型</label>
                  <select
                    value={cf.type}
                    onChange={(e) => updateOneTimeCashflow(cf.id, { type: e.target.value as 'contribution' | 'withdrawal' })}
                    className="param-input"
                  >
                    <option value="contribution">投入</option>
                    <option value="withdrawal">提取</option>
                  </select>
                </div>

                {/* 日期 */}
                <div className="param-field" style={{ width: 130 }}>
                  <label className="param-label">日期</label>
                  <input
                    type="date"
                    value={cf.date}
                    onChange={(e) => updateOneTimeCashflow(cf.id, { date: e.target.value })}
                    className="param-input"
                  />
                </div>

                {/* 删除 */}
                <button
                  className="row-remove-btn"
                  onClick={() => removeOneTimeCashflow(cf.id)}
                  title="删除"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}

            <button className="toolbar-btn" onClick={addOneTimeCashflow}>
              <Plus className="w-3.5 h-3.5" />
              添加一次性现金流
            </button>
          </div>
        </ParamsSection>
      </ParamsPanel>
    </div>
  );
}
