import { useAuth }   from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { LogOut, Bell, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import AppLogo from '../../assets/logo.png';

const Navbar = ({ onNavigateToProfile, notificationCount = 0 }) => {
  const { user, logout }            = useAuth();
  const { connected }               = useSocket();
  const [dropdownOpen, setDropdown] = useState(false);
  const dropdownRef                 = useRef(null);
  const navigate                    = useNavigate();

  /* Close dropdown on outside click */
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setDropdown(false);
    };
    if (dropdownOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  /* Navigate to chats list — clears any persisted open conversation so
     the chat list opens clean (not jumping straight into a chat window) */
  const handleChatsClick = () => {
    localStorage.removeItem('vmeet_selected_conv_id');
    navigate('/dashboard/chats');
  };

  return (
    <nav
      className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-[60]"
      style={{ height: 57 }}
    >
      <div className="h-full flex items-center justify-between px-4 sm:px-6">

        {/* ── Logo ── */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src={AppLogo}
            alt="App Logo"
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl object-contain flex-shrink-0"
          />
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-bold text-slate-900 leading-tight tracking-tight">
              V-Meet
            </h1>
            <p className="text-[10px] text-slate-400 hidden sm:block tracking-wide uppercase">
              Video Collaboration Platform
            </p>
          </div>
        </div>

        {/* ── Right controls ── */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">

          {/* Connection status pill */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
            connected
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`} />
            <span className="hidden sm:inline">{connected ? 'Connected' : 'Offline'}</span>
          </div>

          {/* Notification / Chats bell
              Clicking always opens the CHAT LIST, never a specific chat window */}
          <button
            onClick={handleChatsClick}
            className="relative w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-all flex-shrink-0"
            title="Chats"
          >
            <Bell className="w-4.5 h-4.5" />
            {notificationCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold leading-none shadow-sm">
                {notificationCount > 9 ? '9+' : notificationCount}
              </span>
            )}
          </button>

          {/* ── Avatar / Dropdown ── */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdown((o) => !o)}
              className={`flex items-center gap-2 pl-1 pr-2 sm:pr-2.5 py-1 rounded-xl border transition-all ${
                dropdownOpen
                  ? 'bg-blue-50 border-blue-200'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200 hover:border-slate-300'
              }`}
              title="Account"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={user?.avatar}
                  alt={user?.username}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover ring-2 ring-white"
                />
                <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                  connected ? 'bg-green-500' : 'bg-slate-400'
                }`} />
              </div>

              <span className="hidden sm:block text-xs sm:text-sm font-semibold text-slate-700 max-w-[90px] truncate">
                {user?.username}
              </span>
              <ChevronDown
                className={`hidden sm:block w-3.5 h-3.5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
                  dropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {/* Dropdown panel */}
            {dropdownOpen && (
              <div
                className="absolute right-0 top-[calc(100%+8px)] w-56 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[70]"
                style={{ animation: 'navDropDown 0.15s cubic-bezier(0.16,1,0.3,1)' }}
              >
                <style>{`
                  @keyframes navDropDown {
                    from { opacity: 0; transform: translateY(-8px) scale(0.97); }
                    to   { opacity: 1; transform: translateY(0)    scale(1);    }
                  }
                `}</style>

                {/* Profile row */}
                <button
                  onClick={() => { onNavigateToProfile?.(); setDropdown(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-blue-50 transition-colors group border-b border-slate-100"
                >
                  <div className="relative flex-shrink-0">
                    <img
                      src={user?.avatar}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-100 group-hover:ring-blue-300 transition-all"
                    />
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
                      connected ? 'bg-green-500' : 'bg-slate-400'
                    }`} />
                  </div>
                  <div className="min-w-0 text-left flex-1">
                    <p className="font-bold text-sm text-slate-900 truncate group-hover:text-blue-700 transition-colors">
                      {user?.username}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                  </div>
                </button>

                {/* Logout */}
                <div className="py-1.5">
                  <button
                    onClick={() => { logout(); setDropdown(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <LogOut className="w-4 h-4 flex-shrink-0" />
                    Logout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;