import { useState, useEffect, useCallback } from 'react';
import { MessageCircle, Loader2, RefreshCw, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { userAPI, directMessageAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { generateRoomId } from '../../utils/webrtc';
import toast from 'react-hot-toast';

/* ─────────────────────────────────────────────────────────────────────────────
   ALL ORIGINAL LOGIC IS 100% UNTOUCHED — only the render/JSX is upgraded
───────────────────────────────────────────────────────────────────────────── */

const UserList = ({ onCallUser, searchQuery }) => {
  const [users,           setUsers]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [messagingUserId, setMessagingUserId] = useState(null);

  const { user: currentUser } = useAuth();
  const { onlineUsers }       = useSocket();
  const navigate              = useNavigate();

  /* ── Fetch all users ──────────────────────────────────────────────── */
  const fetchUsers = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setRefreshing(true);

      const res = await userAPI.getAllUsers();

      let usersArray = [];
      if (Array.isArray(res.data))             usersArray = res.data;
      else if (Array.isArray(res.data?.users)) usersArray = res.data.users;
      else throw new Error('Invalid users response format');

      setUsers(usersArray.filter((u) => u._id !== currentUser?._id));
    } catch (error) {
      console.error('Failed to fetch users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser?._id]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  /* ── Message handler ──────────────────────────────────────────────── */
  const handleMessageUser = async (targetUser) => {
    setMessagingUserId(targetUser._id);
    try {
      const res = await directMessageAPI.getOrCreateConversation(targetUser._id);
      if (res.data.success) {
        navigate('/dashboard/chats', {
          state: {
            openChat:       true,
            conversationId: res.data.conversation.conversationId,
            targetUser,
          },
        });
      }
    } catch {
      toast.error('Failed to start conversation');
    } finally {
      setMessagingUserId(null);
    }
  };

  /* ── Call handler ─────────────────────────────────────────────────── */
  const handleCallUser = (targetUser) => {
    const roomId = generateRoomId();
    onCallUser?.(targetUser, roomId);
  };

  /* ── Profile navigation ───────────────────────────────────────────── */
  const handleOpenProfile = (targetUser) => {
    navigate(`/user/${targetUser._id}`);
  };

  /* ── Helpers ──────────────────────────────────────────────────────── */
  const filteredUsers = users.filter((u) =>
    u.username?.toLowerCase().includes(searchQuery?.toLowerCase() || '')
  );

  const getStatusColor = (user) => {
    const live = onlineUsers.includes(user._id) ? 'online' : user.status;
    switch (live) {
      case 'online': return 'bg-emerald-400';
      case 'away':   return 'bg-amber-400';
      case 'busy':   return 'bg-red-500';
      default:       return 'bg-slate-300';
    }
  };

  const getStatusLabel = (user) => {
    const live = onlineUsers.includes(user._id) ? 'online' : user.status;
    if (live === 'online') return 'Online';
    if (!user.lastSeen) return 'Offline';
    const diff = Math.floor((Date.now() - new Date(user.lastSeen)) / 60000);
    if (diff < 1)    return 'Just now';
    if (diff < 60)   return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return `${Math.floor(diff / 1440)}d ago`;
  };

  const isOnline = (user) => onlineUsers.includes(user._id) || user.status === 'online';

  /* ══════════════════════════════════════════════════════════════════════
     LOADING STATE
  ══════════════════════════════════════════════════════════════════════ */
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="relative">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      </div>
      <p className="text-sm text-slate-400 font-medium">Loading people…</p>
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     EMPTY STATE
  ══════════════════════════════════════════════════════════════════════ */
  if (filteredUsers.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-4">
      <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
        <Users className="w-8 h-8 text-slate-300" />
      </div>
      <div className="text-center">
        <p className="text-slate-600 font-semibold text-sm">No users found</p>
        <p className="text-xs text-slate-400 mt-1">
          {searchQuery ? 'Try a different search term' : 'No other users registered yet'}
        </p>
      </div>
      {!searchQuery && (
        <button
          onClick={() => fetchUsers(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      )}
    </div>
  );

  /* ══════════════════════════════════════════════════════════════════════
     MAIN LIST
  ══════════════════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @keyframes ul-fadein {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0);    }
        }
        .ul-card {
          animation: ul-fadein 0.3s ease both;
        }
      `}</style>

      {/* Refresh row */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400 font-medium">
          {filteredUsers.length} {filteredUsers.length === 1 ? 'person' : 'people'}
        </p>
        <button
          onClick={() => fetchUsers(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 font-semibold transition-colors disabled:opacity-40 px-2.5 py-1.5 rounded-lg hover:bg-blue-50"
        >
          <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredUsers.map((targetUser, i) => {
          const online    = isOnline(targetUser);
          const statusLbl = getStatusLabel(targetUser);
          const statusDot = getStatusColor(targetUser);
          const isLoading = messagingUserId === targetUser._id;

          return (
            <div
              key={targetUser._id}
              className="ul-card group relative bg-white rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer"
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => handleOpenProfile(targetUser)}
            >
              {/* Online glow strip */}
              {online && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-400" />
              )}

              <div className="flex items-center gap-3 p-4">

                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className={`${online ? 'ring-2 ring-emerald-400 ring-offset-2' : ''} rounded-full transition-all`}>
                    <img
                      src={targetUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.username}`}
                      alt={targetUser.username}
                      className="w-12 h-12 rounded-full object-cover"
                      onError={(e) => {
                        e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.username}`;
                      }}
                    />
                  </div>
                  {/* Status dot */}
                  <span className={`absolute bottom-0 right-0 w-3 h-3 ${statusDot} rounded-full border-2 border-white`} />
                </div>

                {/* Name + status */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate group-hover:text-blue-600 transition-colors">
                    {targetUser.username}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full ${statusDot} flex-shrink-0`} />
                    <span className={`text-xs font-medium truncate ${online ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {statusLbl}
                    </span>
                  </div>
                </div>

                {/* Action buttons */}
                <div
                  className="flex items-center gap-2 flex-shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Message — always visible */}
                  <button
                    onClick={() => handleMessageUser(targetUser)}
                    disabled={isLoading}
                    title="Send message"
                    className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-blue-600 flex items-center justify-center text-slate-500 hover:text-white transition-all duration-150 disabled:opacity-50 active:scale-90"
                  >
                    {isLoading
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <MessageCircle className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default UserList;