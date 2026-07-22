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
    <div className="navbar-dropdown">
      {group.items.map((item) => {
        const active = isActive(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`navbar-dropdown-item${active ? ' active' : ''}`}
            onClick={() => onToggle('')}
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
  return (
    <div className="navbar-group">
      <button
        className={`navbar-group-btn${groupActive ? ' active' : ''}${isOpen ? ' open' : ''}`}
        onClick={() => onToggle(isOpen ? '' : group.key)}
      >
        {t(`nav.${group.key}`)}
        <ChevronDown className="chevron" />
        {groupActive && <span className="navbar-group-indicator" />}
      </button>
      {isOpen && <NavDropdownItems group={group} isActive={isActive} onToggle={onToggle} t={t} />}
    </div>
  );
}
