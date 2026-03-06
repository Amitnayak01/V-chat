// Sidebar.jsx — paste into src/components/Dashboard/Sidebar.jsx
// ✅ CHANGE: Added 'call-history' nav item (Phone icon, teal colour)
//    Everything else is 100% unchanged from your original.

import { useAuth } from '../../context/AuthContext';
import {
  Home, Users, Settings, History, MessageCircle, UserCircle,
  ChevronDown, ChevronRight, LogOut, Phone,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

const NAV = [
  { id: 'meetings',        label: 'Home',            icon: Home,          color: 'text-blue-500'    },
  { id: 'chats',           label: 'Chats',           icon: MessageCircle, color: 'text-violet-500'  },
  { id: 'meeting-history', label: 'Meeting History', icon: History,       color: 'text-amber-500'   },
  // ── NEW ─────────────────────────────────────────────────────────────────
  { id: 'call-history',    label: 'Call History',    icon: Phone,         color: 'text-teal-500'    },
  // ────────────────────────────────────────────────────────────────────────
  { id: 'contacts',        label: 'Contacts',        icon: Users,         color: 'text-emerald-500' },
  { id: 'profile',         label: 'Profile',         icon: UserCircle,    color: 'text-pink-500'    },
  { id: 'settings',        label: 'Settings',        icon: Settings,      color: 'text-slate-500'   },
];

const STATUSES = [
  { id: 'online',  label: 'Online',         dot: 'bg-green-500'  },
  { id: 'away',    label: 'Away',           dot: 'bg-yellow-400' },
  { id: 'busy',    label: 'Do Not Disturb', dot: 'bg-red-500'    },
  { id: 'offline', label: 'Appear Offline', dot: 'bg-slate-400'  },
];

const ProfileDropdown = ({ user, onNavigate, onLogout }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState('online');
  const [statusOpen, setStatusOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) { setIsOpen(false); setStatusOpen(false); }
    };
    if (isOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const cur = STATUSES.find((s) => s.id === status) || STATUSES[0];

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setIsOpen(!isOpen)}
              className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-100 transition-all border border-transparent hover:border-slate-200">
        <div className="relative flex-shrink-0">
          <img src={user?.avatar} alt={user?.username} className="w-10 h-10 rounded-full object-cover ring-2 ring-white shadow-sm" />
          <div className={`absolute bottom-0 right-0 w-3 h-3 ${cur.dot} rounded-full border-2 border-white shadow-sm`} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="font-bold text-slate-800 text-sm truncate leading-tight">{user?.username}</p>
          <p className="text-xs text-slate-500 truncate">{cur.label}</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white rounded-2xl shadow-2xl border border-slate-100 py-2 z-50"
             style={{ animation: 'fadeSlideUp 0.15s ease' }}>
          <style>{`@keyframes fadeSlideUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}`}</style>

          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
            <img src={user?.avatar} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-100" />
            <div className="min-w-0">
              <p className="font-bold text-sm text-slate-900 truncate">{user?.username}</p>
              <p className="text-xs text-slate-500 truncate">{user?.email}</p>
            </div>
          </div>

          <button onClick={() => setStatusOpen(!statusOpen)}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors">
            <div className={`w-2.5 h-2.5 rounded-full ${cur.dot} flex-shrink-0`} />
            <span className="flex-1">Status: {cur.label}</span>
            <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${statusOpen ? 'rotate-90' : ''}`} />
          </button>
          {statusOpen && (
            <div className="mx-3 mb-1 bg-slate-50 rounded-xl overflow-hidden border border-slate-100">
              {STATUSES.map((s) => (
                <button key={s.id} onClick={() => { setStatus(s.id); setStatusOpen(false); }}
                        className={`w-full px-4 py-2 text-left text-xs flex items-center gap-3 transition-colors ${
                          status === s.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-white'
                        }`}>
                  <div className={`w-2 h-2 rounded-full ${s.dot}`} />{s.label}
                  {status === s.id && <span className="ml-auto">✓</span>}
                </button>
              ))}
            </div>
          )}

          <div className="h-px bg-slate-100 mx-3 my-1" />
          <button onClick={() => { onNavigate('profile'); setIsOpen(false); }}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors">
            <UserCircle className="w-4 h-4 text-slate-400" /> My Profile
          </button>
          <button onClick={() => { onNavigate('settings'); setIsOpen(false); }}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors">
            <Settings className="w-4 h-4 text-slate-400" /> Settings
          </button>
          <div className="h-px bg-slate-100 mx-3 my-1" />
          <button onClick={onLogout}
                  className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 text-red-500 hover:bg-red-50 transition-colors">
            <LogOut className="w-4 h-4" /> Logout
          </button>
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ activeView, onNavigate, notificationCount = 0 }) => {
  const { user, logout } = useAuth();
  const badgeMap = { chats: notificationCount > 0 ? notificationCount : null };

  return (
    <div className="flex flex-col h-full bg-white">
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-2">Menu</p>
        <div className="space-y-0.5">
          {NAV.map(({ id, label, icon: Icon, color }) => {
            const active = activeView === id;
            const badge  = badgeMap[id];
            return (
              <button key={id} onClick={() => onNavigate?.(id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative ${
                        active ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                      }`}>
                <div className={`relative flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'bg-white/20' : 'bg-slate-100'}`}>
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : color}`} />
                  {badge && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[9px] flex items-center justify-center font-bold">{badge > 9 ? '9+' : badge}</span>}
                </div>
                <span className="flex-1 text-left">{label}</span>
                {badge && !active && <span className="bg-red-100 text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{badge > 9 ? '9+' : badge}</span>}
                {active && <span className="w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Profile dropdown pinned to sidebar bottom */}
      <div className="p-3 border-t border-slate-100">
        <ProfileDropdown user={user} onNavigate={onNavigate} onLogout={logout} />
      </div>
    </div>
  );
};

export default Sidebar;