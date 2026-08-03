/**
 * 组合（portfolios）租户作用域仓储（ADR-032 / ADR-034）
 *
 * 企业理由：组合此前仅存于浏览器 localStorage——换设备/清缓存即丢失，无法团队共享、
 * 无法服务端复用。迁移到 Postgres 后由 RLS 强制租户隔离：读路径经 withTenantReadOnly()
 * （读副本 + RLS），写路径经 withTenant()（主库 + RLS），在事务内激活
 * app.current_tenant_id，即便忘记 WHERE tenant_id 也不会跨租户泄露。
 */
import crypto from 'node:crypto';
import {
  Portfolio as DomainPortfolio,
  type PortfolioHolding,
} from '../domain/aggregates/portfolio.js';
import { DomainValidationError, Ticker, Weight } from '../domain/value-objects/index.js';
import { ValidationError } from '../utils/errors.js';
import type { Asset, RebalanceFrequency } from '@backtest/shared';
import { rowMapper, iso } from './rowMapper.js';
import { createTenantCrudRepo } from './tenantCrudRepo.js';

interface PortfolioRecord {
  id: string;
  name: string;
  assets: Asset[];
  rebalanceFrequency: string;
  ownerUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PortfolioInput {
  name: string;
  assets: Asset[];
  rebalanceFrequency?: RebalanceFrequency;
}

const mapRow = rowMapper<PortfolioRecord>({
  id: 'id',
  name: 'name',
  assets: 'assets',
  rebalanceFrequency: 'rebalance_frequency',
  ownerUserId: 'owner_user_id',
  createdAt: (r) => iso(r.created_at),
  updatedAt: (r) => iso(r.updated_at),
});

/**
 * 领域校验：通过聚合根构造函数强制不变量，返回净化后的持久化 DTO。
 *
 * @throws {ValidationError} 当权重和不为 ~100 或包含非法 ticker 时
 */
function validateAndBuild(input: PortfolioInput, id: string): unknown {
  const holdings: PortfolioHolding[] = input.assets.map((a) => ({
    ticker: Ticker.create(a.ticker),
    weight: Weight.create(a.weight),
  }));
  try {
    return DomainPortfolio.create(id, input.name, holdings, {
      rebalanceFrequency: input.rebalanceFrequency,
    }).toPersistenceDTO();
  } catch (err) {
    if (err instanceof DomainValidationError) {
      throw new ValidationError(err.message, 'VALIDATION_ERROR', 'Portfolio validation failed');
    }
    throw err;
  }
}

const repo = createTenantCrudRepo<PortfolioRecord, PortfolioInput>({
  table: 'portfolios',
  selectCols: 'id, name, assets, rebalance_frequency, owner_user_id, created_at, updated_at',
  orderBy: 'updated_at DESC',
  sanitizeLimit: (limit) => Math.min(limit, 200),
  insertCols: 'tenant_id, owner_user_id, name, assets, rebalance_frequency',
  updateSet: 'name = $2, assets = $3::jsonb, rebalance_frequency = $4, updated_at = NOW()',
  mapRow,
  toInsert: (tenantId, ownerUserId, input) => {
    const dto = validateAndBuild(input, crypto.randomUUID()) as {
      name: string;
      assets: Asset[];
    };
    return [
      tenantId,
      ownerUserId,
      dto.name,
      JSON.stringify(dto.assets),
      input.rebalanceFrequency ?? 'none',
    ];
  },
  toUpdate: (id, input) => {
    const dto = validateAndBuild(input, id) as { name: string; assets: Asset[] };
    return [dto.name, JSON.stringify(dto.assets), input.rebalanceFrequency ?? 'none'];
  },
});

export const listPortfolios = repo.list;
export const getPortfolio = repo.get;
export const createPortfolio = repo.create;
export const updatePortfolio = repo.update;
export const deletePortfolio = repo.delete;
