import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft, Video, MoreVertical, Loader2,Phone,
  ChevronDown, Search, Pin, BellOff, Archive, Trash2, X,
  CheckSquare, Square, Trash, Share2,
} from 'lucide-react';
import { directMessageAPI } from '../../../utils/api';
import api from '../../../utils/api';
import { useAuth } from '../../../context/AuthContext';
import { useSocket } from '../../../context/SocketContext';
import { useNavigate } from 'react-router-dom';
import Message from './Message';
import MessageInput from './MessageInput';
import ForwardModal from './ForwardModal';
import DeleteMessageModal from './DeleteMessageModal';
import toast from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
 import { useAudioCall } from '../../../context/AudioCallContext'; 
/* ─── Reply persistence ─────────────────────────────────────────────────── */
const _LS_KEY = 'vmeet_replies';
const _readStore = () => {
  try { return JSON.parse(localStorage.getItem(_LS_KEY) || '{}'); } catch { return {}; }
};
const _writeStore = (store) => {
  const keys = Object.keys(store);
  if (keys.length > 800) keys.slice(0, keys.length - 800).forEach((k) => delete store[k]);
  try { localStorage.setItem(_LS_KEY, JSON.stringify(store)); } catch {}
};
const lsPersistReply = (replyingMsgId, replyTo) => {
  if (!replyingMsgId || !replyTo?.messageId) return;
  const store = _readStore();
  store[String(replyingMsgId)] = {
    messageId:      String(replyTo.messageId),
    content:        replyTo.content        || '',
    senderUsername: replyTo.senderUsername || '',
    type:           replyTo.type           || '',
    attachments:    replyTo.attachments    || [],
  };
  _writeStore(store);
};
const lsRestoreReply = (replyingMsgId) => {
  if (!replyingMsgId) return null;
  const entry = _readStore()[String(replyingMsgId)];
  if (!entry?.senderUsername || !entry?.messageId) return null;
  return entry;
};

/* ─── Skeleton ──────────────────────────────────────────────────────────── */
const MessageSkeleton = () => (
  <div className="space-y-3 p-4 animate-pulse">
    {[...Array(6)].map((_, i) => (
      <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
        <div
          className={`rounded-2xl ${i % 2 === 0 ? 'bg-white' : 'bg-primary-100'}`}
          style={{ width: `${120 + (i * 37) % 120}px`, height: '40px' }}
        />
      </div>
    ))}
  </div>
);

/* ─── Date divider ──────────────────────────────────────────────────────── */
const DateDivider = ({ date }) => {
  const label = (() => {
    const d         = new Date(date);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  })();
  return (
    <div className="flex items-center justify-center my-4">
      <span className="px-3 py-1 bg-white rounded-full text-xs text-slate-500 shadow-sm border border-slate-100">
        {label}
      </span>
    </div>
  );
};

/* ─── Generic Confirm Modal ─────────────────────────────────────────────── */
const ConfirmModal = ({ isOpen, title, message, confirmLabel, confirmDanger, onConfirm, onClose }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'confirmModalIn 0.18s cubic-bezier(0.34,1.56,0.64,1) forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <h3 className="text-base font-bold text-slate-800 mb-2">{title}</h3>
          <p className="text-sm text-slate-500 leading-relaxed">{message}</p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${confirmDanger ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-600 hover:bg-primary-700'}`}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Batch Delete Modal ────────────────────────────────────────────────── */
const BatchDeleteModal = ({ isOpen, count, canDeleteEveryone, onDeleteForMe, onDeleteForEveryone, onClose }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15,23,42,0.50)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden"
        style={{ animation: 'batchDeleteIn 0.2s cubic-bezier(0.34,1.46,0.64,1) forwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
              <Trash className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                Delete {count} {count === 1 ? 'message' : 'messages'}?
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Choose who to delete this for</p>
            </div>
          </div>
        </div>

        <div className="mx-6 border-t border-slate-100" />

        {/* Options */}
        <div className="px-4 py-3 space-y-1.5">
          {/* Delete for me */}
          <button
            onClick={() => { onDeleteForMe(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors text-left group"
          >
            <div className="w-9 h-9 rounded-full bg-slate-100 group-hover:bg-slate-200 flex items-center justify-center flex-shrink-0 transition-colors">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">Delete for me</p>
              <p className="text-xs text-slate-400">Only removed from your chat</p>
            </div>
          </button>

          {/* Delete for everyone — only when all messages are own */}
          {canDeleteEveryone && (
            <button
              onClick={() => { onDeleteForEveryone(); onClose(); }}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-red-50 transition-colors text-left group"
            >
              <div className="w-9 h-9 rounded-full bg-red-50 group-hover:bg-red-100 flex items-center justify-center flex-shrink-0 transition-colors">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-red-600">Delete for everyone</p>
                <p className="text-xs text-slate-400">Removed for all participants</p>
              </div>
            </button>
          )}
        </div>

        {/* Cancel */}
        <div className="px-4 pb-5">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

/* ─── Context menu ──────────────────────────────────────────────────────── */
const ContextMenu = ({ x, y, message, isOwn, onClose, onReply, onEdit, onDelete, onStar, onForward, onStartMultiSelect }) => {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    { label: 'Reply',   action: onReply,            icon: '↩️' },
    { label: 'Forward', action: onForward,           icon: '↪️' },
    { label: 'Select',  action: onStartMultiSelect,  icon: '☑️' },
    { label: message?.starredBy?.includes?.('me') ? 'Unstar' : 'Star', action: onStar, icon: '⭐' },
    isOwn && message?.content && !message?.attachments?.length && { label: 'Edit', action: onEdit, icon: '✏️' },
    { label: 'Delete', action: onDelete, icon: '🗑️', danger: true },
  ].filter(Boolean);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-100 py-1 w-44"
      style={{ left: Math.min(x, window.innerWidth - 185), top: Math.min(y, window.innerHeight - 280) }}
    >
      {items.map(({ label, action, icon, danger }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 transition-colors ${danger ? 'text-red-500 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'}`}
        >
          <span>{icon}</span> {label}
        </button>
      ))}
    </div>
  );
};

/* ─── Selection Checkbox ─────────────────────────────────────────────────── */
const SelectionCheckbox = ({ selected, onClick }) => (
  <div
    onClick={(e) => { e.stopPropagation(); onClick(e); }}
    className="flex-shrink-0 flex items-center justify-center"
    style={{ width: 28, height: 28, cursor: 'pointer' }}
  >
    <div style={{
      width: 22, height: 22, borderRadius: '50%',
      border: selected ? '2px solid #3b82f6' : '2px solid #cbd5e1',
      background: selected ? '#3b82f6' : '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.15s cubic-bezier(0.34,1.56,0.64,1)',
      boxShadow: selected ? '0 0 0 3px rgba(59,130,246,0.18)' : 'none',
      flexShrink: 0,
    }}>
      {selected && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      )}
    </div>
  </div>
);

/* ─── Forward SVG ────────────────────────────────────────────────────────── */
const ForwardSVG = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 10 20 15 15 20"/>
    <path d="M4 4v7a4 4 0 004 4h12"/>
  </svg>
);

/* ═══════════════════════════════════════════════════════════════════════════
   Main ChatWindow
═══════════════════════════════════════════════════════════════════════════ */
const ChatWindow = ({ conversation, onBack, isOnline, onConversationUpdate }) => {
  const { user }         = useAuth();
const { socket, emit } = useSocket();
const navigate         = useNavigate();
const { initiateCall } = useAudioCall();    // ← NEW

  /* ── Core state ──────────────────────────────────────────────────────── */
  const [messages,       setMessages]       = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadingMore,    setLoadingMore]    = useState(false);
  const [hasMore,        setHasMore]        = useState(true);
  const [nextCursor,     setNextCursor]     = useState(null);
  const [sending,        setSending]        = useState(false);
  const [typingUsers,    setTypingUsers]    = useState(new Set());
  const [replyTo,        setReplyTo]        = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [showScrollBtn,  setShowScrollBtn]  = useState(false);
  const [contextMenu,    setContextMenu]    = useState(null);
  const [presenceLabel,  setPresenceLabel]  = useState('');
  const [lastSeen,       setLastSeen]       = useState(conversation.user?.lastSeen);
  const [showSearch,     setShowSearch]     = useState(false);
  const [searchQuery,    setSearchQuery]    = useState('');
  const [searchResults,  setSearchResults]  = useState([]);
  const [moreMenuOpen,   setMoreMenuOpen]   = useState(false);

  /* ── Conversation flags ──────────────────────────────────────────────── */
  const [isPinned, setIsPinned] = useState(conversation.isPinned || false);
  const [isMuted,  setIsMuted]  = useState(conversation.isMuted  || false);

  /* ── Modals ──────────────────────────────────────────────────────────── */
  const [deleteModal,    setDeleteModal]    = useState(null);   // single delete
  const [confirmModal,   setConfirmModal]   = useState(null);   // generic confirm
  const [batchDeleteModal, setBatchDeleteModal] = useState(false); // batch delete

  /* ── Multi-select state ──────────────────────────────────────────────── */
  const [multiSelectMode,  setMultiSelectMode]  = useState(false);
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [showBatchForward, setShowBatchForward] = useState(false);

  /* ── Single-message forward ──────────────────────────────────────────── */
  const [forwardTarget, setForwardTarget] = useState(null);

  /* ── Refs ────────────────────────────────────────────────────────────── */
  const messagesEndRef      = useRef(null);
  const scrollAreaRef       = useRef(null);
  const typingTimeoutRef    = useRef(null);
  const isAtBottomRef       = useRef(true);
  const moreMenuRef         = useRef(null);
  const messagesRef         = useRef([]);
  const msgCacheRef         = useRef({});
  const messageRefsMap      = useRef(new Map());
  const highlightTimeoutRef = useRef(null);

  /* ── Multi-select refs ───────────────────────────────────────────────── */
  const lastSelectedIndexRef = useRef(-1);  // for Shift+click range
  const longPressTimerRef    = useRef(null); // single long-press timer
  const touchMovedRef        = useRef(false); // did finger move? → cancel long-press

  /* ── Sync conversation flags ─────────────────────────────────────────── */
  useEffect(() => {
    setIsPinned(conversation.isPinned || false);
    setIsMuted(conversation.isMuted   || false);
  }, [conversation.isPinned, conversation.isMuted]);

  /* ── messagesRef sync ────────────────────────────────────────────────── */
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  /* ── Register message DOM refs ───────────────────────────────────────── */
  const registerMessageRef = useCallback((id, el) => {
    if (el) messageRefsMap.current.set(String(id), el);
    else    messageRefsMap.current.delete(String(id));
  }, []);

  /* ── Escape: exit multi-select ───────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && multiSelectMode) exitMultiSelect(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [multiSelectMode]); // eslint-disable-line

  /* ── Reply bubble highlight ──────────────────────────────────────────── */
  const handleReplyBubbleClick = useCallback((originalMessageId) => {
    if (!originalMessageId) return;
    const el = messageRefsMap.current.get(String(originalMessageId));
    if (!el) { toast('Original message not loaded yet', { icon: 'ℹ️', duration: 2000 }); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
      messageRefsMap.current.forEach((node) => node.classList.remove('msg-reply-highlight'));
    }
    requestAnimationFrame(() => {
      el.classList.add('msg-reply-highlight');
      highlightTimeoutRef.current = setTimeout(() => {
        el.classList.remove('msg-reply-highlight');
        highlightTimeoutRef.current = null;
      }, 2500);
    });
  }, []);
  useEffect(() => () => { if (highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current); }, []);

  /* ── Presence label ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (isOnline) { if (typingUsers.size > 0) return; setPresenceLabel('Online'); }
    else if (lastSeen) setPresenceLabel(`Last seen ${formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}`);
    else setPresenceLabel('Offline');
  }, [isOnline, lastSeen, typingUsers]);

  /* ── Reply helpers ───────────────────────────────────────────────────── */
  const resolveSenderUsername = useCallback((sender) => {
    if (!sender) return '';
    if (typeof sender === 'object' && sender.username) return sender.username;
    const id = (typeof sender === 'object' ? sender._id : sender)?.toString?.() || '';
    if (!id) return '';
    if (id === String(user?._id || ''))              return user?.username || '';
    if (id === String(conversation.user?._id || '')) return conversation.user?.username || '';
    return '';
  }, [user, conversation.user]);

  const buildReplyTo = useCallback((replyingMsgId, rawRt, optimisticRt = null) => {
    const best = optimisticRt || rawRt;
    if (!best) return null;
    const refId          = String(best.messageId || best._id || rawRt?.messageId || '');
    const senderUsername = best.senderUsername || resolveSenderUsername(best.sender) || optimisticRt?.senderUsername || '';
    const content        = best.content        || optimisticRt?.content        || '';
    const type           = best.type           || optimisticRt?.type           || '';
    const attachments    = (best.attachments?.length ? best.attachments : null) || optimisticRt?.attachments || [];
    if (!refId) return null;
    const cached = msgCacheRef.current[refId];
    const resolved = {
      messageId:      refId,
      content:        content    || cached?.content    || '',
      senderUsername: senderUsername || resolveSenderUsername(cached?.sender) || '',
      type:           type       || cached?.type       || '',
      attachments:    attachments.length ? attachments : (cached?.attachments || []),
    };
    if (replyingMsgId && resolved.senderUsername) lsPersistReply(String(replyingMsgId), resolved);
    return resolved;
  }, [resolveSenderUsername]);

  const populateReplies = useCallback((msgs) => {
    msgs.forEach((m) => { if (m._id) msgCacheRef.current[String(m._id)] = m; });
    return msgs.map((m) => {
      const id = String(m._id || '');
      if (m.replyTo) return { ...m, replyTo: buildReplyTo(id, m.replyTo) };
      const saved = lsRestoreReply(id);
      if (saved) return { ...m, replyTo: saved };
      return m;
    });
  }, [buildReplyTo]);

  const resolveOrphanReplies = useCallback(async (msgs) => {
    const orphans = msgs.filter((m) => {
      const rt = m.replyTo;
      if (!rt?.messageId) return false;
      return !rt.senderUsername || (!rt.content && !rt.type && !rt.attachments?.length);
    });
    if (!orphans.length) return;
    try {
      const res = await directMessageAPI.getMessages(conversation.conversationId, undefined, 500);
      if (!res.data.success) return;
      (res.data.messages || []).forEach((m) => { if (m._id) msgCacheRef.current[String(m._id)] = m; });
      setMessages((prev) => prev.map((m) => {
        const rt = m.replyTo;
        if (!rt?.messageId) return m;
        if (rt.senderUsername && (rt.content || rt.type || rt.attachments?.length)) return m;
        const source = msgCacheRef.current[String(rt.messageId)];
        if (!source) return m;
        const resolved = buildReplyTo(String(m._id), rt, {
          messageId: String(source._id), content: source.content || '',
          senderUsername: resolveSenderUsername(source.sender),
          type: source.type || '', attachments: source.attachments || [],
        });
        return resolved ? { ...m, replyTo: resolved } : m;
      }));
    } catch (_) {}
  }, [conversation.conversationId, buildReplyTo, resolveSenderUsername]);

  /* ── Fetch messages ──────────────────────────────────────────────────── */
  const fetchMessages = useCallback(async () => {
    try {
      const res = await directMessageAPI.getMessages(conversation.conversationId, undefined, 200);
      if (res.data.success) {
        const populated = populateReplies(res.data.messages || []);
        setMessages(populated);
        setHasMore(res.data.pagination?.hasMore ?? false);
        setNextCursor(res.data.pagination?.nextCursor ?? null);
        resolveOrphanReplies(populated);
      }
    } catch { toast.error('Failed to load messages'); }
    finally  { setLoading(false); }
  }, [conversation.conversationId, populateReplies, resolveOrphanReplies]);

  useEffect(() => {
    setMessages([]); setLoading(true); setNextCursor(null); setHasMore(true);
    exitMultiSelect(); setForwardTarget(null);
    fetchMessages();
    if (socket) {
      emit('conversation:join',  { conversationId: conversation.conversationId });
      emit('presence:subscribe', { conversationId: conversation.conversationId });
    }
  }, [conversation.conversationId]); // eslint-disable-line

  /* ── Load more ───────────────────────────────────────────────────────── */
  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    setLoadingMore(true);
    const scrollArea = scrollAreaRef.current;
    const prevHeight = scrollArea?.scrollHeight || 0;
    try {
      const res = await directMessageAPI.getMessages(conversation.conversationId, undefined, 30);
      if (res.data.success) {
        const older = populateReplies(res.data.messages || []);
        setMessages((prev) => [...older, ...prev]);
        setHasMore(res.data.pagination?.hasMore ?? false);
        setNextCursor(res.data.pagination?.nextCursor ?? null);
        requestAnimationFrame(() => { if (scrollArea) scrollArea.scrollTop = scrollArea.scrollHeight - prevHeight; });
      }
    } catch (_) {}
    finally { setLoadingMore(false); }
  }, [hasMore, loadingMore, nextCursor, conversation.conversationId, populateReplies]);

  /* ── Scroll ──────────────────────────────────────────────────────────── */
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollAreaRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAtBottomRef.current = atBottom;
    setShowScrollBtn(!atBottom);
    if (el.scrollTop < 100 && !loadingMore && hasMore) loadMore();
  }, [loadingMore, hasMore, loadMore]);

  useEffect(() => { if (isAtBottomRef.current) scrollToBottom('smooth'); }, [messages.length, scrollToBottom]);
  useEffect(() => { if (!loading) scrollToBottom('auto'); }, [loading, scrollToBottom]);

  /* ── Mark read ───────────────────────────────────────────────────────── */
  const markConversationRead = useCallback(() => {
    const msgs = messagesRef.current;
    if (!msgs.length) return;
    const myId   = user._id?.toString?.() ?? user._id;
    const lastId = msgs[msgs.length - 1]?._id;
    const convId = conversation.conversationId;
    directMessageAPI.markAsRead(convId).catch(() => {});
    emit('message:read', { conversationId: convId, readBy: myId, lastMessageId: lastId });
  }, [conversation.conversationId, user._id, emit]);

  useEffect(() => {
    if (!loading && messages.length > 0 && document.hasFocus()) markConversationRead();
  }, [loading, messages.length, conversation.conversationId]); // eslint-disable-line

  useEffect(() => {
    const onFocus = () => { if (!loading && messages.length > 0) markConversationRead(); };
    const onVis   = () => { if (document.visibilityState === 'visible') onFocus(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onVis); };
  }, [markConversationRead]);

  /* ── Socket listeners ────────────────────────────────────────────────── */
  useEffect(() => {
    if (!socket) return;
    const cid = conversation.conversationId;

    const onNewMsg = (message) => {
      if (message.conversationId !== cid) return;
      const msgId = message._id ? String(message._id) : null;
      const norm  = msgId ? { ...message, _id: msgId } : message;
      if (msgId) msgCacheRef.current[msgId] = norm;
      const rt   = norm.replyTo ? buildReplyTo(msgId, norm.replyTo) : null;
      const final = rt ? { ...norm, replyTo: rt } : norm;
      setMessages((prev) => {
        if (final.tempId) {
          const idx = prev.findIndex((m) => String(m._id) === String(final.tempId));
          if (idx >= 0) { const u = [...prev]; u[idx] = final; return u; }
        }
        if (prev.some((m) => String(m._id) === String(final._id))) return prev;
        if (final.clientMessageId && prev.some((m) => m.clientMessageId === final.clientMessageId)) return prev;
        return [...prev, final];
      });
      if (document.hasFocus()) {
        directMessageAPI.markAsRead(cid).catch(() => {});
        emit('message:read', { conversationId: cid, readBy: user._id?.toString?.() ?? user._id, lastMessageId: final._id });
      }
    };

    const onEdit = ({ messageId, content, editedAt, version }) => {
      setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, content, edited: true, editedAt, version } : m));
    };

    const onDelete = ({ messageId, deletedForEveryone }) => {
      if (deletedForEveryone) {
        setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, deletedForEveryone: true, content: '' } : m));
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== messageId));
      }
      // Keep multi-select in sync
      setSelectedMessages((prev) => prev.filter((m) => m._id !== messageId));
    };

    const onReact    = ({ messageId, reactions }) => setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, reactions } : m));
    const onDelivered = ({ messageId }) => setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, status: 'delivered', isDelivered: true } : m));

    const onRead = ({ conversationId: rCid, readBy }) => {
      if (rCid && rCid !== cid) return;
      const norm = (v) => (v?._id ?? v)?.toString?.() ?? String(v ?? '');
      const rId = norm(readBy), myId = norm(user._id);
      if (rId && rId === myId) return;
      setMessages((prev) => prev.map((m) => {
        if (m.status === 'read' && m.isRead) return m;
        if (norm(m.sender?._id ?? m.sender) !== myId) return m;
        return { ...m, status: 'read', isRead: true };
      }));
    };

    const onTyping        = ({ conversationId, userId }) => {
      if (conversationId === cid && userId !== user._id) {
        setTypingUsers((prev) => new Set(prev).add(userId));
        setPresenceLabel(`${conversation.user?.username} is typing...`);
      }
    };
    const onStoppedTyping = ({ conversationId, userId }) => {
      if (conversationId === cid) setTypingUsers((prev) => { const s = new Set(prev); s.delete(userId); return s; });
    };
    const onPresence = ({ userId, status, lastSeen: ls }) => { if (userId === conversation.user?._id && ls) setLastSeen(ls); };

    socket.on('new-direct-message',         onNewMsg);
    socket.on('message:edit',               onEdit);
    socket.on('message-edited-direct',      onEdit);
    socket.on('message:delete',             onDelete);
    socket.on('message-deleted-direct',     onDelete);
    socket.on('message:reaction',           onReact);
    socket.on('message-reaction-direct',    onReact);
    socket.on('message:delivered',          onDelivered);
    socket.on('message:read',               onRead);
    socket.on('batch-read-update-direct',   onRead);
    socket.on('user-typing-direct',         onTyping);
    socket.on('user-stopped-typing-direct', onStoppedTyping);
    socket.on('conversation:typing', ({ conversationId, userId, isTyping }) => {
      if (conversationId !== cid || userId === user._id) return;
      if (isTyping) onTyping({ conversationId, userId });
      else          onStoppedTyping({ conversationId, userId });
    });
    socket.on('presence-update-direct', onPresence);

    return () => {
      socket.off('new-direct-message', onNewMsg);
      socket.off('message:edit', onEdit); socket.off('message-edited-direct', onEdit);
      socket.off('message:delete', onDelete); socket.off('message-deleted-direct', onDelete);
      socket.off('message:reaction', onReact); socket.off('message-reaction-direct', onReact);
      socket.off('message:delivered', onDelivered);
      socket.off('message:read', onRead); socket.off('batch-read-update-direct', onRead);
      socket.off('user-typing-direct', onTyping); socket.off('user-stopped-typing-direct', onStoppedTyping);
      socket.off('conversation:typing');
      socket.off('presence-update-direct', onPresence);
      emit('conversation:leave', { conversationId: cid });
    };
  }, [socket, conversation.conversationId, user._id, emit, buildReplyTo]);

  /* ── More menu outside click ─────────────────────────────────────────── */
  useEffect(() => {
    const h = (e) => { if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false); };
    if (moreMenuOpen) document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [moreMenuOpen]);

  /* ═══════════════════════════════════════════════════════════════════════
     MULTI-SELECT LOGIC
  ═══════════════════════════════════════════════════════════════════════ */

  /** A message is selectable if it's confirmed and not deleted for everyone */
  const isSelectable = useCallback((msg) => !msg._optimistic && !msg.deletedForEveryone, []);

  const exitMultiSelect = useCallback(() => {
    setMultiSelectMode(false);
    setSelectedMessages([]);
    lastSelectedIndexRef.current = -1;
  }, []);

  /** Enter multi-select mode with first message pre-selected */
  const enterMultiSelect = useCallback((msg) => {
    if (!isSelectable(msg)) return;
    setMultiSelectMode(true);
    setSelectedMessages([msg]);
    const idx = messagesRef.current.findIndex((m) => m._id === msg._id);
    lastSelectedIndexRef.current = idx;
    try { navigator.vibrate?.(50); } catch (_) {}
  }, [isSelectable]);

  /** Toggle one message, track index for Shift+click */
  const toggleMessageSelect = useCallback((msg, msgIndex) => {
    if (!isSelectable(msg)) return;
    setSelectedMessages((prev) => {
      const exists = prev.some((m) => m._id === msg._id);
      if (!exists) lastSelectedIndexRef.current = msgIndex ?? messagesRef.current.findIndex((m) => m._id === msg._id);
      return exists ? prev.filter((m) => m._id !== msg._id) : [...prev, msg];
    });
  }, [isSelectable]);

  /** Shift+click: select/add a contiguous range of messages */
  const rangeSelectTo = useCallback((targetMsg, targetIndex) => {
    const msgs = messagesRef.current;
    const from = lastSelectedIndexRef.current;
    if (from < 0 || targetIndex < 0) { toggleMessageSelect(targetMsg, targetIndex); return; }
    const lo    = Math.min(from, targetIndex);
    const hi    = Math.max(from, targetIndex);
    const range = msgs.slice(lo, hi + 1).filter(isSelectable);
    setSelectedMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m._id));
      const merged = [...prev];
      range.forEach((m) => { if (!existingIds.has(m._id)) merged.push(m); });
      return merged;
    });
    lastSelectedIndexRef.current = targetIndex;
  }, [toggleMessageSelect, isSelectable]);

  /** Select all / deselect all */
  const handleSelectAll = useCallback(() => {
    const selectable = messagesRef.current.filter(isSelectable);
    if (selectedMessages.length === selectable.length) {
      setSelectedMessages([]);
    } else {
      setSelectedMessages([...selectable]);
    }
  }, [selectedMessages.length, isSelectable]);

  const isMessageSelected = useCallback((msgId) => selectedMessages.some((m) => m._id === msgId), [selectedMessages]);

  /* ── Long-press (mobile) ─────────────────────────────────────────────── */
  // Returns stable handler (new function only when multiSelectMode changes)
  const makeTouchStart = useCallback((msg) => () => {
    touchMovedRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      if (touchMovedRef.current) return;
      if (multiSelectMode) {
        toggleMessageSelect(msg, messagesRef.current.findIndex((m) => m._id === msg._id));
      } else {
        enterMultiSelect(msg);
      }
    }, 550);
  }, [multiSelectMode, toggleMessageSelect, enterMultiSelect]);

  const handleTouchMove   = useCallback(() => {
    touchMovedRef.current = true;
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);
  const handleTouchEnd    = useCallback(() => {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
  }, []);
  useEffect(() => () => { if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current); }, []);

  /* ── Click on message row (Ctrl/Cmd or plain click in select mode) ───── */
  const handleMessageRowClick = useCallback((e, msg, msgIdx) => {
    // Ctrl/Cmd+Click: toggle whether in normal or select mode
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault(); e.stopPropagation();
      if (!multiSelectMode) enterMultiSelect(msg);
      else toggleMessageSelect(msg, msgIdx);
      return;
    }
    // In select mode, plain click toggles (or Shift+click does range)
    if (multiSelectMode) {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey && lastSelectedIndexRef.current >= 0) rangeSelectTo(msg, msgIdx);
      else toggleMessageSelect(msg, msgIdx);
    }
  }, [multiSelectMode, enterMultiSelect, toggleMessageSelect, rangeSelectTo]);

  /* ── Context menu ────────────────────────────────────────────────────── */
  const handleContextMenu = useCallback((e, message) => {
    e.preventDefault();
    if (multiSelectMode) {
      // Right-click also toggles in select mode
      toggleMessageSelect(message, messagesRef.current.findIndex((m) => m._id === message._id));
      return;
    }
    setContextMenu({ x: e.clientX, y: e.clientY, message });
  }, [multiSelectMode, toggleMessageSelect]);

  /* ═══════════════════════════════════════════════════════════════════════
     BATCH DELETE
  ═══════════════════════════════════════════════════════════════════════ */

  /** Can only offer "Delete for everyone" if EVERY selected msg is own */
  const canBatchDeleteEveryone = useMemo(() => {
    if (!selectedMessages.length) return false;
    const myId = user._id?.toString?.();
    return selectedMessages.every((m) => (m.sender?._id ?? m.sender)?.toString?.() === myId);
  }, [selectedMessages, user._id]);

  const handleBatchDeleteForMe = useCallback(async () => {
    const ids = selectedMessages.map((m) => m._id);
    exitMultiSelect();
    setMessages((prev) => prev.filter((m) => !ids.includes(m._id)));
    const results = await Promise.allSettled(ids.map((id) => directMessageAPI.deleteMessage(id, false)));
    const failed  = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) toast.error(`${failed} message(s) failed to delete`);
    else toast.success(`${ids.length} message${ids.length > 1 ? 's' : ''} deleted`);
  }, [selectedMessages, exitMultiSelect]);

  const handleBatchDeleteForEveryone = useCallback(async () => {
    const ids = selectedMessages.map((m) => m._id);
    exitMultiSelect();
    setMessages((prev) => prev.map((m) => ids.includes(m._id) ? { ...m, deletedForEveryone: true, content: '' } : m));
    ids.forEach((id) => emit('message:delete', { messageId: id, everyone: true }));
    const results = await Promise.allSettled(ids.map((id) => directMessageAPI.deleteMessage(id, true)));
    const failed  = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) toast.error(`${failed} message(s) failed to delete`);
    else toast.success(`${ids.length} message${ids.length > 1 ? 's' : ''} deleted for everyone`);
  }, [selectedMessages, exitMultiSelect, emit]);

  /* ── Single-message actions ──────────────────────────────────────────── */
  const handleSendMessage = async (content, type = 'text', rawFiles = [], metadata = {}) => {
    if (!content.trim() && rawFiles.length === 0) return;
    const previewAttachments = rawFiles.map((f) => ({ url: URL.createObjectURL(f), name: f.name, size: f.size, mimeType: f.type, _preview: true }));
    const tempId = `temp_${Date.now()}_${Math.random()}`;
    const clientMessageId = `${user._id}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const optimisticMsg = {
      _id: tempId, conversationId: conversation.conversationId,
      sender: { _id: user._id, username: user.username, avatar: user.avatar },
      receiver: conversation.user, content: content.trim(), type, attachments: previewAttachments,
      status: 'sending', isRead: false, isDelivered: false, reactions: [],
      replyTo: replyTo ? {
        messageId: replyTo._id, content: replyTo.content, senderId: replyTo.sender?._id,
        senderUsername: replyTo.sender?.username || replyTo.senderUsername,
        type: replyTo.type, attachments: replyTo.attachments || [],
      } : null,
      createdAt: new Date().toISOString(), _optimistic: true,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setReplyTo(null); setEditingMessage(null); scrollToBottom();
    setSending(true);
    try {
      if (editingMessage) {
        const res = await directMessageAPI.editMessage(editingMessage._id, content);
        if (res.data.success) {
          setMessages((prev) => prev.map((m) => m._id === editingMessage._id ? { ...m, content, edited: true, editedAt: new Date() } : m));
          setMessages((prev) => prev.filter((m) => m._id !== tempId));
          emit('message:edit', { messageId: editingMessage._id, content, conversationId: conversation.conversationId });
        }
      } else {
        let res;
        if (rawFiles.length > 0) {
          const fd = new FormData();
          fd.append('receiverId', conversation.user._id);
          fd.append('content', content.trim());
          fd.append('type', rawFiles.some((f) => f.type.startsWith('audio/')) ? 'audio' : rawFiles.some((f) => f.type.startsWith('image/')) ? 'image' : rawFiles.some((f) => f.type.startsWith('video/')) ? 'video' : 'file');
          fd.append('clientMessageId', clientMessageId);
          if (Object.keys(metadata).length) fd.append('metadata', JSON.stringify(metadata));
          if (optimisticMsg.replyTo) fd.append('replyTo', JSON.stringify({ messageId: optimisticMsg.replyTo.messageId }));
          rawFiles.forEach((file) => fd.append('files', file));
          res = await api.post('/direct-messages/send', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
          optimisticMsg.attachments?.forEach((a) => { if (a._preview && a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url); });
        } else {
          res = await directMessageAPI.sendMessage({
            receiverId: conversation.user._id, content: content.trim(), type, attachments: [],
            replyTo: optimisticMsg.replyTo ? { messageId: optimisticMsg.replyTo.messageId } : undefined,
            clientMessageId, tempId,
          });
        }
        if (res.data.success) {
          const serverMsg = res.data.message;
          if (serverMsg._id) msgCacheRef.current[String(serverMsg._id)] = serverMsg;
          const rrt        = buildReplyTo(String(serverMsg._id), serverMsg.replyTo, optimisticMsg.replyTo);
          const confirmed  = { ...serverMsg, _optimistic: false, replyTo: rrt };
          if (confirmed._id) msgCacheRef.current[String(confirmed._id)] = confirmed;
          const SR = { sending: 0, sent: 1, delivered: 2, read: 3 };
          setMessages((prev) => prev.map((m) => {
            if (m._id !== tempId) return m;
            if ((SR[m.status] ?? 1) > (SR[confirmed.status] ?? 1))
              return { ...confirmed, status: m.status, isRead: m.isRead || confirmed.isRead, isDelivered: m.isDelivered || confirmed.isDelivered };
            return confirmed;
          }));
          emit('send-direct-message', { message: confirmed, receiverId: conversation.user._id });
        } else {
          setMessages((prev) => prev.map((m) => m._id === tempId ? { ...m, status: 'failed' } : m));
          toast.error('Failed to send message');
        }
      }
    } catch {
      setMessages((prev) => prev.map((m) => m._id === tempId ? { ...m, status: 'failed' } : m));
      toast.error('Failed to send message');
    } finally {
      setSending(false);
      emit('stopped-typing-direct', { conversationId: conversation.conversationId, userId: user._id });
    }
  };

  const handleTypingEvent = useCallback(() => {
    emit('typing-direct',       { conversationId: conversation.conversationId, userId: user._id });
    emit('conversation:typing', { conversationId: conversation.conversationId, isTyping: true, username: user.username });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emit('stopped-typing-direct', { conversationId: conversation.conversationId, userId: user._id });
      emit('conversation:typing', { conversationId: conversation.conversationId, isTyping: false });
    }, 3000);
  }, [emit, conversation.conversationId, user._id, user.username]);

  const handleReact = useCallback(async (messageId, emoji) => {
    const msg = messages.find((m) => m._id === messageId);
    if (!msg) return;
    const existing = msg.reactions?.find((r) => r.emoji === emoji);
    const already  = existing?.userIds?.some((id) => id === user._id || id?._id === user._id);
    if (already) { emit('message:reaction:remove', { messageId, emoji }); await directMessageAPI.removeReaction(messageId, emoji).catch(() => {}); }
    else          { emit('message:reaction:add', { messageId, emoji });    await directMessageAPI.reactToMessage(messageId, emoji).catch(() => {}); }
  }, [messages, user._id, emit]);

  const handleDeleteMessage = useCallback(async (messageId, everyone = false) => {
    emit('message:delete', { messageId, everyone });
    try {
      await directMessageAPI.deleteMessage(messageId, everyone);
      if (everyone) setMessages((prev) => prev.map((m) => m._id === messageId ? { ...m, deletedForEveryone: true, content: '' } : m));
      else          setMessages((prev) => prev.filter((m) => m._id !== messageId));
    } catch (_) { toast.error('Failed to delete message'); }
  }, [emit]);

  const openDeleteModal  = useCallback((messageId, isOwn) => setDeleteModal({ messageId, isOwn }), []);
  const handleStarMessage = useCallback(async (messageId) => {
    try {
      const res = await directMessageAPI.starMessage(messageId);
      if (res.data.success) {
        setMessages((prev) => prev.map((m) => {
          if (m._id !== messageId) return m;
          const starredBy = res.data.starred
            ? [...(m.starredBy || []), user._id]
            : (m.starredBy || []).filter((id) => id !== user._id);
          return { ...m, starredBy };
        }));
      }
    } catch (_) {}
  }, [user._id]);

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) { setSearchResults([]); return; }
    try { const res = await directMessageAPI.searchMessages(q); if (res.data.success) setSearchResults(res.data.messages || []); }
    catch (_) {}
  }, []);

 const handleVideoCall = async () => {
  try {
    const roomId = Math.random().toString(36).substring(2, 15);
    await directMessageAPI.sendMessage({ receiverId: conversation.user._id,
      content: '📞 Video call invitation', type: 'video-call' });
    emit('video-call-invitation', { roomId, from: user, to: conversation.user });
    navigate(`/room/${roomId}`);
  } catch (_) { toast.error('Failed to start video call'); }
};

// ── NEW ──────────────────────────────────────────────────────────────
const handleAudioCall = async () => {
  try {
    await initiateCall(
      conversation.user._id,
      conversation.user.username,
      conversation.user.avatar,
    );
  } catch (err) {
    toast.error('Could not start audio call. Check microphone permissions.');
  }
};


  /* ── Conversation-level actions ──────────────────────────────────────── */
  const handlePinConversation = useCallback(async () => {
    const np = !isPinned; setIsPinned(np); onConversationUpdate?.(conversation.conversationId, { isPinned: np }); setMoreMenuOpen(false);
    try { await api.patch(`/direct-messages/conversations/${conversation.conversationId}/pin`, { pinned: np }); emit('conversation-pinned', { conversationId: conversation.conversationId, pinned: np }); toast.success(np ? 'Conversation pinned' : 'Conversation unpinned'); }
    catch (_) { setIsPinned(!np); onConversationUpdate?.(conversation.conversationId, { isPinned: !np }); toast.error('Failed to pin conversation'); }
  }, [isPinned, conversation.conversationId, onConversationUpdate, emit]);

  const handleMuteConversation = useCallback(async () => {
    const nm = !isMuted; setIsMuted(nm); onConversationUpdate?.(conversation.conversationId, { isMuted: nm }); setMoreMenuOpen(false);
    try { await api.patch(`/direct-messages/conversations/${conversation.conversationId}/mute`, { muted: nm }); toast.success(nm ? 'Conversation muted' : 'Conversation unmuted'); }
    catch (_) { setIsMuted(!nm); onConversationUpdate?.(conversation.conversationId, { isMuted: !nm }); toast.error('Failed to mute conversation'); }
  }, [isMuted, conversation.conversationId, onConversationUpdate]);

  const isArchived = conversation.isArchived || false;
  const handleArchiveConversation = useCallback(async () => {
    setMoreMenuOpen(false); const na = !isArchived;
    try { await api.patch(`/direct-messages/conversations/${conversation.conversationId}/archive`, { archived: na }); onConversationUpdate?.(conversation.conversationId, { isArchived: na }); toast.success(na ? 'Conversation archived' : 'Conversation unarchived'); if (na) onBack?.(); }
    catch (_) { toast.error(na ? 'Failed to archive' : 'Failed to unarchive'); }
  }, [isArchived, conversation.conversationId, onConversationUpdate, onBack]);

  const handleClearChat = useCallback(() => {
    setMoreMenuOpen(false);
    setConfirmModal({
      title: 'Clear Chat', message: 'This will delete all messages for you. This cannot be undone.',
      confirmLabel: 'Clear Chat', confirmDanger: true,
      onConfirm: async () => {
        try { await directMessageAPI.deleteConversation(conversation.conversationId); setMessages([]); onConversationUpdate?.(conversation.conversationId, { lastMessage: null, unreadCount: 0 }); toast.success('Chat cleared'); }
        catch (_) { toast.error('Failed to clear chat'); }
      },
    });
  }, [conversation.conversationId, onConversationUpdate]);

  /* ── Grouped messages ────────────────────────────────────────────────── */
  const groupedMessages = useMemo(() => {
    const groups = []; let lastDate = null;
    for (const msg of messages) {
      const dk = new Date(msg.createdAt).toDateString();
      if (dk !== lastDate) { groups.push({ type: 'date', key: `date-${dk}`, date: msg.createdAt }); lastDate = dk; }
      groups.push({ type: 'message', key: msg._id, message: msg });
    }
    return groups;
  }, [messages]);

  const onlineUsersSet = useMemo(() => {
    const s = new Set();
    if (isOnline && conversation.user?._id) s.add(String(conversation.user._id));
    return s;
  }, [isOnline, conversation.user?._id]);

  /* Derived counts */
  const totalSelectable = useMemo(() => messages.filter(isSelectable).length, [messages, isSelectable]);
  const allSelected     = totalSelectable > 0 && selectedMessages.length === totalSelectable;

  /* ════════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════════ */
  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onClick={() => { if (contextMenu) setContextMenu(null); }}
    >
      {/* ═══════════════════════════════════════════════════════════
          HEADER — switches between normal and multi-select variant
      ═══════════════════════════════════════════════════════════ */}
      <div className={`px-4 py-3 border-b flex items-center justify-between shrink-0 sticky top-0 z-20 transition-colors duration-200 ${multiSelectMode ? 'bg-blue-600 border-blue-700' : 'bg-white border-slate-200'}`}>

        {multiSelectMode ? (
          /* ── Multi-select header ─────────────────────────────── */
          <>
            <div className="flex items-center gap-3">
              <button
                onClick={exitMultiSelect}
                title="Cancel selection (Esc)"
                className="w-8 h-8 rounded-full hover:bg-blue-500 flex items-center justify-center text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
              <div>
                <p className="text-white font-bold text-sm leading-tight">{selectedMessages.length} selected</p>
                <p className="text-blue-200 text-xs leading-tight">
                  of {totalSelectable} · Shift+click for range
                </p>
              </div>
            </div>
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 text-white text-xs font-bold transition-colors"
            >
              {allSelected ? <><CheckSquare className="w-3.5 h-3.5" /> Deselect All</> : <><Square className="w-3.5 h-3.5" /> Select All</>}
            </button>
          </>
        ) : (
          /* ── Normal header ───────────────────────────────────── */
          <>
            <div className="flex items-center gap-3">
              <button onClick={onBack} className="md:hidden w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="relative">
                {conversation.user?.avatar
                  ? <img src={conversation.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  : <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold">{conversation.user?.username?.[0]?.toUpperCase()}</div>
                }
                {isOnline && <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
              </div>
              <div>
                <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-1.5">
                  {conversation.user?.username}
                  {isPinned && <Pin className="w-3 h-3 text-primary-500" />}
                </h3>
                <p className={`text-xs ${typingUsers.size > 0 ? 'text-primary-600 font-medium' : 'text-slate-500'}`}>
                  {typingUsers.size > 0 ? `${conversation.user?.username} is typing...`
                    : isOnline ? 'Online'
                    : lastSeen ? `Last seen ${formatDistanceToNow(new Date(lastSeen), { addSuffix: true })}`
                    : 'Offline'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setShowSearch((s) => !s); setSearchQuery(''); setSearchResults([]); }} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600">
                <Search className="w-4 h-4" />
              </button>
              <button onClick={handleVideoCall} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600">
                <Video className="w-5 h-5" />
              </button>
                            <button                                                
                onClick={handleAudioCall}                            
                 title="Start audio call"                             
                 className="w-9 h-9 rounded-full hover:bg-slate-100  
                    flex items-center justify-center          
                            text-slate-600"                           
               >                                                      
                <Phone className="w-[18px] h-[18px]" />              
               </button>   
              <div className="relative" ref={moreMenuRef}>
                <button onClick={() => setMoreMenuOpen((s) => !s)} className="w-9 h-9 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-600">
                  <MoreVertical className="w-5 h-5" />
                </button>
                {moreMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50" style={{ animation: 'fadeSlideDown 0.12s ease' }}>
                    <button onClick={handlePinConversation}     className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 text-slate-700 hover:bg-slate-50"><Pin     className="w-4 h-4" /> {isPinned  ? 'Unpin Conversation' : 'Pin Conversation'}</button>
                    <button onClick={handleMuteConversation}    className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 text-slate-700 hover:bg-slate-50"><BellOff  className="w-4 h-4" /> {isMuted   ? 'Unmute' : 'Mute'}</button>
                    <button onClick={handleArchiveConversation} className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 text-slate-700 hover:bg-slate-50"><Archive  className="w-4 h-4" /> {isArchived ? 'Unarchive' : 'Archive'}</button>
                    <div className="my-1 border-t border-slate-100" />
                    <button onClick={handleClearChat}           className="w-full px-4 py-2.5 text-left text-sm flex items-center gap-2 text-red-500 hover:bg-red-50"><Trash2   className="w-4 h-4" /> Clear Chat</button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Search bar ──────────────────────────────────────────────────── */}
      {showSearch && !multiSelectMode && (
        <div className="px-4 py-2 bg-white border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input autoFocus type="text" value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); handleSearch(e.target.value); }}
              placeholder="Search messages..."
              className="w-full pl-9 pr-9 py-1.5 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-200"
            />
            {searchQuery && <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"><X className="w-4 h-4" /></button>}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {searchResults.map((m) => (
                <button key={m._id}
                  onClick={() => {
                    const el = document.getElementById(`msg-${m._id}`);
                    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el?.classList.add('ring-2', 'ring-primary-400');
                    setTimeout(() => el?.classList.remove('ring-2', 'ring-primary-400'), 2000);
                    setShowSearch(false);
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 text-xs text-slate-700"
                >
                  <span className="font-semibold">{m.sender?.username}: </span>
                  <span className="text-slate-500">{m.content?.slice(0, 80)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Muted banner ────────────────────────────────────────────────── */}
      {isMuted && !multiSelectMode && (
        <div className="bg-amber-50 border-b border-amber-100 px-4 py-1.5 flex items-center gap-2 shrink-0">
          <BellOff className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-xs text-amber-600 font-medium">Notifications muted</span>
          <button onClick={handleMuteConversation} className="ml-auto text-xs text-amber-600 underline hover:text-amber-700">Unmute</button>
        </div>
      )}

      {/* ── Multi-select keyboard/gesture hint ──────────────────────────── */}
      {multiSelectMode && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-1.5 flex items-center gap-2 shrink-0 text-xs text-blue-600" style={{ animation: 'fadeSlideDown 0.15s ease' }}>
          <span>💡</span>
          <span><b>Ctrl+click</b> or <b>long-press</b> to toggle · <b>Shift+click</b> for range · <b>Esc</b> to cancel</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
          MESSAGES AREA
      ═══════════════════════════════════════════════════════════ */}
      <div
        ref={scrollAreaRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto bg-slate-50 relative"
        style={{ scrollBehavior: 'smooth' }}
      >
        {loading ? <MessageSkeleton /> : (
          <div className="px-4 py-2">
            {loadingMore && <div className="flex justify-center py-3"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>}
            {!hasMore && messages.length > 0 && (
              <div className="flex justify-center py-3">
                <span className="text-xs text-slate-400 bg-white px-3 py-1 rounded-full shadow-sm border border-slate-100">Beginning of conversation</span>
              </div>
            )}

            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-20 text-center">
                <div className="w-16 h-16 bg-primary-50 rounded-full flex items-center justify-center mb-3"><span className="text-2xl">💬</span></div>
                <p className="text-slate-500 text-sm font-medium">No messages yet</p>
                <p className="text-slate-400 text-xs mt-1">Send a message to start chatting</p>
              </div>
            ) : (
              groupedMessages.map((item) => {
                if (item.type === 'date') return <DateDivider key={item.key} date={item.date} />;

                const msg        = item.message;
                const msgIdx     = messagesRef.current.findIndex((m) => m._id === msg._id);
                const selected   = isMessageSelected(msg._id);
                const selectable = isSelectable(msg);

                return (
                  <div
                    id={`msg-${msg._id}`}
                    key={item.key}
                    ref={(el) => registerMessageRef(msg._id, el)}
                    /* Selection highlight */
                    className={`relative rounded-xl transition-all duration-150 ${multiSelectMode && selected ? 'bg-blue-50' : ''}`}
                    /* Ctrl/Cmd+Click or plain click in select mode */
                    onClick={(e) => handleMessageRowClick(e, msg, msgIdx)}
                    /* Right-click context menu */
                    onContextMenu={(e) => handleContextMenu(e, msg)}
                    /* Long-press (mobile) */
                    onTouchStart={makeTouchStart(msg)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    onTouchCancel={handleTouchEnd}
                  >
                    <div className={`flex items-center transition-all duration-150 ${multiSelectMode ? 'pl-0.5' : ''}`}>

                      {/* ── Checkbox ── */}
                      {multiSelectMode && (
                        selectable
                          ? <SelectionCheckbox
                              selected={selected}
                              onClick={(e) => {
                                if (e?.shiftKey && lastSelectedIndexRef.current >= 0) rangeSelectTo(msg, msgIdx);
                                else toggleMessageSelect(msg, msgIdx);
                              }}
                            />
                          : <div style={{ width: 28, flexShrink: 0 }} /> /* spacer for deleted msgs */
                      )}

                      {/* ── Message content ── */}
                      <div
                        className="flex-1 min-w-0"
                        /* In select mode, clicking the message body also toggles */
                        onClick={multiSelectMode && selectable ? (e) => {
                          e.stopPropagation();
                          if (e.shiftKey && lastSelectedIndexRef.current >= 0) rangeSelectTo(msg, msgIdx);
                          else toggleMessageSelect(msg, msgIdx);
                        } : undefined}
                        style={multiSelectMode ? { cursor: selectable ? 'pointer' : 'default' } : undefined}
                      >
                        <Message
                          message={msg}
                          isOwnMessage={(msg.sender?._id?.toString() ?? msg.sender?.toString()) === user._id?.toString()}
                          currentUserId={user._id}
                          /* Disable interactive handlers in select mode so reactions/swipe don't fire */
                          onReply={multiSelectMode           ? undefined : setReplyTo}
                          onEdit={multiSelectMode            ? undefined : (m) => { setEditingMessage(m); setReplyTo(null); }}
                          onDelete={multiSelectMode          ? undefined : (m) => { const isOwn = m?.sender?._id === user._id || m?.sender === user._id; openDeleteModal(m._id, isOwn); }}
                          onReact={multiSelectMode           ? undefined : handleReact}
                          onStar={multiSelectMode            ? undefined : handleStarMessage}
                          onForward={multiSelectMode         ? undefined : (m) => setForwardTarget(m)}
                          onReplyBubbleClick={multiSelectMode ? undefined : handleReplyBubbleClick}
                          prevMessage={messages[messages.indexOf(msg) - 1]}
                          onlineUsers={onlineUsersSet}
                          /* Dim non-selected messages when some are selected */
                          style={multiSelectMode && selectedMessages.length > 0 && !selected
                            ? { opacity: 0.5, transition: 'opacity 0.15s' }
                            : { opacity: 1,   transition: 'opacity 0.15s' }
                          }
                        />
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Typing indicator */}
            {typingUsers.size > 0 && !multiSelectMode && (
              <div className="flex items-center gap-2 mb-2 pl-2">
                <div className="bg-white rounded-2xl px-4 py-2 shadow-sm flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </div>

      {/* ── Scroll-to-bottom ────────────────────────────────────────────── */}
      {showScrollBtn && (
        <button onClick={() => scrollToBottom()} className="absolute bottom-20 right-4 w-10 h-10 bg-white rounded-full shadow-lg border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition-all z-20">
          <ChevronDown className="w-5 h-5 text-slate-600" />
        </button>
      )}

      {/* ── Context menu (only in normal mode) ──────────────────────────── */}
      {contextMenu && !multiSelectMode && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          message={contextMenu.message}
          isOwn={contextMenu.message?.sender?._id === user._id || contextMenu.message?.sender === user._id}
          onClose={() => setContextMenu(null)}
          onReply={() => setReplyTo(contextMenu.message)}
          onEdit={() => setEditingMessage(contextMenu.message)}
          onDelete={() => { const isOwn = contextMenu.message?.sender?._id === user._id || contextMenu.message?.sender === user._id; openDeleteModal(contextMenu.message._id, isOwn); }}
          onStar={() => handleStarMessage(contextMenu.message._id)}
          onForward={() => setForwardTarget(contextMenu.message)}
          onStartMultiSelect={() => enterMultiSelect(contextMenu.message)}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════
          BOTTOM BAR — multi-select toolbar OR normal MessageInput
      ═══════════════════════════════════════════════════════════ */}
      {multiSelectMode ? (
        <div className="shrink-0 border-t border-slate-100 bg-white z-10" style={{ animation: 'toolbarSlideUp 0.2s cubic-bezier(0.34,1.4,0.64,1) forwards' }}>
          {/* Info row */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              {selectedMessages.length === 0 ? 'Tap messages to select' : `${selectedMessages.length} message${selectedMessages.length > 1 ? 's' : ''} selected`}
            </span>
            <button onClick={exitMultiSelect} className="text-xs text-slate-400 font-semibold px-2 py-0.5 rounded hover:bg-slate-100 transition-colors">
              Cancel (Esc)
            </button>
          </div>

          {/* Action buttons */}
          <div className="px-4 pb-5 flex items-center gap-3">
            {/* ─ Delete ─ */}
            <button
              onClick={() => { if (selectedMessages.length > 0) setBatchDeleteModal(true); }}
              disabled={selectedMessages.length === 0}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all duration-150 select-none ${
                selectedMessages.length > 0
                  ? 'bg-red-50 text-red-600 hover:bg-red-100 active:scale-95'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
              }`}
            >
              <Trash className="w-4 h-4" />
              Delete
              {selectedMessages.length > 0 && (
                <span className="min-w-[1.25rem] h-5 flex items-center justify-center bg-red-500 text-white text-[10px] rounded-full px-1 font-black leading-none">
                  {selectedMessages.length}
                </span>
              )}
            </button>

            {/* ─ Forward ─ */}
            <button
              onClick={() => { if (selectedMessages.length > 0) setShowBatchForward(true); }}
              disabled={selectedMessages.length === 0}
              className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl text-sm font-bold transition-all duration-150 select-none ${
                selectedMessages.length > 0
                  ? 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-lg shadow-blue-200'
                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
              }`}
            >
              <ForwardSVG size={15} />
              Forward
              {selectedMessages.length > 0 && (
                <span className="min-w-[1.25rem] h-5 flex items-center justify-center bg-white/25 text-white text-[10px] rounded-full px-1 font-black leading-none">
                  {selectedMessages.length}
                </span>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 z-10">
          <MessageInput
            onSendMessage={handleSendMessage}
            onTyping={handleTypingEvent}
            disabled={sending}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            editingMessage={editingMessage}
            onCancelEdit={() => setEditingMessage(null)}
          />
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────────────── */}

      {/* Single-message forward */}
      {forwardTarget && (
        <ForwardModal message={forwardTarget} onClose={() => setForwardTarget(null)}
          onSuccess={(msgs) => {
            msgs.forEach((msg) => {
              if (msg.conversationId !== conversation.conversationId) return;
              const mid = String(msg._id);
              setMessages((prev) => prev.some((m) => String(m._id) === mid) ? prev : [...prev, { ...msg, _id: mid, forwarded: true }]);
            });
          }}
          onlineUsers={onlineUsersSet} currentUserId={user._id}
        />
      )}

      {/* Batch forward */}
      {showBatchForward && selectedMessages.length > 0 && (
        <ForwardModal messages={selectedMessages} onClose={() => { setShowBatchForward(false); exitMultiSelect(); }}
          onSuccess={(msgs) => {
            msgs.forEach((msg) => {
              if (msg.conversationId !== conversation.conversationId) return;
              const mid = String(msg._id);
              setMessages((prev) => prev.some((m) => String(m._id) === mid) ? prev : [...prev, { ...msg, _id: mid, forwarded: true }]);
            });
          }}
          onlineUsers={onlineUsersSet} currentUserId={user._id}
        />
      )}

      {/* Single-message delete */}
      <DeleteMessageModal
        isOpen={!!deleteModal} isOwn={deleteModal?.isOwn ?? false}
        onClose={() => setDeleteModal(null)}
        onDeleteAll={() => { if (deleteModal) handleDeleteMessage(deleteModal.messageId, true); setDeleteModal(null); }}
        onDeleteMe={() => { if (deleteModal) handleDeleteMessage(deleteModal.messageId, false); setDeleteModal(null); }}
      />

      {/* Batch delete */}
      <BatchDeleteModal
        isOpen={batchDeleteModal} count={selectedMessages.length}
        canDeleteEveryone={canBatchDeleteEveryone}
        onDeleteForMe={handleBatchDeleteForMe}
        onDeleteForEveryone={handleBatchDeleteForEveryone}
        onClose={() => setBatchDeleteModal(false)}
      />

      {/* Generic confirm */}
      <ConfirmModal
        isOpen={!!confirmModal} title={confirmModal?.title} message={confirmModal?.message}
        confirmLabel={confirmModal?.confirmLabel} confirmDanger={confirmModal?.confirmDanger}
        onConfirm={() => { confirmModal?.onConfirm?.(); setConfirmModal(null); }}
        onClose={() => setConfirmModal(null)}
      />

      {/* ── Animations ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes fadeSlideDown {
          from { opacity:0; transform:translateY(-6px) } to { opacity:1; transform:translateY(0) }
        }
        @keyframes toolbarSlideUp {
          from { opacity:0; transform:translateY(20px) } to { opacity:1; transform:translateY(0) }
        }
        @keyframes confirmModalIn {
          from { opacity:0; transform:scale(0.92) translateY(8px) } to { opacity:1; transform:scale(1) translateY(0) }
        }
        @keyframes batchDeleteIn {
          from { opacity:0; transform:scale(0.94) translateY(12px) } to { opacity:1; transform:scale(1) translateY(0) }
        }
        @keyframes replyHighlightFade {
          0%   { background-color:rgba(34,197,94,0.28); border-radius:12px }
          40%  { background-color:rgba(34,197,94,0.20); border-radius:12px }
          100% { background-color:transparent;          border-radius:12px }
        }
        .msg-reply-highlight {
          animation: replyHighlightFade 2.5s ease forwards;
          position: relative; z-index: 1;
        }
      `}</style>
    </div>
  );
};

export default ChatWindow;