/**
 * @file 日期范围字段
 * @description 回测基本参数中的开始/结束日期输入，含"全部历史"开关与日期合法性校验。
 * 从 BacktestParamsForm 抽出以收敛日期相关 UI 与校验调用。
 */
import { useToastStore } from '@/store/toastStore';
import { validateDateChange } from './backtestParamsUtils.js';
import type { TFunctionProp } from './BacktestParamsForm.types.js';
import { DEFAULT_BACKTEST_START_DATE, DEFAULT_END_DATE } from '@/utils/constants';

/** DateRangeFields 组件 Props */
interface DateRangeFieldsProps extends TFunctionProp {
  /** 开始日期（YYYY-MM-DD），空串表示不限 */
  startDate: string;
  /** 结束日期（YYYY-MM-DD），空串表示不限 */
  endDate: string;
  /** 字段变更回调 */
  onUpdate: (field: 'startDate' | 'endDate', value: string) => void;
}

/** 日期范围输入 */
export function DateRangeFields({ startDate, endDate, onUpdate, t }: DateRangeFieldsProps) {
  return (
    <>
      <label className="param-check">
        <input
          type="checkbox"
          checked={startDate === '' && endDate === ''}
          onChange={(e) => {
            if (e.target.checked) {
              onUpdate('startDate', '');
              onUpdate('endDate', '');
            } else {
              onUpdate('startDate', DEFAULT_BACKTEST_START_DATE);
              onUpdate('endDate', DEFAULT_END_DATE);
            }
          }}
        />
        <span>{t('params.allHistory')}</span>
      </label>
      <div className="param-field">
        <label className="param-label">{t('params.startDate')}</label>
        <input
          type="date"
          value={startDate}
          className="param-input"
          onChange={(e) => {
            const err = validateDateChange('startDate', e.target.value, endDate, t);
            if (err) {
              useToastStore.getState().addToast('warning', err);
              return;
            }
            onUpdate('startDate', e.target.value);
          }}
        />
      </div>
      <div className="param-field">
        <label className="param-label">{t('params.endDate')}</label>
        <input
          type="date"
          value={endDate}
          className="param-input"
          onChange={(e) => {
            const err = validateDateChange('endDate', e.target.value, startDate, t);
            if (err) {
              useToastStore.getState().addToast('warning', err);
              return;
            }
            onUpdate('endDate', e.target.value);
          }}
        />
      </div>
    </>
  );
}
