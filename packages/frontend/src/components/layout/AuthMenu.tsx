/**
 * @file 导航栏认证菜单
 * @description 未登录显示"登录"入口；已登录显示用户头像菜单，含活跃组织、组织切换器、
 *   账户中心与登出。多租户会话由 authStore 管理。
 */
import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, LogOut, User, Check, Building2, ChevronDown, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/authStore';

const iconBtn: React.CSSProperties = {
  color: '#94a3b8',
  borderRadius: 8,
  height: 36,
  minWidth: 36,
  background: 'transparent',
  cursor: 'pointer',
  border: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color .12s, background-color .12s',
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 6,
  fontSize: 13,
  color: '#cbd5e1',
  transition: 'background-color .12s',
};

const menuBtnStyle: React.CSSProperties = {
  ...menuItemStyle,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
  background: 'transparent',
};

const hoverBg = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = 'rgba(148, 163, 184, 0.1)';
  e.currentTarget.style.color = '#f1f5f9';
};
const unhoverBg = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = 'transparent';
  e.currentTarget.style.color = '#cbd5e1';
};

/** 下拉菜单内容 */
function AuthMenuDropdown({
  org,
  user,
  orgs,
  onSwitchOrg,
  onLogout,
  onClose,
}: {
  org: ReturnType<typeof useAuthStore.getState>['org'];
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  orgs: NonNullable<ReturnType<typeof useAuthStore.getState>['orgs']>;
  onSwitchOrg: (orgId: string) => void;
  onLogout: () => void;
  onClose: () => void;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 4,
        minWidth: 240,
        background: '#131c2f',
        border: '1px solid rgba(148, 163, 184, 0.15)',
        borderRadius: 8,
        padding: 6,
        zIndex: 100,
      }}
    >
      <OrgInfoHeader org={org} user={user} />
      <OrgSwitcherSection orgs={orgs} currentOrgId={org?.orgId} onSwitchOrg={onSwitchOrg} />
      <MenuActionLinks user={user} onClose={onClose} onLogout={onLogout} />
    </div>
  );
}

function OrgInfoHeader({
  org,
  user,
}: {
  org: ReturnType<typeof useAuthStore.getState>['org'];
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
}) {
  const { t } = useTranslation();
  return (
    <div
      style={{
        padding: '8px 10px',
        borderBottom: '1px solid rgba(148, 163, 184, 0.12)',
        marginBottom: 4,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
        {org?.name ?? t('layout.authMenu.noOrgSelected')}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
        {user.platformAdmin ? t('layout.authMenu.platformAdminPrefix') : ''}
        {org?.role ?? user.role}
      </div>
    </div>
  );
}

function OrgSwitcherSection({
  orgs,
  currentOrgId,
  onSwitchOrg,
}: {
  orgs: NonNullable<ReturnType<typeof useAuthStore.getState>['orgs']>;
  currentOrgId: string | undefined;
  onSwitchOrg: (orgId: string) => void;
}) {
  const { t } = useTranslation();
  if (orgs.length === 0) return null;
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          fontSize: 11,
          color: '#64748b',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        <Building2 className="w-3 h-3" /> {t('layout.authMenu.switchOrg')}
      </div>
      {orgs.map((o) => (
        <button
          key={o.orgId}
          onClick={() => onSwitchOrg(o.orgId)}
          style={{ ...menuBtnStyle, justifyContent: 'space-between' }}
          onMouseEnter={hoverBg}
          onMouseLeave={unhoverBg}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {o.name}
          </span>
          {o.orgId === currentOrgId && (
            <Check className="w-3.5 h-3.5" style={{ color: '#3b82f6', flexShrink: 0 }} />
          )}
        </button>
      ))}
    </div>
  );
}

function MenuActionLinks({
  user,
  onClose,
  onLogout,
}: {
  user: NonNullable<ReturnType<typeof useAuthStore.getState>['user']>;
  onClose: () => void;
  onLogout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Link
        to="/account"
        onClick={onClose}
        className="no-underline"
        style={menuItemStyle}
        onMouseEnter={hoverBg}
        onMouseLeave={unhoverBg}
      >
        <User className="w-4 h-4" /> {t('layout.authMenu.accountCenter')}
      </Link>
      {(user.orgRole === 'owner' || user.orgRole === 'admin') && (
        <Link
          to="/org/members"
          onClick={onClose}
          className="no-underline"
          style={menuItemStyle}
          onMouseEnter={hoverBg}
          onMouseLeave={unhoverBg}
        >
          <Users className="w-4 h-4" /> {t('layout.authMenu.memberManagement')}
        </Link>
      )}
      <button
        onClick={onLogout}
        style={menuBtnStyle}
        onMouseEnter={hoverBg}
        onMouseLeave={unhoverBg}
      >
        <LogOut className="w-4 h-4" /> {t('layout.authMenu.logout')}
      </button>
    </>
  );
}

export default function AuthMenu() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const org = useAuthStore((s) => s.org);
  const orgs = useAuthStore((s) => s.orgs);
  const switchOrg = useAuthStore((s) => s.switchOrg);
  const logout = useAuthStore((s) => s.logout);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) {
    return (
      <Link
        to="/login"
        title={t('layout.authMenu.login')}
        className="flex items-center justify-center no-underline"
        style={{ ...iconBtn, textDecoration: 'none', padding: '0 12px', gap: 6 }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.1)';
          e.currentTarget.style.color = '#f1f5f9';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = '#94a3b8';
        }}
      >
        <LogIn className="w-4 h-4" />
        <span style={{ fontSize: 13, fontWeight: 600 }}>{t('layout.authMenu.login')}</span>
      </Link>
    );
  }

  const initials = (org?.name ?? user.userId).slice(0, 2).toUpperCase();

  const handleSwitch = async (orgId: string) => {
    if (orgId === org?.orgId) return;
    await switchOrg(orgId);
    setOpen(false);
  };

  const handleLogout = async () => {
    await logout();
    setOpen(false);
    navigate('/login');
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <AvatarButton initials={initials} open={open} onToggle={() => setOpen((v) => !v)} />
      {open && user && (
        <AuthMenuDropdown
          org={org}
          user={user}
          orgs={orgs}
          onSwitchOrg={handleSwitch}
          onLogout={handleLogout}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

function AvatarButton({
  initials,
  open,
  onToggle,
}: {
  initials: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      onClick={onToggle}
      title={t('layout.authMenu.account')}
      style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 6, padding: '0 6px' }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = 'rgba(148, 163, 184, 0.1)';
        e.currentTarget.style.color = '#f1f5f9';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
        e.currentTarget.style.color = '#94a3b8';
      }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: '#3b82f6',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
        }}
      >
        {initials}
      </span>
      <ChevronDown
        className="w-3 h-3"
        style={{
          color: '#94a3b8',
          transition: 'transform .15s',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
        }}
      />
    </button>
  );
}
