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

CREATE INDEX IF NOT EXISTS idx_announcements_published ON announcements(published_at DESC)
    WHERE expires_at IS NULL OR expires_at > NOW();

-- Admin can manage announcements (no RLS - public read)
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY announcements_public_read ON announcements FOR SELECT USING (true);
CREATE POLICY announcements_admin_write ON announcements FOR ALL
    USING (current_setting('app.current_user_role') = 'admin');
