import { describe, it, expect } from 'vitest';
import { createEmptyStatistics, toStatsRecord } from '@backtest/shared';
import {
  DEFAULT_COLUMNS,
  EXTENDED_COLUMNS,
} from '../../../packages/frontend/src/components/statistics-table/columns.js';

describe('statistics column keys', () => {
  const record = toStatsRecord(createEmptyStatistics());
  it('默认/扩展表所有列键都能从统计数据契约解析（防字段漂移）', () => {
    for (const col of [...DEFAULT_COLUMNS, ...EXTENDED_COLUMNS]) {
      if (col.key === 'name') continue;
      expect(record, `列键 ${col.key} 未在 toStatsRecord 中`).toHaveProperty(col.key);
    }
  });
});
