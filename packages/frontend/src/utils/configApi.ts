/**
 * 命名配置存取（服务端优先，localStorage 回退）（ADR-034）
 *
 * 行为：
 * - 已登录且有活跃组织时，命名配置经 /api/v1/configs 持久化到服务端（租户隔离、跨设备）。
 * - 未登录（匿名本地使用）时，回退到 localStorage，保持零登录可用的开发体验。
 * - 首次登录后调用 importLocalConfigsOnce() 将历史本地配置一次性迁移到服务端。
 *
 * config 负载结构：{ portfolios, parameters }，与回测请求一致，加载时直接回填。
 */
import type { Portfolio, BacktestParameters } from '@backtest/shared/types';
import { apiFetch } from './apiClient';
import { useAuthStore } from '@/store/authStore';
import {
  saveNamedConfig as lsSave,
  loadNamedConfigs as lsLoad,
  deleteNamedConfig as lsDelete,
  type SavedPortfolio,
} from './portfolioStorage';

const IMPORT_FLAG = 'bt_configs_imported';

/** 当前是否处于"已登录且选定活跃组织"状态（决定走服务端还是本地） */
function isAuthed(): boolean {
  const s = useAuthStore.getState();
  return !!s.user && !!s.user.tenantId;
}

interface ApiConfigRecord {
  id: string;
  name: string;
  config: { portfolios?: Portfolio[]; parameters?: BacktestParameters } | null;
  createdAt: string;
}

function toSavedPortfolio(r: ApiConfigRecord): SavedPortfolio {
  return {
    id: r.id,
    name: r.name,
    savedAt: r.createdAt,
    portfolios: r.config?.portfolios ?? [],
    parameters: (r.config?.parameters ?? {}) as BacktestParameters,
  };
}

/** 列出命名配置（服务端优先，失败/未登录回退本地）。 */
export async function listNamedConfigs(): Promise<SavedPortfolio[]> {
  if (!isAuthed()) return lsLoad();
  try {
    const res = await apiFetch('/api/v1/configs');
    if (!res.ok) return lsLoad();
    const body = await res.json();
    return (body.data ?? []).map(toSavedPortfolio);
  } catch {
    return lsLoad();
  }
}

/** 保存命名配置（服务端优先，未登录写本地）。 */
export async function saveNamedConfigApi(
  name: string,
  portfolios: Portfolio[],
  parameters: BacktestParameters,
): Promise<void> {
  if (!isAuthed()) {
    lsSave(name, portfolios, parameters);
    return;
  }
  await apiFetch('/api/v1/configs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, config: { portfolios, parameters } }),
  });
}

/** 删除命名配置（服务端优先，未登录删本地）。 */
export async function deleteNamedConfigApi(id: string): Promise<void> {
  if (!isAuthed()) {
    lsDelete(id);
    return;
  }
  await apiFetch(`/api/v1/configs/${id}`, { method: 'DELETE' });
}

/**
 * 首次登录后将本地历史命名配置一次性迁移到服务端（幂等，靠 localStorage 标志位）。
 *
 * 仅在已登录时执行；迁移成功后置标志，避免重复导入。失败静默（下次登录再试）。
 */
export async function importLocalConfigsOnce(): Promise<void> {
  if (!isAuthed()) return;
  try {
    if (localStorage.getItem(IMPORT_FLAG) === 'done') return;
    const local = lsLoad();
    if (local.length === 0) {
      localStorage.setItem(IMPORT_FLAG, 'done');
      return;
    }
    for (const c of local) {
      await apiFetch('/api/v1/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: c.name,
          config: { portfolios: c.portfolios, parameters: c.parameters },
        }),
      });
    }
    localStorage.setItem(IMPORT_FLAG, 'done');
  } catch {
    /* 下次登录再尝试 */
  }
}
