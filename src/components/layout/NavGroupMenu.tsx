/**
 * @file NavGroup & NavDropdownItems — dropdown navigation groups for the navbar
 */
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import type { NAV_GROUP_KEYS } from './navConfig.js';

function NavDropdownItems({
  group,
  isActive,
  onToggle,
  t,
}: {
  group: (typeof NAV_GROUP_KEYS)[number];
  isActive: (to: string) => boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: 6,
        minWidth: 180,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-strong)',
        borderRadius: 12,
        boxShadow: 'var(--shadow-md)',
        padding: 6,
        zIndex: 100,
      }}
    >
      {group.items.map((item) => {
        const active = isActive(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className="flex items-center no-underline"
            style={{
              padding: '8px 10px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              color: active ? 'var(--brand)' : 'var(--text-body)',
              background: active ? 'var(--brand-soft)' : 'transparent',
              transition: 'background-color .12s',
              width: '100%',
            }}
            onClick={() => onToggle('')}
            onMouseEnter={(e) => {
              if (!active) e.currentTarget.style.background = 'var(--bg-subtle)';
            }}
            onMouseLeave={(e) => {
              if (!active) e.currentTarget.style.background = 'transparent';
            }}
          >
            {t(`nav.${item.key}`)}
          </Link>
        );
      })}
    </div>
  );
}

export function NavGroup({
  group,
  isActive,
  isOpen,
  onToggle,
  t,
}: {
  group: (typeof NAV_GROUP_KEYS)[number];
  isActive: (to: string) => boolean;
  isOpen: boolean;
  onToggle: (key: string) => void;
  t: (key: string) => string;
}) {
  const groupActive = group.items.some((item) => isActive(item.to));
  const linkStyle = (active: boolean): React.CSSProperties => ({
    minHeight: 44,
    minWidth: 56,
    padding: '0 12px',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.15px',
    lineHeight: 1.05,
    color: active ? 'var(--brand)' : 'var(--text-muted)',
    background: active ? 'var(--brand-soft)' : 'transparent',
    transition: 'background-color .12s, color .12s',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="flex items-center justify-center no-underline transition-colors"
        style={{ ...linkStyle(groupActive), cursor: 'pointer', border: 'none', gap: 2 }}
        onClick={() => onToggle(isOpen ? '' : group.key)}
        onMouseEnter={(e) => {
          if (!groupActive) {
            e.currentTarget.style.background = 'var(--bg-subtle)';
            e.currentTarget.style.color = 'var(--text-body)';
          }
        }}
        onMouseLeave={(e) => {
          if (!groupActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--text-muted)';
          }
        }}
      >
        {t(`nav.${group.key}`)}
        <ChevronDown
          className="w-3 h-3"
          style={{
            transition: 'transform .15s',
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          }}
        />
      </button>
      {isOpen && <NavDropdownItems group={group} isActive={isActive} onToggle={onToggle} t={t} />}
    </div>
  );
}
