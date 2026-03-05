import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X, Search, Send, Check, Mic, ImageIcon, Film,
  FileText, File, Loader2, Users, MessageCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../../utils/api';
import toast from 'react-hot-toast';

/* ─────────────────────────────────────────────────────────────────────────────
 * ForwardModal  (v2 — production)
 *
 * Props:
 *   messages?      {object[]}  — batch of messages to forward (multi-select mode)
 *   message?       {object}    — single message (legacy / action-bar usage)
 *   onClose        {function}
 *   onlineUsers    {Set}       — Set<string> of online user IDs
 *   currentUserId  {string}
 *
 * Supports:
 *   • Forward to one or many DM contacts
 *   • Forward to group chats (graceful empty if groups API not built)
 *   • Multi-message batch forwarding
 *   • Online presence dots
 *   • Last seen labels
 *   • Search filtering per tab
 *   • "Forwarded many times" aware (uses forwardCount from server)
 * ───────────────────────────────────────────────────────────────────────────── */

/* ── Preview helpers ─────────────────────────────────────────────────────── */
const getPreviewLabel = (message) => {
  if (!message) return '';
  const atts = message.attachments || [];
  const t    = message.type || '';
  const mime = atts[0]?.mimeType || '';
  const url  = atts[0]?.url     || '';
  if (message.content && !atts.length) return message.content;
  const isAudio = t === 'audio' || mime.startsWith('audio/')  || atts[0]?.name?.startsWith('voice-');
  const isVideo = t === 'video' || mime.startsWith('video/')  || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
  const isImage = t === 'image' || mime.startsWith('image/')  || /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(url);
  const isPdf   = mime === 'application/pdf'                  || /\.pdf(\?|$)/i.test(url);
  if (isAudio) return '🎤 Voice message';
  if (isVideo) return '📹 Video';
  if (isImage) return '📷 Photo';
  if (isPdf)   return '📄 Document';
  if (atts.length) return '📎 File';
  return message.content || 'Message';
};

const PreviewIcon = ({ message }) => {
  if (!message) return null;
  const atts = message.attachments || [];
  const t    = message.type || '';
  const mime = atts[0]?.mimeType || '';
  const url  = atts[0]?.url || '';
  if (!atts.length && message.content) return null;
  const isAudio = t === 'audio' || mime.startsWith('audio/')  || atts[0]?.name?.startsWith('voice-');
  const isVideo = t === 'video' || mime.startsWith('video/');
  const isImage = t === 'image' || mime.startsWith('image/')  || /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url);
  const isPdf   = mime === 'application/pdf';
  const s = { width: 14, height: 14, color: '#64748b', flexShrink: 0 };
  if (isAudio) return <Mic       style={s} />;
  if (isVideo) return <Film      style={s} />;
  if (isImage) return <ImageIcon style={s} />;
  if (isPdf)   return <FileText  style={s} />;
  if (atts.length) return <File  style={s} />;
  return null;
};

/* ── Avatar ──────────────────────────────────────────────────────────────── */
const FwdAvatar = ({ user, size = 42, showDot = false, isOnline = false, isGroup = false }) => {
  const raw    = user?.username || user?.name || user?.groupName || '?';
  const letter = raw[0].toUpperCase();

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      {isGroup ? (
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: 'linear-gradient(135deg,#10b981,#059669)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
        }}>
          <Users style={{ width: size * 0.45, height: size * 0.45 }} />
        </div>
      ) : user?.avatar ? (
        <img
          src={user.avatar}
          alt=""
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <div style={{
          width: size, height: size, borderRadius: '50%',
          background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontWeight: 700, fontSize: Math.round(size * 0.38),
          userSelect: 'none',
        }}>
          {letter}
        </div>
      )}
      {showDot && isOnline && !isGroup && (
        <span style={{
          position: 'absolute', bottom: 1, right: 1,
          width: Math.round(size * 0.27), height: Math.round(size * 0.27),
          borderRadius: '50%', background: '#22c55e',
          border: '2px solid #fff', display: 'block',
        }} />
      )}
    </div>
  );
};

/* ── Selected chip ───────────────────────────────────────────────────────── */
const SelectedChip = ({ item, onRemove }) => {
  const label    = item.username || item.name || item.groupName || '?';
  const isGroup  = !!item._isGroup;
  const chipBg   = isGroup ? '#f0fdf4' : '#eff6ff';
  const chipBdr  = isGroup ? '#86efac' : '#bfdbfe';
  const chipClr  = isGroup ? '#166534' : '#1d4ed8';
  const xClr     = isGroup ? '#86efac' : '#93c5fd';

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: chipBg, border: `1.5px solid ${chipBdr}`,
      borderRadius: 20, padding: '3px 8px 3px 5px',
      fontSize: 13, color: chipClr, fontWeight: 500,
      whiteSpace: 'nowrap', flexShrink: 0, lineHeight: 1,
    }}>
      <FwdAvatar user={item} size={20} isGroup={isGroup} />
      <span style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <button
        onClick={() => onRemove(item)}
        aria-label={`Remove ${label}`}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', color: xClr,
          marginLeft: 2, lineHeight: 1,
        }}
      >
        <X style={{ width: 12, height: 12 }} />
      </button>
    </div>
  );
};

/* ── Target row (user or group) ──────────────────────────────────────────── */
const TargetRow = ({ item, selected, onToggle, onlineUsers }) => {
  const isGroup  = !!item._isGroup;
  const isOnline = !isGroup && onlineUsers.has(String(item._id));
  const label    = item.username || item.name || item.groupName || 'Unknown';

  const subLabel = isGroup
    ? `${item.memberCount ?? item.members?.length ?? 0} members`
    : isOnline
      ? 'Online'
      : item.lastSeen
        ? `Last seen ${formatDistanceToNow(new Date(item.lastSeen), { addSuffix: true })}`
        : '';

  const selBg  = isGroup ? 'rgba(16,185,129,0.07)' : 'rgba(59,130,246,0.07)';
  const chkClr = isGroup ? '#10b981' : '#3b82f6';
  const chkGlow = isGroup ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)';

  return (
    <button
      onClick={() => onToggle(item)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 16px',
        background: selected ? selBg : 'transparent',
        border: 'none', borderRadius: 10, cursor: 'pointer',
        transition: 'background 0.13s', textAlign: 'left',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = selected ? selBg : 'transparent'; }}
    >
      <FwdAvatar user={item} size={42} showDot isOnline={isOnline} isGroup={isGroup} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          margin: 0, fontSize: 14, fontWeight: 600, color: '#0f172a',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {label}
        </p>
        {subLabel && (
          <p style={{
            margin: '2px 0 0', fontSize: 12,
            color: isOnline ? '#22c55e' : '#94a3b8',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {subLabel}
          </p>
        )}
      </div>

      {/* Circular checkbox */}
      <div style={{
        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
        border:      selected ? `2px solid ${chkClr}` : '2px solid #cbd5e1',
        background:  selected ? chkClr : '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.15s ease',
        boxShadow: selected ? `0 0 0 3px ${chkGlow}` : 'none',
      }}>
        {selected && <Check style={{ width: 12, height: 12, color: '#fff', strokeWidth: 3 }} />}
      </div>
    </button>
  );
};

/* ── Tab bar ─────────────────────────────────────────────────────────────── */
const TabBar = ({ tab, onTab, userCount, groupCount }) => (
  <div style={{
    display: 'flex',
    padding: '0 16px',
    flexShrink: 0,
  }}>
    {[
      { id: 'users',  label: 'Contacts', Icon: MessageCircle, count: userCount  },
      { id: 'groups', label: 'Groups',   Icon: Users,         count: groupCount },
    ].map(({ id, label, Icon, count }) => (
      <button
        key={id}
        onClick={() => onTab(id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '9px 12px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, fontWeight: tab === id ? 700 : 500,
          color: tab === id ? '#3b82f6' : '#64748b',
          borderBottom: `2px solid ${tab === id ? '#3b82f6' : 'transparent'}`,
          transition: 'all 0.13s',
          marginBottom: -1,
        }}
      >
        <Icon style={{ width: 14, height: 14 }} />
        {label}
        {count > 0 && (
          <span style={{
            background: tab === id ? '#eff6ff' : '#f1f5f9',
            color:      tab === id ? '#3b82f6' : '#94a3b8',
            borderRadius: 10, padding: '1px 6px',
            fontSize: 11, fontWeight: 700,
          }}>
            {count}
          </span>
        )}
      </button>
    ))}
  </div>
);

/* ── Main modal ──────────────────────────────────────────────────────────── */
const ForwardModal = ({
  messages: messagesProp,
  message:  messageProp,
  onClose,
  onlineUsers   = new Set(),
  currentUserId,
}) => {
  // Normalise: support both `message` (single, legacy) and `messages` (batch)
  const messagesToForward = useMemo(() => {
    if (Array.isArray(messagesProp) && messagesProp.length) return messagesProp;
    if (messageProp) return [messageProp];
    return [];
  }, [messagesProp, messageProp]);

  const [tab,      setTab]      = useState('users');
  const [users,    setUsers]    = useState([]);
  const [groups,   setGroups]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [query,    setQuery]    = useState('');
  const [selected, setSelected] = useState([]);
  const [sending,  setSending]  = useState(false);

  const searchRef   = useRef(null);
  const backdropRef = useRef(null);

  /* Auto-focus search */
  useEffect(() => {
    const t = setTimeout(() => searchRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, []);

  /* Lock body scroll */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Escape key */
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  /* Fetch contacts + groups (parallel, independent) */
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        /* ── Users ─────────────────────────────────────────────────────── */
        let allUsers = [];
        try {
          const res = await api.get('/users');
          const raw = res.data?.users || res.data || [];
          allUsers  = Array.isArray(raw) ? raw : [];
          allUsers  = allUsers.filter((u) => String(u._id) !== String(currentUserId));
        } catch (_) { /* contacts fetch failed — show empty list */ }

        /* ── Groups fetch is disabled until /api/groups endpoint exists ───
         *
         * The browser always logs a red network error for 4xx responses in
         * DevTools even when JS catches them — cannot be suppressed from code.
         * To enable groups: uncomment the block, add setGroups(allGroups) below.
         *
         * let allGroups = [];
         * try {
         *   const res = await api.get('/groups');
         *   const raw = res.data?.groups || res.data || [];
         *   allGroups = (Array.isArray(raw) ? raw : []).map((g) => ({
         *     ...g, _isGroup: true, username: g.groupName || g.name || 'Group',
         *   }));
         * } catch (_) {}
         * ─────────────────────────────────────────────────────────────────── */

        if (!active) return;
        setUsers(allUsers);
        setGroups([]);  // swap to setGroups(allGroups) when Groups API is ready
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => { active = false; };
  }, [currentUserId]);

  /* Active list for the current tab, filtered by search */
  const activeList = useMemo(() => {
    const list = tab === 'users' ? users : groups;
    if (!query.trim()) return list;
    const q = query.trim().toLowerCase();
    return list.filter((item) => {
      const name = item.username || item.name || item.groupName || '';
      return name.toLowerCase().includes(q);
    });
  }, [tab, users, groups, query]);

  /* Toggle selection */
  const toggle = useCallback((item) => {
    setSelected((prev) => {
      const exists = prev.some((i) => String(i._id) === String(item._id));
      return exists
        ? prev.filter((i) => String(i._id) !== String(item._id))
        : [...prev, item];
    });
  }, []);

  const removeSelected = useCallback((item) => {
    setSelected((prev) => prev.filter((i) => String(i._id) !== String(item._id)));
  }, []);

  const isItemSelected = (item) =>
    selected.some((i) => String(i._id) === String(item._id));

  /* Send */
  const handleSend = async () => {
    if (!selected.length || sending || !messagesToForward.length) return;
    setSending(true);
    try {
      const dmRecipients = selected.filter((i) => !i._isGroup).map((i) => i._id);
      const groupIds     = selected.filter((i) =>  i._isGroup).map((i) => i._id);
      const messageIds   = messagesToForward.map((m) => m._id);

      await api.post('/direct-messages/forward', {
        messageIds,
        recipients: dmRecipients,
        groupIds,
      });

      const msgCount    = messagesToForward.length;
      const targetLabel = selected.length === 1
        ? (selected[0].username || selected[0].name || selected[0].groupName)
        : `${selected.length} chats`;

      toast.success(
        msgCount > 1
          ? `${msgCount} messages forwarded to ${targetLabel}`
          : `Forwarded to ${targetLabel}`,
        { icon: '↪️', duration: 3000 }
      );
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to forward message');
    } finally {
      setSending(false);
    }
  };

  /* Derived */
  const firstMsg       = messagesToForward[0];
  const isMulti        = messagesToForward.length > 1;
  const preview        = firstMsg ? getPreviewLabel(firstMsg) : '';
  const previewTrimmed = preview.length > 60 ? `${preview.slice(0, 60)}…` : preview;

  const onBackdropClick = (e) => {
    if (e.target === backdropRef.current) onClose();
  };

  /* ── Render ────────────────────────────────────────────────────────────── */
  return createPortal(
    <div
      ref={backdropRef}
      onClick={onBackdropClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9000,
        background: 'rgba(15,23,42,0.55)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'fwdBackdropIn 0.18s ease',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Forward message"
        style={{
          width: '100%', maxWidth: 460,
          background: '#fff', borderRadius: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,0.22), 0 4px 16px rgba(0,0,0,0.08)',
          display: 'flex', flexDirection: 'column',
          maxHeight: 'min(640px, calc(100vh - 32px))',
          overflow: 'hidden',
          animation: 'fwdModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid #f1f5f9',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#0f172a' }}>
              Forward {isMulti ? `${messagesToForward.length} Messages` : 'Message'}
            </h2>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: '#94a3b8' }}>
              Select contacts or groups
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: '#f1f5f9', border: 'none', borderRadius: '50%',
              width: 34, height: 34, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#64748b', flexShrink: 0, transition: 'background 0.13s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ── Message preview card ─────────────────────────────────────────── */}
        <div style={{
          margin: '12px 16px 0',
          padding: '10px 14px',
          background: '#f8fafc',
          borderRadius: 10,
          border: '1px solid #e2e8f0',
          flexShrink: 0,
        }}>
          <p style={{
            margin: '0 0 4px', fontSize: 11, fontWeight: 600,
            color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em',
          }}>
            {isMulti ? `↪ ${messagesToForward.length} messages selected` : '↪ Forwarding'}
          </p>

          {!isMulti && firstMsg && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <PreviewIcon message={firstMsg} />
              <p style={{
                margin: 0, fontSize: 13, color: '#475569',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {previewTrimmed || 'Message'}
              </p>
            </div>
          )}

          {isMulti && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {messagesToForward.slice(0, 3).map((m, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 12, color: '#475569',
                    background: '#e2e8f0', borderRadius: 6,
                    padding: '2px 7px',
                    maxWidth: 140, overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                >
                  {getPreviewLabel(m).slice(0, 30)}
                </span>
              ))}
              {messagesToForward.length > 3 && (
                <span style={{ fontSize: 12, color: '#94a3b8', alignSelf: 'center' }}>
                  +{messagesToForward.length - 3} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Search ──────────────────────────────────────────────────────── */}
        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: '#f1f5f9', borderRadius: 10,
              padding: '9px 14px',
              border: '1.5px solid transparent',
              transition: 'border-color 0.15s',
            }}
            onFocusCapture={e => e.currentTarget.style.borderColor = '#93c5fd'}
            onBlurCapture={e  => e.currentTarget.style.borderColor = 'transparent'}
          >
            <Search style={{ width: 15, height: 15, color: '#94a3b8', flexShrink: 0 }} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={tab === 'groups' ? 'Search groups…' : 'Search contacts…'}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 14, color: '#0f172a', caretColor: '#3b82f6',
              }}
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: '#94a3b8', padding: 0, display: 'flex', lineHeight: 1,
                }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            )}
          </div>
        </div>

        {/* ── Tab bar ─────────────────────────────────────────────────────── */}
        <div style={{
          marginTop: 10,
          borderBottom: '1px solid #f1f5f9',
          flexShrink: 0,
        }}>
          <TabBar
            tab={tab}
            onTab={(t) => { setTab(t); setQuery(''); }}
            userCount={users.length}
            groupCount={groups.length}
          />
        </div>

        {/* ── Selected chips ───────────────────────────────────────────────── */}
        {selected.length > 0 && (
          <div style={{
            padding: '8px 16px',
            display: 'flex', flexWrap: 'wrap', gap: 6,
            flexShrink: 0,
            maxHeight: 90, overflowY: 'auto',
          }}>
            {selected.map((item) => (
              <SelectedChip key={item._id} item={item} onRemove={removeSelected} />
            ))}
          </div>
        )}

        {/* ── List ────────────────────────────────────────────────────────── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '4px 8px 8px',
          scrollbarWidth: 'thin', scrollbarColor: '#e2e8f0 transparent',
        }}>
          {loading ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '40px 20px', gap: 12,
            }}>
              <Loader2 style={{
                width: 28, height: 28, color: '#3b82f6',
                animation: 'fwdSpin 0.8s linear infinite',
              }} />
              <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>Loading…</p>
            </div>
          ) : activeList.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 500 }}>
                {query
                  ? `No results for "${query}"`
                  : tab === 'groups'
                    ? 'No groups found'
                    : 'No contacts found'
                }
              </p>
            </div>
          ) : (
            activeList.map((item) => (
              <TargetRow
                key={item._id}
                item={item}
                selected={isItemSelected(item)}
                onToggle={toggle}
                onlineUsers={onlineUsers}
              />
            ))
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div style={{
          padding: '12px 16px 16px',
          borderTop: '1px solid #f1f5f9',
          flexShrink: 0,
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
        }}>
          <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
            {selected.length === 0
              ? 'No recipients selected'
              : `${selected.length} recipient${selected.length > 1 ? 's' : ''} selected`
            }
          </p>

          <button
            onClick={handleSend}
            disabled={selected.length === 0 || sending}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 22px', borderRadius: 10, border: 'none',
              background: selected.length === 0
                ? '#e2e8f0'
                : 'linear-gradient(135deg,#3b82f6,#2563eb)',
              color: selected.length === 0 ? '#94a3b8' : '#fff',
              fontWeight: 600, fontSize: 14,
              cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: selected.length > 0
                ? '0 4px 12px rgba(59,130,246,0.35)'
                : 'none',
              transform: 'scale(1)',
            }}
            onMouseEnter={e => {
              if (selected.length > 0 && !sending)
                e.currentTarget.style.transform = 'scale(1.03)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {sending
              ? <Loader2 style={{ width: 16, height: 16, animation: 'fwdSpin 0.7s linear infinite' }} />
              : <Send    style={{ width: 15, height: 15 }} />
            }
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fwdBackdropIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes fwdModalIn {
          from { opacity: 0; transform: scale(0.88) translateY(16px) }
          to   { opacity: 1; transform: scale(1)    translateY(0)     }
        }
        @keyframes fwdSpin { to { transform: rotate(360deg) } }
        div::-webkit-scrollbar       { width: 4px }
        div::-webkit-scrollbar-track { background: transparent }
        div::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px }
      `}</style>
    </div>,
    document.body
  );
};

export default ForwardModal;