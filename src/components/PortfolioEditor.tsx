/**
 * @file 投资组合编辑器
 * @description 投资组合配置编辑面板，支持增删标的、调整权重、设置调仓策略及导入导出
 */
import { useState, useMemo } from 'react';
import { useBacktestStore } from '@/store/backtestStore';
import { X, Plus, Copy, Download, Trash2, Share2 } from 'lucide-react';
import TickerInput from './TickerInput';
import WeightInput from './WeightInput';
import type { RebalanceFrequency } from '../../shared/types';
import { useToastStore } from '@/store/toastStore';

const REBALANCE_OPTIONS: { value: RebalanceFrequency; label: string }[] = [
  { value: 'none', label: '不调仓' },
  { value: 'annual', label: '每年' },
  { value: 'quarterly', label: '每季度' },
  { value: 'monthly', label: '每月' },
  { value: 'weekly', label: '每周' },
  { value: 'daily', label: '每日' },
  { value: 'threshold', label: '偏离调仓' },
];

export default function PortfolioEditor() {
  const portfolios = useBacktestStore(s => s.portfolios);
  const addPortfolio = useBacktestStore(s => s.addPortfolio);
  const addGlidepath = useBacktestStore(s => s.addGlidepath);
  const duplicatePortfolio = useBacktestStore(s => s.duplicatePortfolio);
  const removePortfolio = useBacktestStore(s => s.removePortfolio);
  const addAsset = useBacktestStore(s => s.addAsset);
  const removeAsset = useBacktestStore(s => s.removeAsset);
  const updateAsset = useBacktestStore(s => s.updateAsset);
  const batchUpdateAssets = useBacktestStore(s => s.batchUpdateAssets);
  const updatePortfolio = useBacktestStore(s => s.updatePortfolio);
  const parameters = useBacktestStore(s => s.parameters);

  const [showGlidepathForm, setShowGlidepathForm] = useState(false);
  const [gpName, setGpName] = useState('滑行路径 1');
  const [gpFrom, setGpFrom] = useState('');
  const [gpTo, setGpTo] = useState('');
  const [gpYears, setGpYears] = useState(10);

  const nonGlidepathPortfolios = useMemo(() => portfolios.filter((p) => !p.isGlidepath), [portfolios]);

  const totalWeight = (p: typeof portfolios[0]) =>
    p.assets.reduce((sum, a) => sum + a.weight, 0);

  const handleSave = (portfolio: typeof portfolios[0]) => {
    const data = {
      portfolios: [portfolio],
      parameters,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${portfolio.name || 'portfolio'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    useToastStore.getState().addToast('success', '组合已保存为JSON文件');
  };

  const handleShare = () => {
    const shareData = {
      p: portfolios.map(({ id: _id, ...rest }) => rest),
      params: parameters,
    };
    const encoded = btoa(encodeURIComponent(JSON.stringify(shareData)));
    const url = `${window.location.origin}${window.location.pathname}#share=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      useToastStore.getState().addToast('success', '分享链接已复制到剪贴板');
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      useToastStore.getState().addToast('success', '分享链接已复制到剪贴板');
    });
  };

  return (
    <div className="portfolios-section">
      {/* 标题行 */}
      <div className="portfolios-header">
        <span className="portfolios-title">投资组合</span>
        <button className="portfolios-add-btn" onClick={addPortfolio}>
          添加空组合
        </button>
        <button
          className="portfolios-add-btn portfolios-add-btn-secondary"
          onClick={() => {
            if (nonGlidepathPortfolios.length < 2) {
              useToastStore.getState().addToast('warning', '至少需要2个普通组合才能创建滑行路径');
              return;
            }
            setGpFrom(nonGlidepathPortfolios[0].id);
            setGpTo(nonGlidepathPortfolios[1].id);
            setGpName(`滑行路径 ${portfolios.filter((p) => p.isGlidepath).length + 1}`);
            setShowGlidepathForm(true);
          }}
        >
          添加滑行路径
        </button>
        <button className="portfolios-add-btn portfolios-add-btn-secondary" onClick={handleShare}>
          <Share2 className="w-3.5 h-3.5" />
          分享链接
        </button>
      </div>

      {showGlidepathForm && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '8px',
          backgroundColor: 'var(--bg-subtle)',
          borderRadius: 'var(--radius-control)',
          border: '1px solid var(--border-soft)',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-strong)', marginBottom: '8px' }}>
            新建滑行路径
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>名称</label>
              <input
                type="text"
                value={gpName}
                onChange={(e) => setGpName(e.target.value)}
                className="portfolio-name-input"
                style={{ width: '120px' }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>源组合</label>
              <select
                value={gpFrom}
                onChange={(e) => setGpFrom(e.target.value)}
                className="portfolio-rebalance-select"
                style={{ width: '120px' }}
              >
                {nonGlidepathPortfolios.map((p, idx) => (
                  <option key={p.id} value={p.id}>{p.name || `组合 ${idx + 1}`}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>目标组合</label>
              <select
                value={gpTo}
                onChange={(e) => setGpTo(e.target.value)}
                className="portfolio-rebalance-select"
                style={{ width: '120px' }}
              >
                {nonGlidepathPortfolios.map((p, idx) => (
                  <option key={p.id} value={p.id}>{p.name || `组合 ${idx + 1}`}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>过渡年限</label>
              <input
                type="number"
                value={gpYears}
                onChange={(e) => setGpYears(Number(e.target.value) || 1)}
                min={1}
                max={50}
                className="offset-input"
                style={{ width: '60px' }}
              />
            </div>
            <button
              className="portfolios-add-btn"
              style={{ fontSize: '12px' }}
              disabled={!gpFrom || !gpTo || gpFrom === gpTo}
              onClick={() => {
                if (gpFrom && gpTo && gpFrom !== gpTo) {
                  addGlidepath(gpName, gpFrom, gpTo, gpYears);
                  setShowGlidepathForm(false);
                }
              }}
            >
              确定
            </button>
            <button
              className="portfolios-add-btn portfolios-add-btn-secondary"
              style={{ fontSize: '12px' }}
              onClick={() => setShowGlidepathForm(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 组合卡片横排 */}
      <div className="portfolios-cards">
        {portfolios.map((portfolio, idx) => {
          const tw = totalWeight(portfolio);
          const isComplete = Math.abs(tw - 100) <= 0.01;
          const isGp = portfolio.isGlidepath;
          return (
            <div key={portfolio.id} className="portfolio-card" style={isGp ? {
              borderLeft: '3px solid var(--accent)',
              backgroundColor: 'var(--bg-subtle)',
            } : undefined}>
              {isGp && (
                <div style={{
                  padding: '8px 10px',
                  marginBottom: '6px',
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: '6px',
                  border: '1px solid var(--border-soft)',
                }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent)', marginBottom: '6px', letterSpacing: '0.02em' }}>
                    滑行路径配置
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'flex-end' }}>
                    {/* 源组合 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>源组合</label>
                      <select
                        value={portfolio.glidepathFrom ?? ''}
                        onChange={(e) => updatePortfolio(portfolio.id, { glidepathFrom: e.target.value })}
                        className="portfolio-rebalance-select"
                        style={{ width: '120px' }}
                      >
                        {nonGlidepathPortfolios.map((p, idx) => (
                          <option key={p.id} value={p.id}>{p.name || `组合 ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    {/* 目标组合 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>目标组合</label>
                      <select
                        value={portfolio.glidepathTo ?? ''}
                        onChange={(e) => updatePortfolio(portfolio.id, { glidepathTo: e.target.value })}
                        className="portfolio-rebalance-select"
                        style={{ width: '120px' }}
                      >
                        {nonGlidepathPortfolios.map((p, idx) => (
                          <option key={p.id} value={p.id}>{p.name || `组合 ${idx + 1}`}</option>
                        ))}
                      </select>
                    </div>
                    {/* 过渡年限 */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>过渡年限</label>
                      <input
                        type="number"
                        value={portfolio.glidepathYears ?? 10}
                        onChange={(e) => updatePortfolio(portfolio.id, { glidepathYears: Number(e.target.value) || 1 })}
                        min={1}
                        max={50}
                        className="offset-input"
                        style={{ width: '60px' }}
                      />
                    </div>
                  </div>
                  {/* 目标权重（与 assets 一一对应，小数形式存储，按百分比展示） */}
                  <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>目标权重</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                    {portfolio.assets.map((asset, ai) => {
                      const w = portfolio.glidepathToWeights?.[ai];
                      return (
                        <div key={ai} style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '90px' }}>
                          <label style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {asset.ticker || `资产 ${ai + 1}`}
                          </label>
                          <div className="advanced-input-wrap" style={{ height: '28px' }}>
                            <input
                              type="number"
                              value={w != null ? +(w * 100).toFixed(2) : ''}
                              onChange={(e) => {
                                const v = e.target.value === '' ? 0 : Number(e.target.value) / 100;
                                const next = [...(portfolio.glidepathToWeights ?? portfolio.assets.map(() => 0))];
                                next[ai] = v;
                                updatePortfolio(portfolio.id, { glidepathToWeights: next });
                              }}
                              min={0}
                              max={100}
                              step={1}
                              className="advanced-input"
                              style={{ height: '28px', fontSize: '12px' }}
                            />
                            <span className="advanced-suffix" style={{ fontSize: '11px' }}>%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {/* 卡片头部操作 */}
              <div className="portfolio-card-header">
                <button className="portfolio-card-action" title="复制组合" onClick={() => duplicatePortfolio(portfolio.id)}>
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button className="portfolio-card-action" title="保存为JSON" onClick={() => handleSave(portfolio)}>
                  <Download className="w-3.5 h-3.5" />
                </button>
                {portfolios.length > 1 && (
                  <button className="portfolio-card-action portfolio-card-action-danger" title="删除" onClick={() => removePortfolio(portfolio.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 名称 + 调仓频率 + 偏移 */}
              <div className="portfolio-card-name-row">
                <input
                  type="text"
                  value={portfolio.name || `组合 ${idx + 1}`}
                  onChange={(e) => updatePortfolio(portfolio.id, { name: e.target.value })}
                  className="portfolio-name-input"
                />
                <select
                  value={portfolio.rebalanceFrequency}
                  onChange={(e) =>
                    updatePortfolio(portfolio.id, {
                      rebalanceFrequency: e.target.value as RebalanceFrequency,
                    })
                  }
                  className="portfolio-rebalance-select"
                >
                  {REBALANCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                {/* 调仓偏移 */}
                <div className="offset-cell">
                  <input
                    type="number"
                    value={portfolio.rebalanceOffset ?? 0}
                    onChange={(e) => updatePortfolio(portfolio.id, { rebalanceOffset: Number(e.target.value) || 0 })}
                    min={0}
                    max={252}
                    className="offset-input"
                    title="从周期末偏移的交易日数"
                  />
                  <span className="offset-suffix">偏移</span>
                </div>
                {/* 偏离调仓阈值 */}
                {portfolio.rebalanceFrequency === 'threshold' && (
                  <div className="threshold-cell">
                    <input
                      type="number"
                      value={portfolio.rebalanceThreshold ?? 5}
                      onChange={(e) => updatePortfolio(portfolio.id, { rebalanceThreshold: Number(e.target.value) })}
                      min={1}
                      max={50}
                      className="threshold-input"
                    />
                    <span className="threshold-suffix">%</span>
                  </div>
                )}
              </div>

              {/* 高级选项行：Drag + Total return */}
              <div className="portfolio-advanced-row">
                {/* Drag (年化拖累) */}
                <div className="advanced-field">
                  <label className="advanced-label">拖累</label>
                  <div className="advanced-input-wrap">
                    <input
                      type="number"
                      value={portfolio.drag ?? 0}
                      onChange={(e) => updatePortfolio(portfolio.id, { drag: Number(e.target.value) || 0 })}
                      min={0}
                      max={10}
                      step={0.1}
                      className="advanced-input"
                      title="年化拖累百分比，如0.5表示每年额外扣除0.5%"
                    />
                    <span className="advanced-suffix">%</span>
                  </div>
                </div>

                {/* Total return */}
                <label className="param-check advanced-check">
                  <input
                    type="checkbox"
                    checked={portfolio.totalReturn ?? true}
                    onChange={(e) => updatePortfolio(portfolio.id, { totalReturn: e.target.checked })}
                  />
                  <span>总回报</span>
                </label>

                {/* Rebalance Bands */}
                <label className="param-check advanced-check">
                  <input
                    type="checkbox"
                    checked={portfolio.rebalanceBands?.enabled ?? false}
                    onChange={(e) => updatePortfolio(portfolio.id, {
                      rebalanceBands: {
                        enabled: e.target.checked,
                        absoluteBand: portfolio.rebalanceBands?.absoluteBand,
                        relativeBand: portfolio.rebalanceBands?.relativeBand,
                      }
                    })}
                  />
                  <span>偏离带</span>
                </label>
              </div>

              {/* Rebalance Bands 参数行 */}
              {portfolio.rebalanceBands?.enabled && (
                <div className="portfolio-advanced-row" style={{ marginTop: '4px' }}>
                  <div className="advanced-field">
                    <label className="advanced-label">绝对偏离</label>
                    <div className="advanced-input-wrap">
                      <input
                        type="number"
                        value={portfolio.rebalanceBands.absoluteBand ?? 5}
                        onChange={(e) => updatePortfolio(portfolio.id, {
                          rebalanceBands: {
                            enabled: true,
                            absoluteBand: Number(e.target.value) || undefined,
                            relativeBand: portfolio.rebalanceBands?.relativeBand,
                          }
                        })}
                        min={0.1}
                        max={50}
                        step={0.5}
                        className="advanced-input"
                        title="绝对偏离百分比，如5表示权重偏离目标5%时触发调仓"
                      />
                      <span className="advanced-suffix">%</span>
                    </div>
                  </div>
                  <div className="advanced-field">
                    <label className="advanced-label">相对偏离</label>
                    <div className="advanced-input-wrap">
                      <input
                        type="number"
                        value={portfolio.rebalanceBands.relativeBand ?? 20}
                        onChange={(e) => updatePortfolio(portfolio.id, {
                          rebalanceBands: {
                            enabled: true,
                            absoluteBand: portfolio.rebalanceBands?.absoluteBand,
                            relativeBand: Number(e.target.value) || undefined,
                          }
                        })}
                        min={1}
                        max={100}
                        step={1}
                        className="advanced-input"
                        title="相对偏离百分比，如20表示权重偏离目标20%时触发调仓"
                      />
                      <span className="advanced-suffix">%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 工具栏 */}
              <div className="portfolio-card-toolbar">
                <button
                  className="toolbar-btn"
                  onClick={() => {
                    if (portfolio.assets.length === 0) return;
                    const evenWeight = Math.floor(100 / portfolio.assets.length);
                    const updates = portfolio.assets.map((_, i) => ({
                      index: i,
                      weight: i === 0 ? evenWeight + (100 - evenWeight * portfolio.assets.length) : evenWeight,
                    }));
                    batchUpdateAssets(portfolio.id, updates);
                  }}
                >
                  均匀分配
                </button>
                <button
                  className="toolbar-btn"
                  onClick={() => {
                    const tw = totalWeight(portfolio);
                    if (tw === 0) return;
                    const rawWeights = portfolio.assets.map((a) => a.weight / tw * 100);
                    const rounded = rawWeights.map((w) => Math.round(w * 100) / 100);
                    const remainder = Math.round((100 - rounded.reduce((s, w) => s + w, 0)) * 100) / 100;
                    rounded[0] = Math.round((rounded[0] + remainder) * 100) / 100;
                    const updates = portfolio.assets.map((_, i) => ({
                      index: i,
                      weight: rounded[i],
                    }));
                    batchUpdateAssets(portfolio.id, updates);
                  }}
                >
                  拉伸到100%
                </button>
                <button className="toolbar-btn" onClick={() => addAsset(portfolio.id)}>
                  <Plus className="w-3.5 h-3.5" />
                  添加标的
                </button>
              </div>

              {/* Ticker 行 */}
              {portfolio.assets.map((asset, assetIdx) => (
                <div key={asset.id ?? assetIdx} className="ticker-row">
                  <TickerInput
                    value={asset.ticker}
                    onChange={(newTicker) => {
                      updateAsset(portfolio.id, assetIdx, { ticker: newTicker });
                    }}
                    placeholder="输入代码"
                  />
                  <div className="weight-cell">
                    <WeightInput
                      value={asset.weight}
                      onChange={(num) => updateAsset(portfolio.id, assetIdx, { weight: num })}
                    />
                    <span className="weight-suffix">%</span>
                  </div>
                  <button
                    onClick={() => removeAsset(portfolio.id, asset.ticker)}
                    className="row-remove-btn"
                    title="删除"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {/* Total */}
              <div className={`portfolio-total ${isComplete ? 'complete' : 'incomplete'}`}>
                <span>合计</span>
                <span className="total-value">{tw.toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
