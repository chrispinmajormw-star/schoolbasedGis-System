import {
  Map, LayoutDashboard, School, Building2, Users, FileDown, BookOpen, LogOut, LogIn, ChevronsLeft, ShieldCheck, Menu, X,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api.js';
import { Avatar } from './ui.jsx';

function NavItem({ icon: Icon, label, active, onClick, badge, collapsed, href }) {
  const cls = `group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
    active ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`;
  const inner = (
    <>
      <Icon size={18} className={active ? 'text-accent' : ''} />
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

export default function Sidebar({ view, setView, onSignIn, needsAttention }) {
  const { profile, isAdmin, signOut, profileError, session } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [open, setOpen] = useState(false);

  const go = (v) => { setView(v); setOpen(false); };

  const nav = (
    <>
      <div className="flex items-center gap-3 px-1 pb-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-ink">
          <ShieldCheck size={20} />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">SafeSchools GIS</div>
            <div className="text-[11px] text-gray-400">Malawi preparedness</div>
          </div>
        )}
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="hidden text-gray-500 hover:text-white md:block" aria-label="Collapse menu">
          <ChevronsLeft size={18} className={collapsed ? 'rotate-180' : ''} />
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-gray-400 md:hidden" aria-label="Close menu"><X size={20} /></button>
      </div>

      <nav className="space-y-1">
        <NavItem icon={Map} label="Schools map" active={view === 'map'} onClick={() => go('map')} collapsed={collapsed} />
        <NavItem icon={LayoutDashboard} label="Dashboard" active={view === 'dashboard'} onClick={() => go('dashboard')} collapsed={collapsed} />
        {profile?.role === 'school' && (
          <NavItem icon={School} label="My school" active={view === 'my-school'} onClick={() => go('my-school')} collapsed={collapsed}
            badge={needsAttention ? '!' : undefined} />
        )}
      </nav>

      {isAdmin && (
        <>
          <div className={`mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${collapsed ? 'invisible' : ''}`}>Admin</div>
          <nav className="space-y-1">
            <NavItem icon={Building2} label="Manage schools" active={view === 'admin-schools'} onClick={() => go('admin-schools')} collapsed={collapsed} />
            <NavItem icon={Users} label="User accounts" active={view === 'admin-users'} onClick={() => go('admin-users')} collapsed={collapsed} />
          </nav>
        </>
      )}

      <div className={`mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500 ${collapsed ? 'invisible' : ''}`}>Resources</div>
      <nav className="space-y-1">
        <NavItem icon={FileDown} label="Download CSV" href={api.exportUrl} collapsed={collapsed} />
        <NavItem icon={BookOpen} label="How SPI works" active={view === 'about'} onClick={() => go('about')} collapsed={collapsed} />
      </nav>

      <div className="mt-auto pt-6">
        {profileError && session && !collapsed && (
          <p className="mb-2 rounded-xl bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{profileError}</p>
        )}
        {session ? (
          <div className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5">
            <Avatar name={profile?.full_name || session.user.email} className="h-9 w-9 text-xs" />
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-white">{profile?.full_name || session.user.email}</div>
                <div className="truncate text-[11px] text-gray-400">
                  {profile ? (profile.role === 'admin' ? 'Administrator' : profile.school_name || 'School user') : '…'}
                </div>
              </div>
            )}
            <button type="button" onClick={signOut} className="text-gray-400 hover:text-white" title="Sign out" aria-label="Sign out"><LogOut size={18} /></button>
          </div>
        ) : (
          <button type="button" onClick={() => { onSignIn(); setOpen(false); }} className="btn-accent w-full">
            <LogIn size={16} />{!collapsed && 'Sign in'}
          </button>
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
        <span className="text-sm font-semibold text-white">SafeSchools GIS</span>
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
