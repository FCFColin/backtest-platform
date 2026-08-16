// ADR-009: RLS 强制租户隔离（读 withTenantReadOnly，写 withTenant）
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

// @throws {ValidationError} 权重和不为 ~100 或包含非法 ticker
function validateAndBuild(input: PortfolioInput): unknown {
  try {
    const holdings: PortfolioHolding[] = input.assets.map((a) => ({
      ticker: Ticker.create(a.ticker),
      weight: Weight.create(a.weight),
    }));
    return DomainPortfolio.create(input.name, holdings, {
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
    const dto = validateAndBuild(input) as {
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
  toUpdate: (_id, input) => {
    const dto = validateAndBuild(input) as { name: string; assets: Asset[] };
    return [dto.name, JSON.stringify(dto.assets), input.rebalanceFrequency ?? 'none'];
  },
});

export const listPortfolios = repo.list;
export const getPortfolio = repo.get;
export const createPortfolio = repo.create;
export const updatePortfolio = repo.update;
export const deletePortfolio = repo.delete;
