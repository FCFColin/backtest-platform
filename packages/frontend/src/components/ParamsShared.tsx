/**
 * @file 参数共享组件
 * @description 跨工具页面复用的基础参数行与投资组合编辑器。
 * - BasicParamsRow：承载开始/结束日期、初始资金、货币、通胀调整 5 个字段
 * - PortfolioEditor：单一投资组合的标的增删改与权重合计展示
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';

/** BasicParamsRow 可控字段名 */
type BasicParamsField =
  'startDate' | 'endDate' | 'startingValue' | 'baseCurrency' | 'adjustForInflation';

/** BasicParamsRow 组件 Props */
interface BasicParamsRowProps {
  /** 开始日期（YYYY-MM-DD） */
  startDate: string;
  /** 结束日期（YYYY-MM-DD） */
  endDate: string;
  /** 初始资金 */
  startingValue: number;
  /** 基础货币 */
  baseCurrency: 'usd' | 'cny';
  /** 是否通胀调整 */
  adjustForInflation: boolean;
  /** 字段变更回调，由调用方映射到各自的 setter */
  onChange: (field: BasicParamsField, value: string | number | boolean) => void;
}

/**
 * 基础参数行：日期范围 + 初始资金 + 货币 + 通胀调整。
 * 使用统一的 onChange 回调以适配不同页面的 state 形状。
 */
export function BasicParamsRow({
  startDate,
  endDate,
  startingValue,
  baseCurrency,
  adjustForInflation,
  onChange,
}: BasicParamsRowProps) {
  const { t } = useTranslation();
  return (
    <div className="params-row">
      <div className="param-field">
        <label className="param-label">{t('params.startDate')}</label>
        <input
          type="date"
          className="param-input"
          value={startDate}
          onChange={(e) => onChange('startDate', e.target.value)}
        />
      </div>
      <div className="param-field">
        <label className="param-label">{t('params.endDate')}</label>
        <input
          type="date"
          className="param-input"
          value={endDate}
          onChange={(e) => onChange('endDate', e.target.value)}
        />
      </div>
      <div className="param-field param-field-start-val">
        <label className="param-label">{t('params.startingValue')}</label>
        <div className="param-input-prefix-wrap">
          <span className="param-input-prefix">{baseCurrency === 'usd' ? '$' : '¥'}</span>
          <input
            type="number"
            className="param-input param-input-with-prefix"
            value={startingValue}
            onChange={(e) => onChange('startingValue', Number(e.target.value))}
          />
        </div>
      </div>
      <div className="param-field" style={{ width: 90 }}>
        <label className="param-label">{t('params.currency')}</label>
        <select
          className="param-input"
          value={baseCurrency}
          onChange={(e) => onChange('baseCurrency', e.target.value as 'usd' | 'cny')}
        >
          <option value="usd">USD ($)</option>
          <option value="cny">CNY (¥)</option>
        </select>
      </div>
      <label className="param-toggle">
        <span>{t('params.inflationAdjust')}</span>
        <div
          className={`toggle-switch ${adjustForInflation ? 'active' : ''}`}
          onClick={() => onChange('adjustForInflation', !adjustForInflation)}
        />
      </label>
    </div>
  );
}

/** 标的项结构 */
interface PortfolioAsset {
  /** 标的代码 */
  ticker: string;
  /** 权重（0-100） */
  weight: number;
}

/** PortfolioEditor 组件 Props */
interface PortfolioEditorProps {
  /** 标的列表 */
  assets: PortfolioAsset[];
  /** 权重合计（0-100） */
  totalWeight: number;
  /** 新增标的 */
  onAdd: () => void;
  /** 删除指定下标标的 */
  onRemove: (index: number) => void;
  /** 更新指定下标标的字段 */
  onUpdate: (index: number, field: 'ticker' | 'weight', val: string | number) => void;
  /** 卡片内可选头部（如组合名/调仓频率编辑），不传则不渲染 */
  header?: ReactNode;
  /** 是否包裹 portfolios-section + 标题栏。默认 true。多组合卡片场景（如蒙特卡洛）传 false */
  wrapInSection?: boolean;
  /** 是否外层为单一卡片宽度约束。wrapInSection=false 时生效，默认无约束 */
  cardStyle?: React.CSSProperties;
  /** 覆盖权重是否合规的判定（默认 |totalWeight-100|<=0.01） */
  isComplete?: boolean;
}

/**
 * 共享投资组合编辑器：标的增删改 + 权重合计。
 * 既支持带 portfolios-section 标题栏的独立用法（一次性 vs 定投、因子回归、调仓敏感性），
 * 也支持无外层包裹、由调用方自备 header 的卡片用法（蒙特卡洛多组合）。
 */
export function PortfolioEditor({
  assets,
  totalWeight,
  onAdd,
  onRemove,
  onUpdate,
  header,
  wrapInSection = true,
  cardStyle,
  isComplete,
}: PortfolioEditorProps) {
  const { t } = useTranslation();
  const complete = isComplete ?? Math.abs(totalWeight - 100) <= 0.01;

  const card = (
    <div className="portfolio-card" style={wrapInSection ? undefined : cardStyle}>
      {header}
      {assets.map((a, i) => (
        <div key={i} className="ticker-row">
          <input
            type="text"
            value={a.ticker}
            onChange={(e) => onUpdate(i, 'ticker', e.target.value)}
            placeholder={t('optimizer.tickerPlaceholder')}
            className="ticker-input"
          />
          <div className="weight-cell">
            <input
              type="number"
              value={a.weight || ''}
              onChange={(e) => onUpdate(i, 'weight', Number(e.target.value))}
              min={0}
              max={100}
              className="weight-input"
              placeholder="%"
            />
            <span className="weight-suffix">%</span>
          </div>
          <button onClick={() => onRemove(i)} className="row-remove-btn" title={t('common.delete')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="portfolio-card-toolbar">
        <button className="toolbar-btn" onClick={onAdd}>
          <Plus className="w-4 h-4" />
          {t('portfolio.addAsset')}
        </button>
      </div>
      <div className={`portfolio-total ${complete ? 'complete' : 'incomplete'}`}>
        <span>{t('portfolio.total')}</span>
        <span className="total-value">{totalWeight}%</span>
      </div>
    </div>
  );

  if (!wrapInSection) {
    return card;
  }

  return (
    <div className="portfolios-section">
      <div className="portfolios-header">
        <span className="portfolios-title">{t('portfolio.title')}</span>
      </div>
      <div className="portfolios-cards">{card}</div>
    </div>
  );
}
