-- Migration: 029_announcements
-- P3-2: Announcements system
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 部分索引不能使用 NOW()（STABLE 而非 IMMUTABLE）；改为全索引，过期过滤在查询时执行。
CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_announcements_expires ON announcements(expires_at) WHERE expires_at IS NOT NULL;

-- 公告为公开读，仅 admin 可写。RLS 启用后 FORCE 确保即使 owner 也受策略约束。
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
CREATE POLICY announcements_public_read ON announcements FOR SELECT USING (true);
-- admin 写策略：使用 missing_ok=true 避免 GUC 未设置时抛错
CREATE POLICY announcements_admin_write ON announcements
    FOR INSERT
    WITH CHECK (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');
CREATE POLICY announcements_admin_update ON announcements
    FOR UPDATE
    USING (COALESCE(current_setting('app.current_user_role', true), '') = 'admin')
    WITH CHECK (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');
CREATE POLICY announcements_admin_delete ON announcements
    FOR DELETE
    USING (COALESCE(current_setting('app.current_user_role', true), '') = 'admin');
