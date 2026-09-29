import React from 'react';
import { Link, useLocation } from 'wouter';
import {
  Activity,
  Archive,
  BarChart3,
  CircleHelp,
  Info,
  LogOut,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { clearTokens } from '@/api/client';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { AUDIT_ROLES, REGISTRY_ROLES, TECHNICIAN_ROLES, hasRole } from '@/lib/roles';
import { NawiBrand } from '@/components/NawiBrand';

const baseNavItems = [
  { href: '/dashboard', label: 'Overview', icon: BarChart3 },
  { href: '/evaluations/new', label: 'New evaluation', icon: Plus },
  { href: '/sessions/active', label: 'Active session', icon: Activity },
  { href: '/reports', label: 'Report archive', icon: Archive },
  { href: '/about', label: 'About NAWI', icon: Info },
];

const registryNavItem = { href: '/instruments', label: 'Instrument registry', icon: ShieldCheck };

function initialsFor(nameOrEmail) {
  if (!nameOrEmail) return '—';
  const base = nameOrEmail.includes('@') ? nameOrEmail.split('@')[0] : nameOrEmail;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Navbar({ mobileOpen, onCloseMobile, onOpenHelp }) {
  const [location] = useLocation();
  const user = useCurrentUser();
  const localMode = localStorage.getItem('nawi-local-mode') === '1';

  const displayName = user?.name || user?.email || (localMode ? 'Local mode' : 'Signed out');
  const displayRole = user?.role
    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
    : localMode
    ? 'Offline draft only'
    : '—';
  const canSeeAudit = hasRole(user, AUDIT_ROLES);
  const canSeeRegistry = hasRole(user, REGISTRY_ROLES);
  const canCreateEvaluation = hasRole(user, TECHNICIAN_ROLES);
  const visibleBaseItems = canCreateEvaluation
    ? baseNavItems
    : baseNavItems.filter((item) => item.href !== '/evaluations/new');
  const navItems = canSeeRegistry
    ? [...visibleBaseItems.slice(0, 3), registryNavItem, ...visibleBaseItems.slice(3)]
    : visibleBaseItems;

  const handleLogout = () => {
    clearTokens();
    localStorage.removeItem('nawi-local-mode');
    window.location.href = '/login';
  };

  return (
    <>
      <aside
        className={`sidebar-shell fixed inset-y-0 left-0 z-30 flex w-[246px] flex-col transition-transform duration-200 md:relative md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-6">
          <Link href="/dashboard" className="flex items-center gap-3" data-testid="link-logo" onClick={onCloseMobile}>
            <NawiBrand variant="dashboard" />
          </Link>
          <button
            onClick={onCloseMobile}
            className="rounded p-1 text-[#9cb5ae] md:hidden"
            aria-label="Close navigation"
            data-testid="button-close-navigation"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 px-3 py-7 overflow-y-auto">
          <div className="mb-3 px-3 text-xs font-semibold text-[#9cb5ae]">
            Workspace
          </div>
          <nav className="space-y-1" aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.href === '/dashboard' ? location === '/dashboard' : location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onCloseMobile}
                  className={`nav-item flex items-center gap-3 rounded-md px-3 py-3 text-sm ${active ? 'active' : ''}`}
                  data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
                >
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.7} />
                  <span>{item.label}</span>
                  {item.href === '/sessions/active' && (
                    <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[#c69852]" />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="my-7 border-t border-white/10" />

          <div className="mb-3 px-3 text-xs font-semibold text-[#9cb5ae]">
            Reference
          </div>
          <div className="space-y-1">
            {canSeeAudit && (
              <Link
                href="/admin"
                onClick={onCloseMobile}
                className="nav-item flex items-center gap-3 rounded-md px-3 py-3 text-sm"
                data-testid="link-audit-governance"
              >
                <ShieldCheck size={16} strokeWidth={1.7} />
                <span>Audit & governance</span>
              </Link>
            )}
            <Link href="/reports" onClick={onCloseMobile} className="nav-item flex items-center gap-3 rounded-md px-3 py-3 text-sm"><ShieldCheck size={16} strokeWidth={1.7}/><span>Reports &amp; verification</span></Link>
            <button
              onClick={() => {
                if (onCloseMobile) onCloseMobile();
                if (onOpenHelp) onOpenHelp();
              }}
              className="nav-item flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm"
              data-testid="button-open-help"
            >
              <CircleHelp size={16} strokeWidth={1.7} />
              <span>Operator guide</span>
            </button>
          </div>
        </div>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex items-center gap-2 px-2 text-xs text-[#9cb5ae]">
            <span className="status-dot" />
            <span>Offline ready</span>
            <span className="ml-auto font-mono text-[#6e928b]">v2.4.1</span>
          </div>
          <div className="flex items-center gap-3 rounded-md bg-white/5 p-3">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#dceee8] text-xs font-semibold text-[#17333c]">
              {initialsFor(displayName)}
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-[#eff5ee]" data-testid="text-current-user">
                {displayName}
              </div>
              <div className="truncate text-xs text-[#87a39c]" data-testid="text-current-role">
                {displayRole}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="ml-auto text-[#87a39c] transition-colors hover:text-[#f3e8d0]"
              aria-label="Log out"
              title="Log out"
              data-testid="button-operator-logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <button
          className="fixed inset-0 z-20 bg-[#17333c]/35 md:hidden"
          onClick={onCloseMobile}
          aria-label="Close navigation overlay"
          data-testid="button-close-overlay"
        />
      )}
    </>
  );
}

export default Navbar;
