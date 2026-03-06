import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, PhoneCall, Search, Loader2, Users, X, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useAudioCall } from '../../context/AudioCallContext';
import { directMessageAPI } from '../../utils/api';
import api from '../../utils/api';
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS  — 100% unchanged
═══════════════════════════════════════════════════════════════════════════ */
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
  if (diff < 60)     return 'now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const getLastMessagePreview = (lastMessage, currentUserId) => {
  if (!lastMessage) return 'No messages yet';
  const isMe   = lastMessage.senderId?.toString() === currentUserId?.toString();
  const prefix = isMe ? 'You: ' : '';
  switch (lastMessage.type) {
    case 'image':      return `${prefix}📷 Photo`;
    case 'file':       return `${prefix}📎 File`;
    case 'audio':      return `${prefix}🎵 Audio`;
    case 'video':      return `${prefix}🎥 Video`;
    case 'video-call': return `${prefix}📞 Video call`;
    default:           return `${prefix}${lastMessage.content || ''}`;
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   EMPTY STATE
═══════════════════════════════════════════════════════════════════════════ */
const EmptyState = ({ isSearching }) => (
  <div className="flex flex-col items-center justify-center py-20 px-4">
    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
      <Users className="w-8 h-8 text-slate-400" />
    </div>
    <h3 className="text-base font-bold text-slate-700 mb-1">
      {isSearching ? 'No contacts found' : 'No contacts yet'}
    </h3>
    <p className="text-sm text-slate-400 text-center max-w-xs leading-relaxed">
      {isSearching
        ? 'Try searching with a different name.'
        : "Start a conversation with someone and they'll appear here."}
    </p>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   CONTACT CARD  — message always visible · voice call always visible · no video call
═══════════════════════════════════════════════════════════════════════════ */
const ContactCard = ({ contact, currentUserId, isOnline, onMessage, onCall, onViewProfile, messaging }) => {
  const preview   = getLastMessagePreview(contact.lastMessage, currentUserId);
  const timeStr   = formatTime(contact.lastActivityAt);
  const hasUnread = contact.unreadCount > 0;
  const status    = isOnline ? 'online' : contact.status;

  return (
    <div
      className="cl-card group relative flex items-center gap-3 px-4 py-3 bg-white rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-md transition-all duration-200 cursor-pointer"
      onClick={() => onViewProfile(contact)}
    >
      {/* Online strip */}
      {isOnline && (
        <div className="absolute left-0 top-3 bottom-3 w-[3px] bg-gradient-to-b from-emerald-400 to-teal-400 rounded-r-full" />
      )}

      {/* Avatar + status dot */}
      <div className="relative flex-shrink-0 ml-1">
        <img
          src={contact.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.username}`}
          alt={contact.username}
          className={`w-12 h-12 rounded-full object-cover transition-all ${isOnline ? 'ring-2 ring-emerald-400 ring-offset-2' : ''}`}
          onError={(e) => {
            e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${contact.username}`;
          }}
        />
        <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${getStatusColor(status)}`} />
      </div>

      {/* Name + last message preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-bold text-sm truncate ${hasUnread ? 'text-slate-900' : 'text-slate-700'} group-hover:text-blue-600 transition-colors`}>
            {contact.username}
          </span>
          <span className="text-[11px] text-slate-400 flex-shrink-0 font-medium">{timeStr}</span>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className={`text-xs truncate ${hasUnread ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>
            {preview}
          </p>
          {hasUnread > 0 && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
              {contact.unreadCount > 99 ? '99+' : contact.unreadCount}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons — ALWAYS visible, stop card click */}
      <div
        className="flex items-center gap-1.5 flex-shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Message */}
        <button
          onClick={() => onMessage(contact)}
          disabled={messaging === contact._id}
          title="Open chat"
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-blue-600 flex items-center justify-center text-slate-500 hover:text-white transition-all duration-150 disabled:opacity-50 active:scale-90"
        >
          {messaging === contact._id
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <MessageCircle className="w-4 h-4" />}
        </button>

        {/* Voice Call — always visible, replaces old call btn */}
        <button
          onClick={() => onCall(contact)}
          title="Voice call"
          className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-emerald-500 flex items-center justify-center text-slate-500 hover:text-white transition-all duration-150 active:scale-90"
        >
          <PhoneCall className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT  — all logic 100% unchanged
═══════════════════════════════════════════════════════════════════════════ */
const ContactsList = ({ onCallUser }) => {
  const [contacts,  setContacts]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [messaging, setMessaging] = useState(null);

  const { user: currentUser }          = useAuth();
  const { onlineUsers, on, off }       = useSocket();
  const { initiateCall }               = useAudioCall();
  const navigate                 = useNavigate();
  const searchRef                = useRef(null);

  /* ── Fetch contacts ─────────────────────────────────────────────── */
  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/contacts');
      if (res.data.success) setContacts(res.data.contacts);
    } catch (err) {
      console.error('Fetch contacts error:', err);
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  /* ── Real-time DM updates ───────────────────────────────────────── */
  useEffect(() => {
    const handleNewMessage = (msg) => {
      setContacts((prev) => {
        const idx = prev.findIndex((c) => c.conversationId === msg.conversationId);
        if (idx === -1) { fetchContacts(); return prev; }
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
          unreadCount:
            msg.sender !== currentUser?._id
              ? (updated[idx].unreadCount || 0) + 1
              : updated[idx].unreadCount,
        };
        return updated.sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));
      });
    };

    on('receive-dm', handleNewMessage);
    on('dm-sent',    handleNewMessage);
    return () => {
      off('receive-dm', handleNewMessage);
      off('dm-sent',    handleNewMessage);
    };
  }, [on, off, fetchContacts, currentUser]);

  /* ── Handlers ───────────────────────────────────────────────────── */
  const handleMessage = async (contact) => {
    setMessaging(contact._id);
    try {
      const res = await directMessageAPI.getOrCreateConversation(contact._id);
      if (res.data.success) {
        setContacts((prev) => prev.map((c) => c._id === contact._id ? { ...c, unreadCount: 0 } : c));
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
    initiateCall(contact._id, contact.username, contact.avatar);
  };

  const handleViewProfile = (contact) => {
    navigate(`/user/${contact._id}`);
  };

  /* ── Filter ─────────────────────────────────────────────────────── */
  const filtered = contacts.filter((c) =>
    c.username?.toLowerCase().includes(search.toLowerCase())
  );

  const onlineCount = contacts.filter((c) => onlineUsers.includes(c._id?.toString())).length;

  /* ── Loading ────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
      <p className="text-sm text-slate-400 font-medium">Loading contacts…</p>
    </div>
  );

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <>
      <style>{`
        @keyframes cl-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0);   }
        }
        .cl-card { animation: cl-in 0.25s ease both; }
      `}</style>

      <div className="flex flex-col gap-4">

        {/* ── Header row ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">Contacts</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
              {contacts.length > 0
                ? `${contacts.length} contact${contacts.length !== 1 ? 's' : ''}${onlineCount > 0 ? ` · ${onlineCount} online` : ''}`
                : 'People you\'ve messaged'}
            </p>
          </div>
          <button
            onClick={fetchContacts}
            title="Refresh"
            className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-slate-400 flex items-center justify-center transition-all active:scale-90"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* ── Search ────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            className="w-full pl-10 pr-10 py-2.5 text-sm bg-white border border-slate-200 focus:border-blue-400 focus:ring-2 focus:ring-blue-100 rounded-xl outline-none transition-all shadow-sm"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* ── Search result count ────────────────────────────────────── */}
        {search && filtered.length > 0 && (
          <p className="text-xs text-slate-400 -mt-1 px-1">
            {filtered.length} result{filtered.length !== 1 ? 's' : ''} for "<span className="text-slate-600 font-semibold">{search}</span>"
          </p>
        )}

        {/* ── Online section ─────────────────────────────────────────── */}
        {!search && onlineCount > 0 && (
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
              Online now · {onlineCount}
            </p>
            <div className="flex flex-col gap-2">
              {filtered
                .filter((c) => onlineUsers.includes(c._id?.toString()))
                .map((contact, i) => (
                  <div key={contact._id} style={{ animationDelay: `${i * 35}ms` }}>
                    <ContactCard
                      contact={contact}
                      currentUserId={currentUser?._id}
                      isOnline
                      onMessage={handleMessage}
                      onCall={handleCall}
                      onViewProfile={handleViewProfile}
                      messaging={messaging}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── All / offline section ─────────────────────────────────── */}
        {filtered.filter((c) => search || !onlineUsers.includes(c._id?.toString())).length > 0 && (
          <div>
            {!search && onlineCount > 0 && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">
                All contacts
              </p>
            )}
            <div className="flex flex-col gap-2">
              {filtered
                .filter((c) => search || !onlineUsers.includes(c._id?.toString()))
                .map((contact, i) => (
                  <div key={contact._id} style={{ animationDelay: `${i * 35}ms` }}>
                    <ContactCard
                      contact={contact}
                      currentUserId={currentUser?._id}
                      isOnline={onlineUsers.includes(contact._id?.toString())}
                      onMessage={handleMessage}
                      onCall={handleCall}
                      onViewProfile={handleViewProfile}
                      messaging={messaging}
                    />
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {filtered.length === 0 && <EmptyState isSearching={!!search} />}

      </div>
    </>
  );
};

export default ContactsList;