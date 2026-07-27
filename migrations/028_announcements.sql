-- Migration: announcements table
-- P7-1: Announcements system for NotificationBell

CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(64) UNIQUE NOT NULL,
  title_zh TEXT NOT NULL,
  title_en TEXT NOT NULL,
  body_zh TEXT NOT NULL,
  body_en TEXT NOT NULL,
  cta_label_zh VARCHAR(64),
  cta_label_en VARCHAR(64),
  cta_link VARCHAR(255),
  variant VARCHAR(16) NOT NULL DEFAULT 'info',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC);

-- Initial seed data
INSERT INTO announcements (slug, title_zh, title_en, body_zh, body_en, variant, published_at) VALUES
  ('v2-ui-launch', 'v2.0 界面重构上线', 'v2.0 UI Redesign Launched', '全新导航栏、Hero 区、参数区和结果区已上线。', 'New navbar, hero section, params area, and results section are live.', 'success', '2026-07-27T00:00:00Z'),
  ('floating-label-inputs', '浮动标签输入框', 'Floating Label Inputs', '参数区改用浮动标签设计，更紧凑高效。', 'Params area now uses floating label design for a more compact layout.', 'info', '2026-07-27T00:00:00Z'),
  ('portfolio-card-v2', '组合卡片 V2', 'Portfolio Card V2', '支持多组合横向 Grid 排列和深度分析。', 'Supports multi-portfolio grid layout and deep analysis.', 'info', '2026-07-27T00:00:00Z'),
  ('stats-table-v2', '统计表 V2', 'Statistics Table V2', '17 列横向表格，支持排序、列隐藏和导出。', '17-column table with sorting, column visibility, and export.', 'info', '2026-07-27T00:00:00Z'),
  ('growth-chart-v2', '增长曲线图 V2', 'Growth Chart V2', 'Y 轴完整金额格式，时间范围快捷切换。', 'Full currency Y-axis, time range quick switch.', 'info', '2026-07-27T00:00:00Z'),
  ('drawdown-episodes-v2', '回撤片段时间轴', 'Drawdown Episodes Timeline', '回撤片段改为时间轴可视化，支持展开详情。', 'Drawdown episodes now feature timeline visualization with expandable details.', 'info', '2026-07-27T00:00:00Z'),
  ('notification-bell', '通知铃铛', 'Notification Bell', '右上角铃铛图标，查看产品动态和更新。', 'Bell icon in top-right to view product updates.', 'info', '2026-07-27T00:00:00Z'),
  ('footer-v2', '页脚 V2', 'Footer V2', '五栏结构页脚，含数据来源和系统状态。', 'Five-column footer with data sources and system status.', 'info', '2026-07-27T00:00:00Z'),
  ('synthetic-tickers-1962', '合成标的支持回测至 1962 年', 'Synthetic Tickers Back to 1962', '合成标的现已支持回测至 1962 年。', 'Synthetic tickers now support backtesting back to 1962.', 'success', '2026-07-20T00:00:00Z'),
  ('go-engine-only', 'Go 引擎为唯一引擎', 'Go Engine is the Only Engine', 'Rust/Node 引擎已退役，Go 引擎为唯一引擎。', 'Rust/Node engines retired, Go is the only engine.', 'warning', '2026-06-15T00:00:00Z')
ON CONFLICT (slug) DO NOTHING;
