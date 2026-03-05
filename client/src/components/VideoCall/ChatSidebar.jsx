import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Smile, MessageCircle, ChevronDown,
         Users, Mic, MicOff, Video, VideoOff, Monitor,
         MonitorOff, Hand, Circle, StopCircle, Wifi,
         WifiOff, UserPlus, UserMinus, Shield, UserX } from 'lucide-react';import { useAuth } from '../../context/AuthContext';

// ─── Event type config ────────────────────────────────────────────────────────
// Maps every room event to: icon, color, and a label builder fn
const EVENT_CONFIG = {
  'user-joined':          { icon: UserPlus,   color: 'text-emerald-500', bg: 'bg-emerald-50',   label: (d) => `${d.username} joined the room` },
  'user-left':            { icon: UserMinus,  color: 'text-slate-400',   bg: 'bg-slate-100',    label: (d) => `${d.username || 'Someone'} left the room` },
  'user-reconnected':     { icon: Wifi,       color: 'text-blue-500',    bg: 'bg-blue-50',      label: (d) => `${d.username} reconnected` },
  'reconnecting':         { icon: WifiOff,    color: 'text-yellow-500',  bg: 'bg-yellow-50',    label: () => 'Reconnecting to server…' },
  'connected':            { icon: Wifi,       color: 'text-emerald-500', bg: 'bg-emerald-50',   label: () => 'Reconnected to server' },
  'muted':                { icon: MicOff,     color: 'text-orange-500',  bg: 'bg-orange-50',    label: (d) => `${d.username} muted their mic` },
  'unmuted':              { icon: Mic,        color: 'text-emerald-500', bg: 'bg-emerald-50',   label: (d) => `${d.username} unmuted their mic` },
  'camera-off':           { icon: VideoOff,   color: 'text-orange-500',  bg: 'bg-orange-50',    label: (d) => `${d.username} turned off their camera` },
  'camera-on':            { icon: Video,      color: 'text-emerald-500', bg: 'bg-emerald-50',   label: (d) => `${d.username} turned on their camera` },
  'screen-share-start':   { icon: Monitor,    color: 'text-blue-500',    bg: 'bg-blue-50',      label: (d) => `${d.username} started screen sharing` },
  'screen-share-stop':    { icon: MonitorOff, color: 'text-slate-400',   bg: 'bg-slate-100',    label: (d) => `${d.username || 'Screen sharing'} stopped` },
  'hand-raised':          { icon: Hand,       color: 'text-yellow-500',  bg: 'bg-yellow-50',    label: (d) => `${d.username} raised their hand ✋` },
  'hand-lowered':         { icon: Hand,       color: 'text-slate-400',   bg: 'bg-slate-100',    label: (d) => `${d.username} lowered their hand` },
  'recording-start':      { icon: Circle,     color: 'text-red-500',     bg: 'bg-red-50',       label: () => 'Recording started 🔴' },
  'recording-stop':       { icon: StopCircle, color: 'text-slate-500',   bg: 'bg-slate-100',    label: () => 'Recording stopped' },
  'muted-by-host':        { icon: MicOff,     color: 'text-red-500',     bg: 'bg-red-50',       label: (d) => `${d.username || 'You'} were muted by the host` },
  'participant-removed':  { icon: UserX,      color: 'text-red-500',     bg: 'bg-red-50',       label: (d) => `${d.username} was removed from the meeting` },
  'host-changed':         { icon: Shield,     color: 'text-purple-500',  bg: 'bg-purple-50',    label: (d) => `${d.username} is now the host` },
  'reaction':             { icon: Smile,      color: 'text-yellow-500',  bg: 'bg-yellow-50',    label: (d) => `${d.username} reacted ${d.emoji}` },
};

// ─── Emoji picker grid ────────────────────────────────────────────────────────
const EMOJI_GRID = [
  ['😀','😂','😍','🥰','😎','🤔','😅','😭'],
  ['👍','👎','👏','🙌','🤝','✌️','🤞','💪'],
  ['❤️','🧡','💛','💚','💙','💜','🖤','🤍'],
  ['🎉','🎊','🔥','⭐','✨','💫','🎯','🚀'],
  ['😱','🤯','🥳','🤩','😴','🤮','🥺','😤'],
  ['🍕','🍔','☕','🎵','🎮','⚽','🏆','💎'],
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const avatarHue = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
};

const formatTime = (ts) =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatDay = (ts) => {
  const d   = new Date(ts).setHours(0, 0, 0, 0);
  const now = new Date().setHours(0, 0, 0, 0);
  if (now - d === 0)        return 'Today';
  if (now - d === 86400000) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const DateSeparator = memo(({ label }) => (
  <div className="flex items-center gap-2 my-3 px-3">
    <div className="flex-1 h-px bg-slate-200" />
    <span className="text-[10px] text-slate-400 font-medium tracking-wide uppercase shrink-0 select-none">
      {label}
    </span>
    <div className="flex-1 h-px bg-slate-200" />
  </div>
));
DateSeparator.displayName = 'DateSeparator';

// ── Event / system message bubble ────────────────────────────────────────────
const EventBubble = memo(({ item }) => {
  const cfg = EVENT_CONFIG[item.eventType] ?? {
    icon: MessageCircle, color: 'text-slate-400', bg: 'bg-slate-100', label: () => item.label,
  };
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 mx-3 my-1 px-3 py-1.5
                 bg-slate-50 border border-slate-100 rounded-xl"
    >
      <div className={`w-5 h-5 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-2.5 h-2.5 ${cfg.color}`} />
      </div>
      <span className="text-[11px] text-slate-500 flex-1 leading-snug">
        {cfg.label(item.data ?? {})}
      </span>
      <span className="text-[9px] text-slate-300 shrink-0 select-none">
        {formatTime(item.ts)}
      </span>
    </motion.div>
  );
});
EventBubble.displayName = 'EventBubble';

// ── Chat message bubble ───────────────────────────────────────────────────────
const MessageBubble = memo(({ msg, isMine, showAvatar, showName, isLastInGroup }) => {
  const name = msg.senderUsername || msg.username || 'User';
  const text = msg.content || msg.message || msg.text || '';
  const time = formatTime(msg.createdAt || msg.timestamp);
  const hue  = avatarHue(name);

  return (
    <div className={`flex gap-2 px-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}
                    ${isLastInGroup ? 'mb-3' : 'mb-0.5'}`}>
      <div className="w-7 flex-shrink-0 flex flex-col justify-end">
        {!isMine && showAvatar && (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="w-7 h-7 rounded-full flex items-center justify-center
                       text-white text-[11px] font-bold ring-2 ring-white"
            style={{ background: `hsl(${hue},55%,42%)` }}
          >
            {name.charAt(0).toUpperCase()}
          </motion.div>
        )}
      </div>
      <div className={`flex flex-col gap-0.5 max-w-[76%] min-w-0
                      ${isMine ? 'items-end' : 'items-start'}`}>
        {!isMine && showName && (
          <span className="text-[10px] font-semibold px-1 select-none"
            style={{ color: `hsl(${hue},55%,38%)` }}>
            {name}
          </span>
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 4 }}
          animate={{ opacity: 1, scale: 1,    y: 0 }}
          transition={{ duration: 0.16 }}
          className={`
            px-3.5 py-2.5 text-sm leading-relaxed break-words
            ${isMine
              ? 'bg-primary-600 text-white rounded-2xl rounded-br-[5px] shadow-sm'
              : 'bg-slate-100 text-slate-900 rounded-2xl rounded-bl-[5px]'}
          `}
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
        >
          {text}
        </motion.div>
        {isLastInGroup && (
          <span className="text-[9px] text-slate-400 px-1 select-none">{time}</span>
        )}
      </div>
    </div>
  );
});
MessageBubble.displayName = 'MessageBubble';

// ── Typing indicator ──────────────────────────────────────────────────────────
const TypingIndicator = memo(({ name }) => (
  <motion.div
    initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: 4 }}
    className="flex items-center gap-2 px-4 py-2"
  >
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-white
                    text-[10px] font-bold flex-shrink-0"
      style={{ background: `hsl(${avatarHue(name)},55%,45%)` }}>
      {name.charAt(0).toUpperCase()}
    </div>
    <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-3 py-2 flex gap-1 items-center">
      {[0, 0.15, 0.3].map((d, i) => (
        <motion.div key={i}
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, delay: d, repeat: Infinity }}
          className="w-1.5 h-1.5 bg-slate-400 rounded-full"
        />
      ))}
    </div>
    <span className="text-[10px] text-slate-400 italic">{name} is typing…</span>
  </motion.div>
));
TypingIndicator.displayName = 'TypingIndicator';

// ── Emoji picker ──────────────────────────────────────────────────────────────
const EmojiPicker = memo(({ onSelect, onClose }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.96 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 8, scale: 0.96 }}
    transition={{ duration: 0.15 }}
    className="absolute bottom-full left-3 right-3 mb-2 z-50
               bg-white border border-slate-200 rounded-2xl p-3
               shadow-xl shadow-slate-200/80"
  >
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Emoji</span>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
    {EMOJI_GRID.map((row, ri) => (
      <div key={ri} className="flex gap-0.5 mb-0.5">
        {row.map(emoji => (
          <button key={emoji} onClick={() => onSelect(emoji)}
            className="flex-1 text-lg py-1 rounded-lg hover:bg-slate-100
                       active:scale-90 transition-all duration-100 text-center">
            {emoji}
          </button>
        ))}
      </div>
    ))}
  </motion.div>
));
EmojiPicker.displayName = 'EmojiPicker';

// ── Scroll to bottom btn ──────────────────────────────────────────────────────
const ScrollToBottomBtn = memo(({ onClick, count }) => (
  <motion.button
    initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.8 }}
    onClick={onClick}
    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20
               bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium
               px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 transition-colors"
  >
    {count > 0 && (
      <span className="bg-white text-primary-600 text-[9px] font-bold
                       w-4 h-4 rounded-full flex items-center justify-center">
        {count > 9 ? '9+' : count}
      </span>
    )}
    <ChevronDown className="w-3.5 h-3.5" />
    {count > 0 ? 'New messages' : 'Scroll down'}
  </motion.button>
));
ScrollToBottomBtn.displayName = 'ScrollToBottomBtn';

// ─────────────────────────────────────────────────────────────────────────────
// ChatSidebar — main export
//
// Props:
//   roomId      : string
//   socket      : Socket.IO instance
//   isOpen      : boolean
//   onClose     : fn
//   roomEvents  : Array<{ id, eventType, data, ts }>  ← injected by VideoRoom
// ─────────────────────────────────────────────────────────────────────────────
const ChatSidebar = ({ roomId, socket, isOpen, onClose, roomEvents = [], onUnread }) => {
  const { user } = useAuth();

  const [messages,    setMessages]    = useState([]);
  const [newMessage,  setNewMessage]  = useState('');
  const [isTyping,    setIsTyping]    = useState(false);
  const [showEmoji,   setShowEmoji]   = useState(false);
  const [unread,      setUnread]      = useState(0);
  const [atBottom,    setAtBottom]    = useState(true);
  const [newMsgCount, setNewMsgCount] = useState(0);

  const scrollRef    = useRef(null);
  const bottomRef    = useRef(null);
  const inputRef     = useRef(null);
  const typingTimer  = useRef(null);
  const atBottomRef  = useRef(true);
  const isOpenRef    = useRef(isOpen);
  const unreadRef    = useRef(0);

  useEffect(() => { atBottomRef.current = atBottom; }, [atBottom]);
  useEffect(() => { isOpenRef.current   = isOpen;   }, [isOpen]);

  // Keep unreadRef in sync and notify parent
  const addUnread = useCallback(() => {
    unreadRef.current += 1;
    setUnread(unreadRef.current);
    onUnread?.(unreadRef.current);
  }, [onUnread]);

  // Reset unread (called on open)
  const clearUnread = useCallback(() => {
    unreadRef.current = 0;
    setUnread(0);
    onUnread?.(0);
  }, [onUnread]);

  // ── Reset / focus when panel opens ────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      clearUnread();
      setNewMsgCount(0);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 60);
      setTimeout(() => inputRef.current?.focus(), 250);
    }
  }, [isOpen, clearUnread]);

  // ── Socket: chat messages + history + typing ───────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onMsg = (msg) => {
      setMessages(prev => {
        if (msg._id && prev.some(m => m._id === msg._id)) return prev;
        return [...prev, msg];
      });
      if (!isOpenRef.current) {
        addUnread();
      } else if (!atBottomRef.current) {
        setNewMsgCount(n => n + 1);
      }
    };

    const onHistory = (data) => {
      const msgs = Array.isArray(data) ? data : (data?.messages ?? []);
      setMessages(msgs);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 60);
    };

    const onTyping     = ({ username }) => setIsTyping(username);
    const onStopTyping = ()             => setIsTyping(false);

    socket.on('receive-message', onMsg);
    socket.on('chat-message',    onMsg);
    socket.on('chat-history',    onHistory);
    socket.on('user-typing',     onTyping);
    socket.on('user-stop-typing', onStopTyping);

    return () => {
      socket.off('receive-message',  onMsg);
      socket.off('chat-message',     onMsg);
      socket.off('chat-history',     onHistory);
      socket.off('user-typing',      onTyping);
      socket.off('user-stop-typing', onStopTyping);
    };
  }, [socket]);

  // ── Auto-scroll on new content ─────────────────────────────────────────
  useEffect(() => {
    if (atBottom && isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, roomEvents]); // eslint-disable-line

  // ── Scroll tracking ────────────────────────────────────────────────────
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setAtBottom(bottom);
    if (bottom) setNewMsgCount(0);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setAtBottom(true);
    setNewMsgCount(0);
  }, []);

  // ── Send message ────────────────────────────────────────────────────────
  const handleSend = useCallback((e) => {
    e?.preventDefault();
    const trimmed = newMessage.trim();
    if (!trimmed || !socket) return;

    const payload = {
      roomId,
      message:   trimmed,
      text:      trimmed,
      userId:    user._id,
      username:  user.username,
      timestamp: Date.now(),
    };

    // Emit both event names for max server compatibility
    socket.emit('send-message',  { ...payload, content: trimmed });
    socket.emit('chat-message',  payload);

    setNewMessage('');
    setShowEmoji(false);
    clearTimeout(typingTimer.current);
    socket.emit('stop-typing', { roomId });
    setTimeout(scrollToBottom, 50);
  }, [newMessage, socket, roomId, user, scrollToBottom]);

  const handleTyping = useCallback((e) => {
    setNewMessage(e.target.value);
    if (!socket) return;
    socket.emit('typing', { roomId, username: user.username });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socket.emit('stop-typing', { roomId }), 1500);
  }, [socket, roomId, user]);

  const onKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const insertEmoji = useCallback((emoji) => {
    setNewMessage(p => p + emoji);
    inputRef.current?.focus();
  }, []);

  // ── Merge chat messages + room events into one sorted feed ─────────────
  const feedItems = useMemo(() => {
    // Normalise messages
    // Always produce a numeric ms timestamp — handles ISO strings, Date objects, and numbers
    const toMs = (v) => {
      if (!v) return 0;
      if (typeof v === 'number') return v;
      const n = Date.parse(v); // works for ISO strings, returns NaN if invalid
      return Number.isNaN(n) ? 0 : n;
    };

    const msgItems = messages.map((m, i) => ({
      kind: 'message',
      ts:   toMs(m.createdAt) || toMs(m.timestamp) || 0,
      key:  m._id || `msg-${i}`,
      msg:  m,
    }));

    // Normalise events (ts already numeric from Date.now())
    const evtItems = roomEvents.map(e => ({
      kind:      'event',
      ts:        toMs(e.ts),
      key:       e.id,
      eventType: e.eventType,
      data:      e.data,
      label:     e.label,
    }));

    // Merge and sort chronologically — guaranteed numeric now so subtraction is safe
    const all = [...msgItems, ...evtItems].sort((a, b) => a.ts - b.ts);

    // Insert date separators + group consecutive messages from same sender
    const result = [];
    let lastDay    = null;
    let lastSender = null;
    let lastTs     = 0;

    for (let i = 0; i < all.length; i++) {
      const item = all[i];
      const day  = formatDay(item.ts);

      if (day !== lastDay) {
        result.push({ kind: 'date', key: `date-${day}-${i}`, label: day, ts: item.ts });
        lastDay    = day;
        lastSender = null;
        lastTs     = 0;
      }

      if (item.kind === 'event') {
        result.push(item);
        lastSender = null; // break message grouping across events
        continue;
      }

      // message grouping
      const { msg } = item;
      const senderId = msg.sender || msg.userId;
      const isMine   = senderId === user._id;
      const grouped  = senderId === lastSender && (item.ts - lastTs) < 120_000;

      const next       = all[i + 1];
      const nextSender = next?.kind === 'message' ? (next.msg.sender || next.msg.userId) : null;
      const nextTs     = next?.ts ?? Infinity;
      const isLastInGroup = nextSender !== senderId || (nextTs - item.ts) >= 120_000 || next?.kind === 'event';

      result.push({
        ...item, isMine,
        showAvatar:    !isMine && isLastInGroup,
        showName:      !isMine && !grouped,
        isLastInGroup,
      });

      lastSender = senderId;
      lastTs     = item.ts;
    }

    return result;
  }, [messages, roomEvents, user._id]);

  // ─────────────────────────────────────────────────────────────────────────
  if (!isOpen) return null; // badge is rendered by VideoRoom on the chat icon itself

  return (
    <>
      {/* Mobile backdrop */}
      <div className="fixed inset-0 bg-black/40 z-40 sm:hidden" onClick={onClose} />

      <div className="
        fixed inset-0 z-50 flex flex-col bg-white
        sm:relative sm:inset-auto sm:z-auto
        sm:w-72 md:w-80 sm:h-full sm:border-l sm:border-slate-200
      ">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200
                        bg-white shadow-sm sm:shadow-none flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-50 border border-primary-100
                            flex items-center justify-center">
              <MessageCircle className="w-4 h-4 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 text-sm leading-tight">In-call Chat</h3>
              <p className="text-slate-400 text-[10px]">
                {messages.length} message{messages.length !== 1 ? 's' : ''} · {roomEvents.length} event{roomEvents.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-slate-100 active:bg-slate-200
                       flex items-center justify-center text-slate-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Feed ── */}
        <div className="relative flex-1 min-h-0">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-auto py-3"
            style={{ scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent' }}
          >
            {/* Empty state */}
            {feedItems.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200
                                flex items-center justify-center text-2xl">💬</div>
                <div>
                  <p className="text-slate-600 text-sm font-medium">No activity yet</p>
                  <p className="text-slate-400 text-xs mt-1">
                    Room events and messages will appear here
                  </p>
                </div>
              </div>
            )}

            {/* Feed items */}
            {feedItems.map(item => {
              if (item.kind === 'date')    return <DateSeparator key={item.key} label={item.label} />;
              if (item.kind === 'event')   return <EventBubble   key={item.key} item={item} />;
              if (item.kind === 'message') return (
                <MessageBubble
                  key={item.key}
                  msg={item.msg}
                  isMine={item.isMine}
                  showAvatar={item.showAvatar}
                  showName={item.showName}
                  isLastInGroup={item.isLastInGroup}
                />
              );
              return null;
            })}

            {/* Typing indicator */}
            <AnimatePresence>
              {isTyping && <TypingIndicator key="typing" name={isTyping} />}
            </AnimatePresence>

            <div ref={bottomRef} className="h-1" />
          </div>

          {/* Scroll to bottom */}
          <AnimatePresence>
            {!atBottom && <ScrollToBottomBtn onClick={scrollToBottom} count={newMsgCount} />}
          </AnimatePresence>
        </div>

        {/* ── Bottom: emoji picker + input ── */}
        <div className="flex-shrink-0 border-t border-slate-200 bg-white relative">
          <AnimatePresence>
            {showEmoji && (
              <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />
            )}
          </AnimatePresence>

          <div className="p-3 sm:p-4">
            <div className="flex items-end gap-2 bg-slate-50 border border-slate-200
                            rounded-2xl px-3 py-2 focus-within:border-primary-400
                            focus-within:ring-2 focus-within:ring-primary-100 transition-all">
              <button
                onClick={() => setShowEmoji(v => !v)}
                className={`flex-shrink-0 mb-0.5 transition-colors
                  ${showEmoji ? 'text-yellow-500' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <Smile className="w-5 h-5" />
              </button>
              <textarea
                ref={inputRef}
                value={newMessage}
                onChange={handleTyping}
                onKeyDown={onKeyDown}
                placeholder="Type a message..."
                rows={1}
                className="flex-1 bg-transparent text-slate-900 text-sm
                           placeholder-slate-400 resize-none outline-none
                           leading-snug max-h-24 overflow-y-auto"
                style={{ scrollbarWidth: 'none' }}
              />
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={handleSend}
                disabled={!newMessage.trim()}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
                           bg-primary-600 hover:bg-primary-500 active:bg-primary-700
                           disabled:opacity-40 disabled:cursor-not-allowed
                           transition-all shadow-sm"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </motion.button>
            </div>
            <p className="text-slate-400 text-[9px] text-center mt-1.5 select-none">
              Enter to send · Shift+Enter for new line
            </p>
          </div>
          <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </div>
      </div>
    </>
  );
};

export default ChatSidebar;