/**
 * @file 更新日志页面
 * @description 展示项目版本更新历史，按版本倒序排列，分类标注变更类型
 * @route /changelog
 */
import { GitCommit, Plus, Wrench, Bug, Calendar } from 'lucide-react';

type ChangeType = 'added' | 'improved' | 'fixed';

interface ChangeEntry {
  type: ChangeType;
  text: string;
}

interface VersionEntry {
  version: string;
  date: string;
  highlight?: string;
  changes: ChangeEntry[];
}

const VERSIONS: VersionEntry[] = [
  {
    version: 'v1.0.0',
    date: '2026-06-18',
    highlight: '正式发布版本',
    changes: [
      { type: 'added', text: '新增 10+ testfol.io 对标工具页面（战术分配、PCA、信号分析等）' },
      { type: 'added', text: '新增帮助中心、更新日志、定价、账户四个辅助页面' },
      { type: 'improved', text: '顶部导航栏重构为分组下拉菜单，新增引擎状态指示器' },
      { type: 'improved', text: '组合编辑器支持非对称 Bands、Glidepath、现金流建模' },
      { type: 'improved', text: '统计表格支持列头点击排序，图表支持缩放与 CSV 导出' },
      { type: 'fixed', text: '修复数据引擎页面无限轮询导致「正在加载数据」卡死的问题' },
      { type: 'fixed', text: '修复 Rust 引擎不可用时静默降级缺少提示的问题' },
    ],
  },
  {
    version: 'v0.9.0',
    date: '2026-05-20',
    highlight: '生产级代码标准',
    changes: [
      { type: 'added', text: '新增安全加固（Helmet、CORS、速率限制）' },
      { type: 'added', text: '新增结构化日志（pino）与请求追踪' },
      { type: 'added', text: '新增 Docker 容器化部署与 CI 流水线' },
      { type: 'improved', text: '全面修复 TypeScript 类型错误，启用严格模式' },
      { type: 'improved', text: 'API 层增加输入校验与错误处理中间件' },
      { type: 'fixed', text: '修复多处内存泄漏与未处理的 Promise 拒绝' },
    ],
  },
  {
    version: 'v0.8.0',
    date: '2026-04-15',
    highlight: '多市场数据支持',
    changes: [
      { type: 'added', text: '新增港股、日股、欧股市场数据支持' },
      { type: 'added', text: '新增 BaoStock TCP 直连获取 A 股数据' },
      { type: 'added', text: '新增 iTick API 实时行情接入' },
      { type: 'improved', text: '数据缓存层重构，支持增量更新避免限流' },
      { type: 'improved', text: '汇率换算支持 USD/CNY 双货币切换' },
    ],
  },
  {
    version: 'v0.7.0',
    date: '2026-03-10',
    highlight: 'Rust 引擎集成',
    changes: [
      { type: 'added', text: '集成 Rust Actix-Web 回测引擎（HTTP 服务模式）' },
      { type: 'added', text: '实现三级引擎降级策略（Rust → Node.js → 静态计算）' },
      { type: 'added', text: '新增蒙特卡洛模拟与有效前沿分析' },
      { type: 'improved', text: '回测性能提升 10 倍，支持 rayon 并行计算' },
      { type: 'fixed', text: '修复调仓阈值计算精度问题' },
    ],
  },
  {
    version: 'v0.6.0',
    date: '2026-02-01',
    highlight: '核心回测功能',
    changes: [
      { type: 'added', text: '组合回测主页面与 16 个分析 Tab' },
      { type: 'added', text: '资产分析、因子回归功能' },
      { type: 'added', text: '组合优化器与有效前沿可视化' },
      { type: 'added', text: '通胀调整与汇率换算' },
      { type: 'improved', text: 'UI 对标 testfol.io 设计语言，引入 CSS 变量主题系统' },
    ],
  },
];

const TYPE_CONFIG: Record<ChangeType, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  added: { label: '新增', color: 'var(--success)', bg: 'color-mix(in srgb, var(--success) 12%, transparent)', icon: <Plus className="w-3 h-3" /> },
  improved: { label: '改进', color: 'var(--brand)', bg: 'var(--brand-soft)', icon: <Wrench className="w-3 h-3" /> },
  fixed: { label: '修复', color: 'var(--warning)', bg: 'color-mix(in srgb, var(--warning) 12%, transparent)', icon: <Bug className="w-3 h-3" /> },
};

export default function ChangelogPage() {
  return (
    <div className="bt-page">
      <div className="bt-page-header">
        <h1 className="bt-page-title">更新日志</h1>
      </div>

      <div className="bt-main-card card" style={{ padding: 24 }}>
        <div style={{ fontSize: 14, color: 'var(--text-body)', lineHeight: 1.8, marginBottom: 24 }}>
          记录平台各版本的主要变更，按版本倒序排列。变更分为
          <span style={{ color: 'var(--success)', fontWeight: 600 }}> 新增</span>、
          <span style={{ color: 'var(--brand)', fontWeight: 600 }}> 改进</span>、
          <span style={{ color: 'var(--warning)', fontWeight: 600 }}> 修复</span> 三类。
        </div>

        <div style={{ position: 'relative', paddingLeft: 8 }}>
          {/* 时间线竖线 */}
          <div style={{ position: 'absolute', left: 19, top: 8, bottom: 8, width: 2, background: 'var(--border-soft)' }} />

          {VERSIONS.map((v) => (
            <div key={v.version} style={{ position: 'relative', paddingLeft: 44, paddingBottom: 28 }}>
              {/* 时间线节点 */}
              <div style={{
                position: 'absolute',
                left: 12,
                top: 4,
                width: 14,
                height: 14,
                borderRadius: '50%',
                background: 'var(--brand)',
                border: '3px solid var(--bg-elevated)',
                boxShadow: '0 0 0 2px var(--brand)',
              }} />

              {/* 版本卡片 */}
              <div style={{ padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-strong)' }}>{v.version}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
                    <Calendar className="w-3 h-3" />
                    {v.date}
                  </span>
                  {v.highlight && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--brand)', background: 'var(--brand-soft)', padding: '2px 8px', borderRadius: 10 }}>
                      {v.highlight}
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                  {v.changes.map((c, i) => {
                    const cfg = TYPE_CONFIG[c.type];
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 3,
                          padding: '1px 7px',
                          fontSize: 11,
                          fontWeight: 600,
                          color: cfg.color,
                          background: cfg.bg,
                          borderRadius: 4,
                          flexShrink: 0,
                          minWidth: 44,
                          justifyContent: 'center',
                          marginTop: 2,
                        }}>
                          {cfg.icon}
                          {cfg.label}
                        </span>
                        <span style={{ fontSize: 13, color: 'var(--text-body)', lineHeight: 1.6 }}>{c.text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 8, padding: 16, background: 'var(--bg-subtle)', borderRadius: 'var(--radius-control)', fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitCommit className="w-4 h-4" />
          完整提交历史请查看项目 Git 仓库。
        </div>
      </div>
    </div>
  );
}
