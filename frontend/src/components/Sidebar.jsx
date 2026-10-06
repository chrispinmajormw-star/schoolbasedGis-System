import {
  Map, LayoutDashboard, Building2, Users, FileDown, BookOpen, LogOut, LogIn, ChevronsLeft, ChevronsRight, ShieldCheck, Menu, X, UserPlus, Clock, Settings,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Avatar } from './ui.jsx';
import { typeOf } from '../lib/facilityTypes.js';

function NavItem({ icon: Icon, label, active, onClick, badge, collapsed, href }) {
  const cls = `group relative flex w-full items-center gap-3 rounded-xl py-2.5 text-[13px] font-medium transition ${
    collapsed ? 'justify-center px-0' : 'px-3'} ${
    active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`;
  const inner = (
    <>
      <Icon size={18} className={active ? 'text-accent' : ''} />
      {collapsed && badge !== undefined && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-ink" />}
      {!collapsed && <span className="flex-1 text-left">{label}</span>}
      {!collapsed && badge !== undefined && (
        <span className="rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-bold text-ink">{badge}</span>
      )}
    </>
  );
  return href
    ? <a href={href} className={cls} title={label}>{inner}</a>
    : <button type="button" onClick={onClick} className={cls} title={label}>{inner}</button>;
}

export default function Sidebar({ view, setView, onSignIn, onJoin, needsAttention, staleCount = 0, pendingCount = 0, collapsed: collapsedPref = false, onCollapse }) {
  const { profile, isAdmin, isPending, isDisabled, signOut, profileError, session } = useAuth();
  const MyIcon = profile?.facility_type ? typeOf(profile.facility_type).icon : Building2;
  const [open, setOpen] = useState(false);
  // The mobile drawer is always shown expanded
  const [isDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  const collapsed = collapsedPref && isDesktop;
  const setCollapsed = (v) => onCollapse?.(v);

  const go = (v) => { setView(v); setOpen(false); };

  const nav = (
    <>
      <div className={`flex gap-3 pb-5 ${collapsed ? 'flex-col items-center' : 'items-center px-1'}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-ink">
          <ShieldCheck size={20} />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">SafeCom</div>
            <div className="truncate text-[11px] text-gray-400">Safe Community · Malawi</div>
          </div>
        )}
        <button type="button" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-gray-200 transition hover:bg-white/20 hover:text-white md:flex">
          {collapsed ? <ChevronsRight size={17} /> : <ChevronsLeft size={17} />}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 md:hidden" aria-label="Close menu"><X size={20} /></button>
      </div>

      <nav className="space-y-1">
        <NavItem icon={Map} label="Facilities map" active={view === 'map'} onClick={() => go('map')} collapsed={collapsed} />
        <NavItem icon={LayoutDashboard} label="Dashboard" active={view === 'dashboard'} onClick={() => go('dashboard')} collapsed={collapsed}
          badge={staleCount ? staleCount : undefined} />
        {profile?.role === 'manager' && profile.status === 'active' && (
          <NavItem icon={MyIcon} label="My facility" active={view === 'my-facility'} onClick={() => go('my-facility')} collapsed={collapsed}
            badge={needsAttention ? '!' : undefined} />
        )}
      </nav>

      {isAdmin && (
        <>
          <div className={`mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${collapsed ? 'invisible' : ''}`}>Admin</div>
          <nav className="space-y-1">
            <NavItem icon={Building2} label="Manage facilities" active={view === 'admin-facilities'} onClick={() => go('admin-facilities')} collapsed={collapsed} />
            <NavItem icon={Users} label="User accounts" active={view === 'admin-users'} onClick={() => go('admin-users')} collapsed={collapsed}
              badge={pendingCount ? pendingCount : undefined} />
          </nav>
        </>
      )}

      <div className={`mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${collapsed ? 'invisible' : ''}`}>Resources</div>
      <nav className="space-y-1">
        <NavItem icon={FileDown} label="Download CSV" href={api.exportUrl} collapsed={collapsed} />
        <NavItem icon={BookOpen} label="How SPI works" active={view === 'about'} onClick={() => go('about')} collapsed={collapsed} />
        <NavItem icon={Settings} label="Settings" active={view === 'settings'} onClick={() => go('settings')} collapsed={collapsed} />
      </nav>

      <div className="mt-auto pt-6">
        {isPending && collapsed && (
          <span className="mb-2 flex justify-center text-accent" title="Waiting for an administrator to activate your account"><Clock size={18} /></span>
        )}
        {isPending && !collapsed && (
          <div className="mb-2 rounded-xl bg-accent/10 px-3 py-2.5 text-[11px] text-accent">
            <div className="mb-0.5 flex items-center gap-1.5 font-semibold"><Clock size={12} />Waiting for activation</div>
            <span className="text-gray-300">An administrator is reviewing your request for {profile.facility_name}. You can browse the map meanwhile.</span>
          </div>
        )}
        {isDisabled && !collapsed && (
          <p className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] text-red-300">Your account is disabled. Contact the administrator.</p>
        )}
        {profileError && session && !collapsed && (
          <p className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{profileError}</p>
        )}
        {session ? (
          <div className={`flex gap-3 rounded-xl bg-white/5 p-2.5 ${collapsed ? 'flex-col items-center' : 'items-center'}`}>
            <button type="button" onClick={() => go('settings')} title="Account settings" className="flex min-w-0 flex-1 items-center gap-3 text-left">
              <Avatar name={profile?.full_name || session.user.email} className="h-9 w-9 text-xs" />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-white">{profile?.full_name || session.user.email}</span>
                  <span className="block truncate text-[11px] text-gray-400">
                    {profile ? (profile.role === 'admin' ? 'Administrator' : profile.facility_name || 'Facility manager') : '…'}
                  </span>
                </span>
              )}
            </button>
            <button type="button" onClick={signOut} className="text-gray-400 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
          </div>
        ) : (
          <div className="space-y-2">
            <button type="button" onClick={() => { onSignIn(); setOpen(false); }} className="btn-accent w-full" title="Sign in">
              <LogIn size={16} />{!collapsed && 'Sign in'}
            </button>
            <button type="button" onClick={() => { onJoin(); setOpen(false); }} className="btn w-full border border-white/15 text-gray-200 hover:bg-white/5" title="Create account">
              <UserPlus size={16} />{!collapsed && 'Create account'}
            </button>
          </div>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex items-center gap-3 bg-ink px-4 py-3 md:hidden">
        <button type="button" onClick={() => setOpen(true)} className="text-white" aria-label="Open menu"><Menu size={22} /></button>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-ink"><ShieldCheck size={16} /></span>
        <span className="text-sm font-semibold text-white">SafeCom</span>
        {!session && <button type="button" onClick={onSignIn} className="ml-auto text-xs font-medium text-accent">Sign in</button>}
      </header>

      {/* Mobile drawer */}
      {open && <div className="fixed inset-0 z-[2500] bg-black/50 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-[2600] flex w-72 flex-col bg-ink p-4 transition-transform md:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        {nav}
      </aside>

      {/* Desktop sidebar */}
      <aside className={`hidden shrink-0 flex-col rounded-2xl bg-ink p-4 md:flex ${collapsed ? 'w-[76px]' : 'w-60'}`}>
        {nav}
      </aside>
    </>
  );
}
