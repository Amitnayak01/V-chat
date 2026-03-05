import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  MessageCircle, Search, X, MessageSquare,
  Pin, Archive, BellOff, CheckCheck, Loader2,
} from 'lucide-react';
import { directMessageAPI } from '../../utils/api';
import api                  from '../../utils/api';
import { useAuth }          from '../../context/AuthContext';
import { useSocket }        from '../../context/SocketContext';
import ChatWindow           from './Chat/ChatWindow';
import ChatList             from './Chat/ChatList';
import toast                from 'react-hot-toast';

/* ─── Skeleton loader ───────────────────────────────────────────────────── */
const ConversationSkeleton = () => (
  <div className="divide-y divide-slate-100 animate-pulse">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3.5">
        <div className="w-12 h-12 rounded-full bg-slate-200 flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex justify-between">
            <div className="h-3.5 w-28 bg-slate-200 rounded-full" />
            <div className="h-3 w-10 bg-slate-100 rounded-full" />
          </div>
          <div className="h-3 w-44 bg-slate-100 rounded-full" />
        </div>
      </div>
    ))}
  </div>
);

/* ─── Filter tabs ────────────────────────────────────────────────────────── */
const TABS = [
  { id: 'all',      label: 'All'      },
  { id: 'unread',   label: 'Unread'   },
  { id: 'pinned',   label: 'Pinned'   },
  { id: 'archived', label: 'Archived' },
];

/* ─── Conversation persistence ───────────────────────────────────────────── */
const LS_CONV_KEY  = 'vmeet_selected_conv_id';
const lsSaveConvId = (id) => { try { if (id) localStorage.setItem(LS_CONV_KEY, id); else localStorage.removeItem(LS_CONV_KEY); } catch {} };
const lsGetConvId  = ()   => { try { return localStorage.getItem(LS_CONV_KEY) || null; } catch { return null; } };

/* ─── Sort helper ────────────────────────────────────────────────────────── */
const sortConversations = (list) =>
  [...list].sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return (
      new Date(b.lastActivityAt || b.updatedAt || 0) -
      new Date(a.lastActivityAt || a.updatedAt || 0)
    );
  });

/* ═══════════════════════════════════════════════════════════════════════════
   Main Chat component
═══════════════════════════════════════════════════════════════════════════ */
const Chat = ({ initialConversation, onChatOpen }) => {
  const { user }         = useAuth();
  const { socket, emit } = useSocket();

  const [conversations,        setConversations]        = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [loading,              setLoading]              = useState(true);
  const [searchQuery,          setSearchQuery]          = useState('');
  const [onlineUsers,          setOnlineUsers]          = useState(new Set());
  const [activeTab,            setActiveTab]            = useState('all');
  const [totalUnread,          setTotalUnread]          = useState(0);
  const [presenceMap,          setPresenceMap]          = useState({});

  const selectedConvRef = useRef(null);
  selectedConvRef.current = selectedConversation;

  /* ─── Fetch conversations ──────────────────────────────────────────── */
  const fetchConversations = useCallback(async () => {
    try {
      const res = await directMessageAPI.getConversations();
      if (res.data?.success) {
        const raw = Array.isArray(res.data.conversations) ? res.data.conversations : [];
        setConversations(raw);
        setTotalUnread(raw.reduce((sum, c) => sum + (c.unreadCount || 0), 0));

        if (!initialConversation) {
          const savedId = lsGetConvId();
          if (savedId) {
            const saved = raw.find((c) => c.conversationId === savedId);
            if (saved) {
              setSelectedConversation(saved);
              onChatOpen?.(true);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
      toast.error('Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, [initialConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  /* ─── Handle redirect (e.g. from UserList "Message" button) ──────────── */
  useEffect(() => {
    if (!initialConversation) return;
    if (!Array.isArray(conversations) || loading) return;

    let conv = conversations.find(
      (c) => c.conversationId === initialConversation.conversationId
    );

    if (!conv && initialConversation.targetUser) {
      conv = {
        conversationId: initialConversation.conversationId,
        user:           initialConversation.targetUser,
        lastMessage:    null,
        unreadCount:    0,
        updatedAt:      new Date(),
        lastActivityAt: new Date(),
        isPinned:       false,
        isMuted:        false,
        isArchived:     false,
      };
      setConversations((prev) => Array.isArray(prev) ? [conv, ...prev] : [conv]);
    }

    if (conv) {
      setSelectedConversation(conv);
      onChatOpen?.(true);
      if ((conv.unreadCount || 0) > 0) {
        directMessageAPI.markAsRead(conv.conversationId).catch(() => {});
        setConversations((prev) =>
          prev.map((c) =>
            c.conversationId === conv.conversationId ? { ...c, unreadCount: 0 } : c
          )
        );
      }
    }
  }, [initialConversation, conversations, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Upsert conversation in list ───────────────────────────────────── */
  const upsertConversation = useCallback((conversationId, updater) => {
    setConversations((prev) => {
      if (!Array.isArray(prev)) return [];
      const idx = prev.findIndex((c) => c.conversationId === conversationId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = typeof updater === 'function' ? updater(updated[idx]) : { ...updated[idx], ...updater };
        return sortConversations(updated);
      }
      return prev;
    });

    // ✅ Keep selectedConversation in sync so ChatWindow reflects changes
    setSelectedConversation((prev) => {
      if (!prev || prev.conversationId !== conversationId) return prev;
      return typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
    });
  }, []);

  /* ─── Socket listeners ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!socket) return;

    /* new message */
    const handleNewMessage = (message) => {
      if (!message?.conversationId) return;
      const cid      = message.conversationId;
      const isActive = selectedConvRef.current?.conversationId === cid;
      const isMe     = message.sender?._id === user?._id || message.sender === user?._id;

      setConversations((prev) => {
        if (!Array.isArray(prev)) return [];
        const exists = prev.find((c) => c.conversationId === cid);
        const newUnread = isActive ? 0 : 1;

        let updated;
        if (exists) {
          updated = prev.map((c) =>
            c.conversationId === cid
              ? {
                  ...c,
                  lastMessage: {
                    content:   message.content,
                    type:      message.type,
                    sender:    message.sender,
                    timestamp: message.createdAt,
                  },
                  unreadCount:    isActive ? 0 : (c.unreadCount || 0) + (isMe ? 0 : newUnread),
                  lastActivityAt: message.createdAt,
                  updatedAt:      message.createdAt,
                }
              : c
          );
        } else {
          const newConv = {
            conversationId: cid,
            user:  isMe ? message.receiver : message.sender,
            lastMessage: {
              content:   message.content,
              type:      message.type,
              sender:    message.sender,
              timestamp: message.createdAt,
            },
            unreadCount:    isMe ? 0 : 1,
            lastActivityAt: message.createdAt,
            updatedAt:      message.createdAt,
            isPinned:       false,
            isMuted:        false,
            isArchived:     false,
          };
          updated = [newConv, ...prev];
        }
        return sortConversations(updated);
      });

      if (!isActive && !isMe) {
        const senderName = message.sender?.username || 'Someone';
        const preview    = message.content
          ? (message.content.length > 40 ? message.content.slice(0, 40) + '…' : message.content)
          : `[${message.type || 'file'}]`;
        toast(`${senderName}: ${preview}`, { icon: '💬', duration: 3000 });
      }

      setTotalUnread((prev) => (isActive || isMe ? prev : prev + 1));
    };

    /* message edited */
    const handleMessageEdit = ({ messageId, conversationId, content }) => {
      setConversations((prev) =>
        prev.map((c) => {
          if (c.conversationId !== conversationId) return c;
          if (c.lastMessage?.messageId === messageId) {
            return { ...c, lastMessage: { ...c.lastMessage, content } };
          }
          return c;
        })
      );
    };

    /* message deleted */
    const handleMessageDelete = ({ messageId, conversationId, deletedForEveryone }) => {
      if (!deletedForEveryone) return;
      setConversations((prev) =>
        prev.map((c) => {
          if (c.conversationId !== conversationId) return c;
          if (c.lastMessage?.messageId === messageId) {
            return { ...c, lastMessage: { ...c.lastMessage, content: '', type: 'deleted' } };
          }
          return c;
        })
      );
    };

    /* batch read */
    const handleBatchRead = ({ conversationId, readBy }) => {
      if (readBy === user?._id || readBy?._id === user?._id) {
        upsertConversation(conversationId, (c) => ({ ...c, unreadCount: 0 }));
        setTotalUnread((prev) => Math.max(0, prev));
      }
    };

    /* ✅ Pin update from socket (other device / server broadcast) */
    const handleConvPinned = ({ conversationId, pinned }) => {
      upsertConversation(conversationId, (c) => ({ ...c, isPinned: pinned }));
    };

    /* ✅ Mute update from socket */
    const handleConvMuted = ({ conversationId, muted }) => {
      upsertConversation(conversationId, (c) => ({ ...c, isMuted: muted }));
    };

    /* ✅ Archive update from socket */
    const handleConvArchived = ({ conversationId, archived }) => {
      upsertConversation(conversationId, (c) => ({ ...c, isArchived: archived }));
    };

    /* presence */
    const handlePresence = ({ userId, status, lastSeen }) => {
      setPresenceMap((prev) => ({
        ...prev,
        [userId]: { status, lastSeen: lastSeen || prev[userId]?.lastSeen },
      }));
      if (status === 'online') {
        setOnlineUsers((prev) => new Set(prev).add(userId));
      } else {
        setOnlineUsers((prev) => { const s = new Set(prev); s.delete(userId); return s; });
      }
      if (lastSeen) {
        setConversations((prev) =>
          prev.map((c) =>
            c.user?._id === userId ? { ...c, user: { ...c.user, lastSeen, status } } : c
          )
        );
      }
    };

    const handleUserOnline = ({ userId }) => {
      setOnlineUsers((prev) => new Set(prev).add(userId));
      setPresenceMap((prev) => ({ ...prev, [userId]: { ...(prev[userId] || {}), status: 'online' } }));
      setConversations((prev) =>
        prev.map((c) => c.user?._id === userId ? { ...c, user: { ...c.user, status: 'online' } } : c)
      );
    };

    const handleUserOffline = ({ userId }) => {
      setOnlineUsers((prev) => { const s = new Set(prev); s.delete(userId); return s; });
      const lastSeen = new Date().toISOString();
      setPresenceMap((prev) => ({ ...prev, [userId]: { status: 'offline', lastSeen } }));
      setConversations((prev) =>
        prev.map((c) =>
          c.user?._id === userId
            ? { ...c, user: { ...c.user, status: 'offline', lastSeen } }
            : c
        )
      );
    };

    const handleStatusChange = ({ userId, status, lastSeen }) => {
      if (status === 'online') handleUserOnline({ userId });
      else handleUserOffline({ userId, lastSeen });
    };

    socket.on('new-direct-message',        handleNewMessage);
    socket.on('message:edit',              handleMessageEdit);
    socket.on('message-edited-direct',     handleMessageEdit);
    socket.on('message:delete',            handleMessageDelete);
    socket.on('message-deleted-direct',    handleMessageDelete);
    socket.on('batch-read-update-direct',  handleBatchRead);
    socket.on('presence-update-direct',    handlePresence);
    socket.on('user-online',               handleUserOnline);
    socket.on('user-offline',              handleUserOffline);
    socket.on('user-status-change',        handleStatusChange);
    // ✅ Fixed event handlers
    socket.on('conversation-pinned',       handleConvPinned);
    socket.on('conversation-muted',        handleConvMuted);
    socket.on('conversation-archived',     handleConvArchived);

    return () => {
      socket.off('new-direct-message',       handleNewMessage);
      socket.off('message:edit',             handleMessageEdit);
      socket.off('message-edited-direct',    handleMessageEdit);
      socket.off('message:delete',           handleMessageDelete);
      socket.off('message-deleted-direct',   handleMessageDelete);
      socket.off('batch-read-update-direct', handleBatchRead);
      socket.off('presence-update-direct',   handlePresence);
      socket.off('user-online',              handleUserOnline);
      socket.off('user-offline',             handleUserOffline);
      socket.off('user-status-change',       handleStatusChange);
      socket.off('conversation-pinned',      handleConvPinned);
      socket.off('conversation-muted',       handleConvMuted);
      socket.off('conversation-archived',    handleConvArchived);
    };
  }, [socket, user, upsertConversation]);

  /* ─── Select conversation ────────────────────────────────────────────── */
  const handleSelectConversation = useCallback((conv) => {
    if (!conv) return;
    onChatOpen?.(true);
    setSelectedConversation(conv);
    lsSaveConvId(conv.conversationId);
    // Only reset tab if leaving archived — keep user's current tab otherwise
    setActiveTab((t) => (t === 'archived' && !conv.isArchived ? 'all' : t));

    if ((conv.unreadCount || 0) > 0) {
      setTotalUnread((prev) => Math.max(0, prev - (conv.unreadCount || 0)));
      setConversations((prev) =>
        prev.map((c) =>
          c.conversationId === conv.conversationId ? { ...c, unreadCount: 0 } : c
        )
      );
      directMessageAPI.markAsRead(conv.conversationId).catch(() => {});
      emit('message:read', { conversationId: conv.conversationId, readBy: user?._id });
    }
  }, [user, emit, onChatOpen]);

  /* ─── Back to list ───────────────────────────────────────────────────── */
  const handleBackToList = useCallback(() => {
    onChatOpen?.(false);
    setSelectedConversation(null);
    lsSaveConvId(null);
  }, [onChatOpen]);

  /* ─── Conversation update callback (from ChatWindow) ─────────────────── */
  const handleConversationUpdate = useCallback((conversationId, patch) => {
    upsertConversation(conversationId, patch);
  }, [upsertConversation]);

  /* ─── Filtering + tab logic ──────────────────────────────────────────── */
  const filteredConversations = useMemo(() => {
    if (!Array.isArray(conversations)) return [];
    let result = conversations;

    // Always separate archived from non-archived first
    if (activeTab === 'archived') {
      result = result.filter((c) => c.isArchived);
    } else {
      // For all non-archived tabs, exclude archived conversations
      result = result.filter((c) => !c.isArchived);
      if (activeTab === 'unread') result = result.filter((c) => (c.unreadCount || 0) > 0);
      if (activeTab === 'pinned') result = result.filter((c) => c.isPinned);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((c) =>
        c.user?.username?.toLowerCase().includes(q) ||
        c.lastMessage?.content?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [conversations, activeTab, searchQuery]);

  /* ─── Enrich online users set with presenceMap ───────────────────────── */
  const enrichedOnlineUsers = useMemo(() => {
    const set = new Set(onlineUsers);
    Object.entries(presenceMap).forEach(([uid, { status }]) => {
      if (status === 'online') set.add(uid);
      else set.delete(uid);
    });
    return set;
  }, [onlineUsers, presenceMap]);

  /* ─── Tab badge counts ───────────────────────────────────────────────── */
  const tabCounts = useMemo(() => {
    const nonArchived = conversations.filter((c) => !c.isArchived);
    return {
      all:      nonArchived.reduce((s, c) => s + (c.unreadCount || 0), 0),
      unread:   nonArchived.filter((c) => (c.unreadCount || 0) > 0).length,
      pinned:   nonArchived.filter((c) => c.isPinned).length,
      archived: conversations.filter((c) => c.isArchived).length,
    };
  }, [conversations]);

  /* ─── Mark all read ──────────────────────────────────────────────────── */
  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = conversations
      .filter((c) => (c.unreadCount || 0) > 0)
      .map((c) => c.conversationId);
    if (!unreadIds.length) return;
    try {
      await (directMessageAPI.batchMarkRead
        ? directMessageAPI.batchMarkRead(unreadIds)
        : Promise.all(unreadIds.map((cid) => directMessageAPI.markAsRead(cid))));
      setConversations((prev) => prev.map((c) => ({ ...c, unreadCount: 0 })));
      setTotalUnread(0);
      toast.success('All conversations marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  }, [conversations]);

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="h-full flex bg-slate-50 overflow-hidden">

      {/* ── Conversation list panel ──────────────────────────────────────── */}
      <div className={`
        w-full md:w-96 border-r border-slate-200 bg-white flex flex-col
        ${selectedConversation ? 'hidden md:flex' : 'flex'}
      `}>

        {/* Header */}
        <div className="px-4 pt-4 pb-2 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-primary-600" />
              Chats
              {totalUnread > 0 && (
                <span className="px-2 py-0.5 bg-primary-600 text-white text-xs rounded-full font-bold">
                  {totalUnread > 99 ? '99+' : totalUnread}
                </span>
              )}
            </h1>
            {totalUnread > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700 font-medium px-2 py-1 rounded-lg hover:bg-primary-50 transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">All read</span>
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-primary-200 focus:border-primary-300 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            {TABS.map(({ id, label }) => {
              const count = tabCounts[id];
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all
                    ${activeTab === id
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}
                >
                  {id === 'pinned'   && <Pin     className="w-3 h-3" />}
                  {id === 'archived' && <Archive className="w-3 h-3" />}
                  {label}
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none
                      ${activeTab === id ? 'bg-white/30 text-white' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <ConversationSkeleton />
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full p-10 text-center">
              <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-3">
                {activeTab === 'unread'   && <MessageCircle className="w-7 h-7 text-slate-300" />}
                {activeTab === 'pinned'   && <Pin           className="w-7 h-7 text-slate-300" />}
                {activeTab === 'archived' && <Archive       className="w-7 h-7 text-slate-300" />}
                {activeTab === 'all'      && <MessageSquare className="w-7 h-7 text-slate-300" />}
              </div>
              <p className="text-slate-500 font-medium text-sm">
                {activeTab === 'unread'   ? 'No unread messages'       :
                 activeTab === 'pinned'   ? 'No pinned conversations'  :
                 activeTab === 'archived' ? 'No archived chats'         :
                 searchQuery              ? 'No results found'          :
                                           'No conversations yet'}
              </p>
              {activeTab === 'all' && !searchQuery && (
                <p className="text-slate-400 text-xs mt-1">
                  Start a conversation from the People section
                </p>
              )}
            </div>
          ) : (
            <ChatList
              conversations={filteredConversations}
              selectedConversation={selectedConversation}
              onSelectConversation={handleSelectConversation}
              onlineUsers={enrichedOnlineUsers}
              currentUserId={user?._id}
            />
          )}
        </div>
      </div>

      {/* ── Chat window panel ────────────────────────────────────────────── */}
      <div className={`
        flex-1 flex flex-col min-w-0
        ${selectedConversation ? 'flex' : 'hidden md:flex'}
      `}>
        {selectedConversation ? (
          <ChatWindow
            key={selectedConversation.conversationId}
            conversation={selectedConversation}
            onBack={handleBackToList}
            isOnline={
              selectedConversation?.user?._id
                ? enrichedOnlineUsers.has(selectedConversation.user._id)
                : false
            }
            onConversationUpdate={handleConversationUpdate}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center p-10">
            <div className="w-20 h-20 bg-primary-50 rounded-full flex items-center justify-center mb-4">
              <MessageCircle className="w-10 h-10 text-primary-300" />
            </div>
            <h3 className="text-lg font-bold text-slate-700 mb-1">Your Messages</h3>
            <p className="text-slate-400 text-sm max-w-xs">
              Select a conversation to start messaging, or find someone from the People section.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;