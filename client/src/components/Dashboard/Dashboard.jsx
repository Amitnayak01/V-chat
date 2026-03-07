import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Video, Link as LinkIcon, Search, Plus, Users,
  Share2, Clock, Zap, Calendar, ArrowRight,
  CheckCheck, Sparkles,
  Home, MessageCircle, History, Settings as SettingsIcon,
  Phone,
} from 'lucide-react';

import Navbar         from '../Common/Navbar';
import Sidebar        from './Sidebar';
import UserList       from './UserList';
import ContactsList   from './ContactsList';
import IncomingCall   from './IncomingCall';
import MeetingHistory from './MeetingHistory';
import CallHistory    from './CallHistory';
import Chat           from './Chat';
import Profile        from './Profile';
import Settings       from './Settings';

import { useAuth }            from '../../context/AuthContext';
import { useSocket }          from '../../context/SocketContext';
import { generateRoomId }     from '../../utils/webrtc';
import { directMessageAPI }   from '../../utils/api';   // ← for unread count
import toast                  from 'react-hot-toast';

/* ─────────────────────────────────────────────
   URL ↔ view mapping
───────────────────────────────────────────── */
const VIEW_TO_PATH = {
  meetings:          '/dashboard',
  chats:             '/dashboard/chats',
  'meeting-history': '/dashboard/meeting-history',
  'call-history':    '/dashboard/call-history',
  contacts:          '/dashboard/contacts',
  profile:           '/dashboard/profile',
  settings:          '/dashboard/settings',
};

const PATH_TO_VIEW = Object.fromEntries(
  Object.entries(VIEW_TO_PATH).map(([v, p]) => [p, v])
);

const pathToView = (pathname) => {
  if (PATH_TO_VIEW[pathname]) return PATH_TO_VIEW[pathname];
  for (const [path, view] of Object.entries(PATH_TO_VIEW)) {
    if (path !== '/dashboard' && pathname.startsWith(path)) return view;
  }
  return 'meetings';
};

/* ─────────────────────────────────────────────
   Mobile Bottom Navigation Bar
───────────────────────────────────────────── */
const BOTTOM_NAV_ITEMS = [
  { id: 'meetings',     label: 'Home',     icon: Home,          activeColor: 'text-blue-600',    activeBg: 'bg-blue-600',    shadow: 'shadow-blue-200/80'    },
  { id: 'chats',        label: 'Chats',    icon: MessageCircle, activeColor: 'text-violet-600',  activeBg: 'bg-violet-600',  shadow: 'shadow-violet-200/80'  },
  { id: 'call-history', label: 'Calls',    icon: Phone,         activeColor: 'text-teal-600',    activeBg: 'bg-teal-500',    shadow: 'shadow-teal-200/80'    },
  { id: 'contacts',     label: 'Contacts', icon: Users,         activeColor: 'text-emerald-600', activeBg: 'bg-emerald-500', shadow: 'shadow-emerald-200/80' },
  { id: 'settings',     label: 'Settings', icon: SettingsIcon,  activeColor: 'text-slate-600',   activeBg: 'bg-slate-600',   shadow: 'shadow-slate-200/80'   },
];

const MobileBottomNav = ({ activeView, onNavigate, unreadChats, user }) => (
  <nav
    className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/96 backdrop-blur-xl border-t border-slate-200/60"
    style={{ boxShadow: '0 -8px 32px -8px rgba(0,0,0,0.10)', paddingBottom: 'env(safe-area-inset-bottom)' }}
  >
    <div className="flex items-center justify-around px-2 pt-2 pb-2">
      {BOTTOM_NAV_ITEMS.map(({ id, label, icon: Icon, activeColor, activeBg, shadow }) => {
        const active    = activeView === id;
        const showBadge = id === 'chats' && unreadChats > 0;

        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className="relative flex flex-col items-center justify-center gap-1 flex-1 py-1.5 min-w-0 select-none"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <div className="relative">
              <div
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 ${
                  active
                    ? `${activeBg} shadow-lg ${shadow} scale-110`
                    : 'bg-slate-100/70 scale-100 active:scale-90'
                }`}
              >
                {id === 'profile' && user?.avatar && !active ? (
                  <img
                    src={user.avatar}
                    alt={user?.username}
                    className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-300"
                  />
                ) : (
                  <Icon
                    className={`w-[19px] h-[19px] transition-colors duration-200 ${
                      active ? 'text-white' : 'text-slate-500'
                    }`}
                    strokeWidth={active ? 2.5 : 1.8}
                  />
                )}
              </div>

              {/* ── Teal unread badge on Chats icon ── */}
              {showBadge && (
                <span
                  style={{
                    position:       'absolute',
                    top:            '-6px',
                    right:          '-6px',
                    minWidth:       unreadChats > 9 ? '18px' : '16px',
                    height:         unreadChats > 9 ? '18px' : '16px',
                    padding:        unreadChats > 9 ? '0 4px' : '0',
                    background:     '#0d9488',
                    color:          '#ffffff',
                    borderRadius:   '999px',
                    fontSize:       '9px',
                    fontWeight:     800,
                    lineHeight:     1,
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    border:         '2px solid #ffffff',
                    boxShadow:      '0 1px 4px rgba(0,0,0,0.18)',
                    animation:      'badgePop 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                    pointerEvents:  'none',
                    userSelect:     'none',
                  }}
                >
                  {unreadChats > 99 ? '99+' : unreadChats}
                </span>
              )}
            </div>

            <span
              className={`text-[10px] font-bold tracking-tight leading-none truncate w-full text-center transition-colors duration-200 ${
                active ? activeColor : 'text-slate-400'
              }`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>

    <style>{`
      @keyframes badgePop {
        from { opacity: 0; transform: scale(0.5); }
        to   { opacity: 1; transform: scale(1);   }
      }
    `}</style>
  </nav>
);

/* ─────────────────────────────────────────────
   Meetings View
───────────────────────────────────────────── */
const MeetingsView = ({ user, onStart, onJoin, onCopyLink, onCallUser, onNavigate }) => {
  const [joinInput,   setJoinInput]   = useState('');
  const [joinError,   setJoinError]   = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied,      setCopied]      = useState(false);
  const [recentRooms, setRecentRooms] = useState(() => {
    try { return JSON.parse(localStorage.getItem('vmeet_recent_rooms') || '[]'); }
    catch { return []; }
  });

  const handleJoin = () => {
    if (!joinInput.trim()) { setJoinError('Please enter a room ID or meeting link'); return; }
    setJoinError('');
    let code = joinInput.trim();
    try {
      const url   = new URL(code);
      const parts = url.pathname.split('/').filter(Boolean);
      code        = parts[parts.length - 1];
    } catch {}
    onJoin(code);
  };

  const handleCopyWithFeedback = () => {
    onCopyLink();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const clearRecent = () => {
    localStorage.removeItem('vmeet_recent_rooms');
    setRecentRooms([]);
    toast.success('Recent rooms cleared');
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">

      {/* Header */}
      <div className="mb-6 sm:mb-7">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
          <span className="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">Dashboard</span>
        </div>
        <h2 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {greeting()}, <span className="text-blue-600">{user?.username}</span>! 👋
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">Start a meeting or join an existing one.</p>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-5 mb-4 sm:mb-5">

        {/* New Meeting */}
        <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-blue-100/40 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-center sm:items-start gap-3 sm:gap-4 relative">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200 flex-shrink-0 group-hover:scale-105 transition-transform">
              <Plus className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-black text-slate-900 mb-0.5">New Meeting</h3>
              <p className="text-xs text-slate-500 mb-3 hidden sm:block">Create a new meeting room instantly</p>
              <button
                onClick={onStart}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-4 rounded-xl transition-all flex items-center justify-center gap-2 shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 active:scale-95"
              >
                <Zap className="w-4 h-4" /> Start Meeting
              </button>
            </div>
          </div>
        </div>

        {/* Join Meeting */}
        <div className="relative overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow group">
          <div className="absolute top-0 right-0 w-28 h-28 bg-violet-100/40 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="flex items-center sm:items-start gap-3 sm:gap-4 relative">
            <div className="w-11 h-11 sm:w-12 sm:h-12 bg-violet-600 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-200 flex-shrink-0 group-hover:scale-105 transition-transform">
              <LinkIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm sm:text-base font-black text-slate-900 mb-0.5">Join Meeting</h3>
              <p className="text-xs text-slate-500 mb-3 hidden sm:block">Enter a room ID or paste a link</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={joinInput}
                  onChange={(e) => { setJoinInput(e.target.value); setJoinError(''); }}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="Room ID or link"
                  className={`flex-1 min-w-0 bg-white border text-sm py-2.5 px-3 rounded-xl outline-none focus:ring-2 focus:ring-violet-300 transition-all ${
                    joinError ? 'border-red-400' : 'border-slate-200 focus:border-violet-400'
                  }`}
                />
                <button
                  onClick={handleJoin}
                  className="bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold py-2.5 px-3 sm:px-4 rounded-xl transition-all flex items-center gap-1 sm:gap-1.5 shadow-md shadow-violet-200 active:scale-95 flex-shrink-0"
                >
                  Join <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {joinError && <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">⚠ {joinError}</p>}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2 sm:gap-2.5 mb-6 sm:mb-7">
        <button
          onClick={handleCopyWithFeedback}
          className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border transition-all ${
            copied
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          {copied
            ? <><CheckCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Copied!</>
            : <><Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Copy Link</>}
        </button>
        <button
          onClick={() => onNavigate?.('meeting-history')}
          className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold border bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all"
        >
          <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> View History
        </button>
      </div>

      {/* Recent Rooms */}
      {recentRooms.length > 0 && (
        <div className="mb-5 sm:mb-6 p-3.5 sm:p-4 rounded-2xl bg-amber-50 border border-amber-100">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-black text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Recent Rooms
            </p>
            <button onClick={clearRecent} className="text-xs text-amber-400 hover:text-red-500 transition-colors font-medium">
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentRooms.slice(0, 5).map((room) => (
              <button
                key={room.id}
                onClick={() => onJoin(room.id)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-amber-200 hover:border-amber-400 hover:bg-amber-50 rounded-lg text-xs font-mono text-amber-800 transition-all active:scale-95"
              >
                <Video className="w-3 h-3" /> {room.id}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* People Section */}
      <div className="flex items-center gap-3 mb-4 sm:mb-5">
        <div className="flex-1 h-px bg-slate-200" />
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-full px-3 py-1 shadow-sm">
          <Users className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs font-semibold text-slate-500">People</span>
        </div>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      <div className="relative mb-4 sm:mb-5">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search users..."
          className="w-full bg-white border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all shadow-sm"
        />
      </div>

      <h3 className="text-base sm:text-lg font-black text-slate-900 mb-3">Users</h3>
      <p> Message the user you want to add to your contact list.</p>
      <UserList onCallUser={onCallUser} searchQuery={searchQuery} />
    </div>
  );
};

/* ─────────────────────────────────────────────
   Contacts View
───────────────────────────────────────────── */
const ContactsView = ({ onCallUser }) => (
  <div className="max-w-2xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
    <div className="mb-5 sm:mb-6">
      <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Contacts</h1>
      <p className="text-slate-500 text-xs sm:text-sm mt-0.5">People you've messaged</p>
    </div>
    <ContactsList onCallUser={onCallUser} />
  </div>
);

/* ─────────────────────────────────────────────
   Dashboard Root
───────────────────────────────────────────── */
const Dashboard = () => {
  const location         = useLocation();
  const navigate         = useNavigate();
  const { user }         = useAuth();
  const { socket, emit } = useSocket();

  const activeView = pathToView(location.pathname);

  const [incomingCall,     setIncomingCall]     = useState(null);
  const [chatRedirectData, setChatRedirectData] = useState(null);
  const [chatOpen,         setChatOpen]         = useState(false);

  /* ── Unread chat count (bell + sidebar + bottom nav) ─────────────────
   *
   *  Two parts:
   *  1. incomingCallCount — existing video-call notification logic, unchanged
   *  2. unreadChats       — sum of unreadCount across all DM conversations,
   *                         fetched from API + kept live via socket events
   * ─────────────────────────────────────────────────────────────────── */
  const [incomingCallCount, setIncomingCallCount] = useState(0);
  const [unreadChats,       setUnreadChats]       = useState(0);

  // Total passed to Navbar bell = unread DMs + pending call alerts
  const totalNotifications = unreadChats + incomingCallCount;

  /* Fetch unread count from conversations list */
  const refreshUnread = useCallback(async () => {
    try {
      const res = await directMessageAPI.getConversations();
      if (res.data?.success) {
        // Count conversations (users) with at least 1 unread message — not total messages
        const total = (res.data.conversations || []).filter(
          (c) => (Number(c.unreadCount) || 0) > 0
        ).length;
        setUnreadChats(total);
      }
    } catch (_) {}
  }, []);

  /* Initial load */
  useEffect(() => { refreshUnread(); }, [refreshUnread]);

  /* Zero out unread when the user navigates into Chats */
  useEffect(() => {
    if (activeView === 'chats') {
      // Re-fetch after a short delay to let the read receipt propagate
      const t = setTimeout(refreshUnread, 800);
      return () => clearTimeout(t);
    }
  }, [activeView, refreshUnread]);

  /* chat redirect via location.state */
  useEffect(() => {
    if (location.state?.openChat) {
      setChatRedirectData({
        conversationId: location.state.conversationId,
        targetUser:     location.state.targetUser,
      });
      navigate('/dashboard/chats', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  /* profile redirect via location.state */
  useEffect(() => {
    if (location.state?.openProfile) {
      navigate('/dashboard/profile', { replace: true, state: {} });
    }
  }, [location.state, navigate]);

  /* reset chat state when leaving the chats route */
  useEffect(() => {
    if (activeView !== 'chats') {
      setChatRedirectData(null);
      setChatOpen(false);
    }
  }, [activeView]);

  /* ── Socket listeners ────────────────────────────────────────────── */
  useEffect(() => {
    if (!socket) return;

    /* Video call notifications — unchanged */
    socket.on('incoming-call', (data) => {
      setIncomingCall(data);
      setIncomingCallCount((c) => c + 1);
    });
    socket.on('call-accepted', ({ roomId }) => navigate(`/room/${roomId}`, { replace: true }));
socket.on('call-rejected', () => {
  toast.error('Call was declined', { icon: '📵' });
});
 
    socket.on('call-failed',   ({ message }) => toast.error(message));
    socket.on('user-online',   ({ username }) =>
      toast.success(`${username} is now online`, { icon: '🟢', duration: 2000 })
    );

    /* DM unread count — re-fetch on any relevant socket event */
    const handleNewMsg   = () => refreshUnread();
    const handleReadEvt  = () => refreshUnread();

    socket.on('new-direct-message',       handleNewMsg);
    socket.on('message:read',             handleReadEvt);
    socket.on('batch-read-update-direct', handleReadEvt);

    return () => {
      socket.off('incoming-call');
      socket.off('call-accepted');
      socket.off('call-rejected');
      socket.off('call-failed');
      socket.off('user-online');
      socket.off('new-direct-message',       handleNewMsg);
      socket.off('message:read',             handleReadEvt);
      socket.off('batch-read-update-direct', handleReadEvt);
    };
  }, [socket, navigate, refreshUnread]);

  const saveRecentRoom = useCallback((roomId) => {
    try {
      const prev    = JSON.parse(localStorage.getItem('vmeet_recent_rooms') || '[]');
      const updated = [{ id: roomId, ts: Date.now() }, ...prev.filter((r) => r.id !== roomId)].slice(0, 5);
      localStorage.setItem('vmeet_recent_rooms', JSON.stringify(updated));
    } catch {}
  }, []);

const handleStartMeeting = () => {
  const id = generateRoomId();
  saveRecentRoom(id);
  navigate(`/room/${id}`, { replace: true, state: { returnTo: location.pathname } });
};

const handleJoinMeeting = (code) => {
  saveRecentRoom(code);
  navigate(`/room/${code}`, { replace: true, state: { returnTo: location.pathname } });
};

  const handleCopyLink = () => {
    const id   = generateRoomId();
    const link = `${window.location.origin}/join/${id}`;
    navigator.clipboard.writeText(link);
    toast.success('Meeting link copied!');
  };
const handleCallUser = (targetUser, roomId) => {
  emit('call-user', {
    callerId:     user._id,
    receiverId:   targetUser._id,
    roomId,
    callerName:   user.username,
    callerAvatar: user.avatar,
  });
  toast.success(`Calling ${targetUser.username}...`);
  setTimeout(() => navigate(`/room/${roomId}`, { replace: true, state: { returnTo: location.pathname } }), 1000);
};

const handleAcceptCall = () => {
  if (!incomingCall) return;
  emit('accept-call', {
    callerId: incomingCall.callerId,
    roomId:   incomingCall.roomId,
    userId:   user._id,
  });
  navigate(`/room/${incomingCall.roomId}`, { replace: true, state: { returnTo: location.pathname } });
  setIncomingCall(null);
  setIncomingCallCount((c) => Math.max(0, c - 1));
};

  const handleRejectCall = () => {
    if (!incomingCall) return;
    emit('reject-call', { callerId: incomingCall.callerId, userId: user._id });
    setIncomingCall(null);
    setIncomingCallCount((c) => Math.max(0, c - 1));
  };

  const handleNavigate = (view) => {
    navigate(VIEW_TO_PATH[view] || '/dashboard');
  };

  // Bottom nav visible everywhere EXCEPT when a chat window is open on mobile
  const showBottomNav = !(activeView === 'chats' && chatOpen);

  const renderView = () => {
    switch (activeView) {
      case 'meetings':
        return (
          <MeetingsView
            user={user}
            onStart={handleStartMeeting}
            onJoin={handleJoinMeeting}
            onCopyLink={handleCopyLink}
            onCallUser={handleCallUser}
            onNavigate={handleNavigate}
          />
        );
      case 'chats':
        return (
          <Chat
            initialConversation={chatRedirectData}
            onChatOpen={setChatOpen}
          />
        );
      case 'meeting-history':
        return <MeetingHistory />;
      case 'call-history':
        return <CallHistory />;
      case 'contacts':
        return <ContactsView onCallUser={handleCallUser} />;
      case 'profile':
        return <Profile />;
      case 'settings':
        return <Settings />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
      {/* Bell badge = real unread DMs + any pending call alerts */}
      <Navbar
        onNavigateToProfile={() => handleNavigate('profile')}
        notificationCount={totalNotifications}
        activeView={activeView}
      />

      <div className="flex h-[calc(100vh-57px)]">

        {/* Desktop Sidebar */}
        <div className="hidden md:flex w-64 border-r border-slate-200 flex-col h-full bg-white flex-shrink-0">
          <Sidebar
            activeView={activeView}
            onNavigate={handleNavigate}
            notificationCount={unreadChats}   /* sidebar only shows DM unreads */
          />
        </div>

        {/* Main content */}
        <div className={`flex-1 overflow-y-auto md:pb-0 ${showBottomNav ? 'pb-20' : 'pb-0'}`}>
          {renderView()}
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      {showBottomNav && (
        <MobileBottomNav
          activeView={activeView}
          onNavigate={handleNavigate}
          unreadChats={unreadChats}   /* teal badge on Chats tab */
          user={user}
        />
      )}

      {incomingCall && (
        <IncomingCall
          caller={incomingCall}
          onAccept={handleAcceptCall}
          onReject={handleRejectCall}
        />
      )}
    </div>
  );
};

export default Dashboard;