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
  color: 'var(--text-muted)',
  borderRadius: 14,
  height: 44,
  minWidth: 44,
  background: 'transparent',
  cursor: 'pointer',
  border: 'none',
};

const menuItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 10px',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--text-body)',
};

const menuBtnStyle: React.CSSProperties = {
  ...menuItemStyle,
  width: '100%',
  border: 'none',
  cursor: 'pointer',
  background: 'transparent',
};

const hoverBg = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = 'var(--bg-subtle)';
};
const unhoverBg = (e: React.MouseEvent<HTMLElement>) => {
  e.currentTarget.style.background = 'transparent';
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
        marginTop: 6,
        minWidth: 240,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-md)',
        padding: 8,
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
      style={{ padding: '6px 10px', borderBottom: '1px solid var(--border-soft)', marginBottom: 6 }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
        {org?.name ?? t('layout.authMenu.noOrgSelected')}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
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
    <div style={{ marginBottom: 6 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          fontSize: 11,
          color: 'var(--text-muted)',
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
            <Check className="w-3.5 h-3.5" style={{ color: 'var(--brand)', flexShrink: 0 }} />
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
        className="flex flex-col items-center justify-center px-2.5 no-underline transition-colors"
        style={{ ...iconBtn, textDecoration: 'none' }}
      >
        <LogIn className="w-4 h-4" />
        <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, marginTop: 1 }}>
          {t('layout.authMenu.login')}
        </span>
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
      style={{ ...iconBtn, display: 'flex', alignItems: 'center', gap: 4, padding: '0 8px' }}
    >
      <span
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: 'var(--brand)',
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
        style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }}
      />
    </button>
  );
}
