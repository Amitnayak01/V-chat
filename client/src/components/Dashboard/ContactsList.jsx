import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, Phone, Search, Loader2, Users, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { directMessageAPI } from '../../utils/api';
import api from '../../utils/api';
import toast from 'react-hot-toast';

/* ─── helpers ─────────────────────────────────────────────────────────────── */
const getStatusColor = (status) => {
  switch (status) {
    case 'online': return 'bg-green-500';
    case 'away':   return 'bg-yellow-400';
    case 'busy':   return 'bg-red-500';
    default:       return 'bg-slate-300';
  }
};

const formatTime = (date) => {
  if (!date) return '';
  const d    = new Date(date);
  const now  = new Date();
  const diff = Math.floor((now - d) / 1000);

  if (diff < 60)              return 'now';
  if (diff < 3600)            return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)           return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800)          return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const getLastMessagePreview = (lastMessage, currentUserId) => {
  if (!lastMessage) return 'No messages yet';
  const isMe = lastMessage.senderId?.toString() === currentUserId?.toString();
  const prefix = isMe ? 'You: ' : '';

  switch (lastMessage.type) {
    case 'image':  return `${prefix}📷 Photo`;
    case 'file':   return `${prefix}📎 File`;
    case 'audio':  return `${prefix}🎵 Audio`;
    case 'video':  return `${prefix}🎥 Video`;
    case 'video-call': return `${prefix}📞 Video call`;
    default:
      return `${prefix}${lastMessage.content || ''}`;
  }
};

/* ─── Empty state ─────────────────────────────────────────────────────────── */
const EmptyState = ({ isSearching }) => (
  <div className="flex flex-col items-center justify-center py-16 px-4">
    <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-4">
      <Users className="w-10 h-10 text-primary-300" />
    </div>
    <h3 className="text-lg font-semibold text-slate-700 mb-1">
      {isSearching ? 'No contacts found' : 'No contacts yet'}
    </h3>
    <p className="text-sm text-slate-400 text-center max-w-xs">
      {isSearching
        ? 'Try searching with a different name.'
        : 'Start a conversation with someone and they\'ll appear here.'}
    </p>
  </div>
);

/* ─── Contact card ────────────────────────────────────────────────────────── */
const ContactCard = ({ contact, currentUserId, isOnline, onMessage, onCall, onViewProfile, messaging }) => {
  const preview   = getLastMessagePreview(contact.lastMessage, currentUserId);
  const timeStr   = formatTime(contact.lastActivityAt);
  const hasUnread = contact.unreadCount > 0;
  const status    = isOnline ? 'online' : contact.status;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer"
      onClick={() => onViewProfile(contact)}>

      {/* Avatar + status dot */}
      <div className="relative flex-shrink-0">
        <img
          src={contact.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.username}`}
          alt={contact.username}
          className="w-12 h-12 rounded-full object-cover"
          onError={(e) => {
            e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.username}`;
          }}
        />
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(status)}`} />
      </div>

      {/* Name + preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`font-semibold text-sm truncate ${hasUnread ? 'text-slate-900' : 'text-slate-700'}`}>
            {contact.username}
          </span>
          <span className="text-xs text-slate-400 flex-shrink-0">{timeStr}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <p className={`text-xs truncate ${hasUnread ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
            {preview}
          </p>
          {hasUnread > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-primary-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {contact.unreadCount > 99 ? '99+' : contact.unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons — visible on hover */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
        onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => onMessage(contact)}
          disabled={messaging === contact._id}
          title="Open chat"
          className="w-8 h-8 rounded-full bg-primary-100 hover:bg-primary-200 flex items-center justify-center text-primary-600 transition-colors disabled:opacity-50"
        >
          {messaging === contact._id
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <MessageCircle className="w-3.5 h-3.5" />}
        </button>
        <button
          onClick={() => onCall(contact)}
          title="Video call"
          className="w-8 h-8 rounded-full bg-green-100 hover:bg-green-200 flex items-center justify-center text-green-600 transition-colors"
        >
          <Phone className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

/* ─── Main ContactsList component ─────────────────────────────────────────── */
const ContactsList = ({ onCallUser }) => {
  const [contacts,   setContacts]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [messaging,  setMessaging]  = useState(null);

  const { user: currentUser }   = useAuth();
  const { onlineUsers, on, off } = useSocket();
  const navigate                 = useNavigate();
  const searchRef                = useRef(null);

  /* ── Fetch contacts ─────────────────────────────────────────────────── */
  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/contacts');
      if (res.data.success) {
        setContacts(res.data.contacts);
      }
    } catch (err) {
      console.error('Fetch contacts error:', err);
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  /* ── Real-time: refresh contacts when a new DM arrives ─────────────── */
  useEffect(() => {
    const handleNewMessage = (msg) => {
      // Update the matching contact's last message + activity in place
      setContacts((prev) => {
        const idx = prev.findIndex((c) => c.conversationId === msg.conversationId);
        if (idx === -1) {
          // New conversation — refetch to get full contact data
          fetchContacts();
          return prev;
        }
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          lastMessage: {
            content:   msg.content,
            type:      msg.type || 'text',
            senderId:  msg.sender,
            timestamp: msg.createdAt || new Date().toISOString(),
          },
          lastActivityAt: msg.createdAt || new Date().toISOString(),
          // Bump unread if message is from the other user
          unreadCount:
            msg.sender !== currentUser?._id
              ? (updated[idx].unreadCount || 0) + 1
              : updated[idx].unreadCount,
        };
        // Re-sort by lastActivityAt desc
        return updated.sort(
          (a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt)
        );
      });
    };

    on('receive-dm', handleNewMessage);
    on('dm-sent',    handleNewMessage);

    return () => {
      off('receive-dm', handleNewMessage);
      off('dm-sent',    handleNewMessage);
    };
  }, [on, off, fetchContacts, currentUser]);

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const handleMessage = async (contact) => {
    setMessaging(contact._id);
    try {
      const res = await directMessageAPI.getOrCreateConversation(contact._id);
      if (res.data.success) {
        // Clear unread badge locally
        setContacts((prev) =>
          prev.map((c) =>
            c._id === contact._id ? { ...c, unreadCount: 0 } : c
          )
        );
        navigate('/', {
          state: {
            openChat:       true,
            conversationId: res.data.conversation.conversationId,
            targetUser:     contact,
          },
        });
      }
    } catch {
      toast.error('Failed to open chat');
    } finally {
      setMessaging(null);
    }
  };

  const handleCall = (contact) => {
    const roomId = Math.random().toString(36).substring(2, 9);
    onCallUser?.(contact, roomId);
  };

  const handleViewProfile = (contact) => {
    navigate(`/user/${contact._id}`);
  };

  /* ── Filtered list ──────────────────────────────────────────────────── */
  const filtered = contacts.filter((c) =>
    c.username?.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Render ─────────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
    </div>
  );

  return (
    <div className="flex flex-col h-full">

      {/* Search bar */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search contacts…"
          className="w-full pl-9 pr-9 py-2.5 text-sm bg-slate-100 hover:bg-slate-200 focus:bg-white border border-transparent focus:border-primary-300 rounded-xl outline-none transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Count */}
      {!search && contacts.length > 0 && (
        <p className="text-xs text-slate-400 mb-3 px-1">
          {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
        </p>
      )}
      {search && (
        <p className="text-xs text-slate-400 mb-3 px-1">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "{search}"
        </p>
      )}

      {/* List */}
      {filtered.length === 0
        ? <EmptyState isSearching={!!search} />
        : (
          <div className="flex flex-col gap-0.5 overflow-y-auto">
            {filtered.map((contact) => (
              <ContactCard
                key={contact._id}
                contact={contact}
                currentUserId={currentUser?._id}
                isOnline={onlineUsers.includes(contact._id?.toString())}
                onMessage={handleMessage}
                onCall={handleCall}
                onViewProfile={handleViewProfile}
                messaging={messaging}
              />
            ))}
          </div>
        )
      }
    </div>
  );
};

export default ContactsList;