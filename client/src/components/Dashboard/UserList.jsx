import { useState, useEffect, useCallback } from 'react';
import { Phone, MessageCircle, Loader2, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { userAPI, directMessageAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { generateRoomId } from '../../utils/webrtc';
import toast from 'react-hot-toast';

const UserList = ({ onCallUser, searchQuery }) => {
  const [users,           setUsers]           = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [refreshing,      setRefreshing]      = useState(false);
  const [messagingUserId, setMessagingUserId] = useState(null);

  const { user: currentUser } = useAuth();
  const { onlineUsers }       = useSocket(); // ✅ real-time online status
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

  // ✅ Use live onlineUsers from socket, fall back to DB status
  const getStatusColor = (user) => {
    const live = onlineUsers.includes(user._id) ? 'online' : user.status;
    switch (live) {
      case 'online': return 'bg-green-500';
      case 'away':   return 'bg-yellow-400';
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

  /* ── Loading ──────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
    </div>
  );

  /* ── Empty ────────────────────────────────────────────────────────── */
  if (filteredUsers.length === 0) return (
    <div className="text-center py-12">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
        <MessageCircle className="w-8 h-8 text-slate-300" />
      </div>
      <p className="text-slate-600 font-medium">No users found</p>
      <p className="text-sm text-slate-400 mt-1">
        {searchQuery ? 'Try a different search' : 'No other users registered yet'}
      </p>
      {!searchQuery && (
        <button
          onClick={() => fetchUsers(true)}
          className="mt-4 flex items-center gap-1.5 mx-auto text-sm text-primary-600 hover:text-primary-700 font-medium"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      )}
    </div>
  );

  return (
    <div>
      {/* Refresh button */}
      <div className="flex justify-end mb-2">
        <button
          onClick={() => fetchUsers(true)}
          disabled={refreshing}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredUsers.map((targetUser) => (
          <div
            key={targetUser._id}
            className="card p-4 hover:shadow-md transition-all group cursor-pointer"
            onClick={() => handleOpenProfile(targetUser)}
          >
            <div className="flex items-center space-x-4">

              {/* Avatar with live status dot */}
              <div className="relative flex-shrink-0">
                <img
                  src={targetUser.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.username}`}
                  alt={targetUser.username}
                  className="w-14 h-14 rounded-full object-cover group-hover:ring-2 group-hover:ring-primary-400 group-hover:ring-offset-1 transition-all"
                  onError={(e) => {
                    e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.username}`;
                  }}
                />
                <div className={`absolute bottom-0 right-0 w-3.5 h-3.5 ${getStatusColor(targetUser)} rounded-full border-2 border-white`} />
              </div>

              {/* Name + status */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-slate-900 truncate group-hover:text-primary-600 transition-colors">
                  {targetUser.username}
                </h3>
                <p className="text-xs text-slate-500">
                  {getStatusLabel(targetUser)}
                </p>
              </div>

              {/* Action buttons */}
              <div
                className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => handleMessageUser(targetUser)}
                  disabled={messagingUserId === targetUser._id}
                  className="w-9 h-9 rounded-full bg-primary-100 hover:bg-primary-200 flex items-center justify-center text-primary-600 transition-all disabled:opacity-50"
                  title="Send message"
                >
                  {messagingUserId === targetUser._id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <MessageCircle className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => handleCallUser(targetUser)}
                  className="w-9 h-9 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center text-green-600 transition-all"
                  title="Video call"
                >
                  <Phone className="w-4 h-4" />
                </button>
              </div>

            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default UserList;