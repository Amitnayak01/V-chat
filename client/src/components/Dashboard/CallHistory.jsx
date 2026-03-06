/**
 * CallHistory.jsx
 * ────────────────
 * Full-featured call history dashboard.
 * • Reads/writes via callHistoryStore (localStorage)
 * • Filters: All · Incoming · Outgoing · Missed
 * • Live search by name
 * • Delete single / clear all
 * • "Call again" via AudioCallContext.initiateCall
 * • Real-time updates on 'vmeet-call-history-updated' events
 * • Mobile-first responsive, dark-card aesthetic matching AudioCallUI v5
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, PhoneOff,
  Search, Trash2, Trash, X, Filter, Clock, Calendar,
  ChevronDown, MoreVertical, RefreshCw, Info,
} from 'lucide-react';
import { useAudioCall } from '../../context/AudioCallContext';
import {
  getCallHistory, deleteCallRecord, clearCallHistory,
  fmtDuration, fmtTimestamp,
} from '../../utils/callHistoryStore';

/* ─── Design tokens (match AudioCallUI v5) ──────────────────────────────── */
const T = {
  bg:     '#f0f4f8',
  card:   '#ffffff',
  dark:   '#0a1220',
  teal:   '#0fe6c0',
  tealBg: 'rgba(15,230,192,0.10)',
  tealBd: 'rgba(15,230,192,0.25)',
  red:    '#ef4444',
  gold:   '#f0a83e',
  blue:   '#3b82f6',
  slate1: '#1e293b',
  slate2: '#475569',
  slate3: '#94a3b8',
  slate4: '#e2e8f0',
  slate5: '#f8fafc',
};

/* ─── Call type meta ────────────────────────────────────────────────────── */
const CALL_META = {
  incoming: { Icon: PhoneIncoming, color: T.teal,  label: 'Incoming', bg: T.tealBg  },
  outgoing: { Icon: PhoneOutgoing, color: T.blue,  label: 'Outgoing', bg: 'rgba(59,130,246,.10)' },
  missed:   { Icon: PhoneMissed,   color: T.red,   label: 'Missed',   bg: 'rgba(239,68,68,.10)'  },
};

const STATUS_META = {
  completed: { color: T.teal,  label: 'Completed' },
  rejected:  { color: T.red,   label: 'Rejected'  },
  missed:    { color: T.red,   label: 'Missed'     },
};

/* ─── Filter tabs ───────────────────────────────────────────────────────── */
const FILTERS = [
  { id: 'all',      label: 'All'      },
  { id: 'incoming', label: 'Incoming' },
  { id: 'outgoing', label: 'Outgoing' },
  { id: 'missed',   label: 'Missed'   },
];

/* ──────────────────────────────────────────────────────────────────────────
   GLOBAL STYLES
────────────────────────────────────────────────────────────────────────── */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;700&display=swap');
    .ch-root * { box-sizing: border-box; font-family: 'DM Sans', sans-serif; }
    .ch-mono   { font-family: 'JetBrains Mono', monospace !important; }
    @keyframes ch-in    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
    @keyframes ch-fade  { from{opacity:0} to{opacity:1} }
    @keyframes ch-slide { from{opacity:0;transform:translateX(-8px)} to{opacity:1;transform:none} }
    @keyframes ch-pop   { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
    .ch-row { animation: ch-in .22s ease both; }
    .ch-row:hover .ch-actions { opacity: 1 !important; }
    .ch-row:hover { background: #f1f5f9 !important; }
    .ch-btn-ghost { transition: all .15s; }
    .ch-btn-ghost:hover { transform: translateY(-1px); }
    .ch-btn-ghost:active { transform: scale(.92); }
    .ch-tab { transition: all .18s; }
    .ch-row-action { transition: all .12s; }
    .ch-row-action:hover { transform: scale(1.08); }
    .ch-row-action:active { transform: scale(.92); }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
  `}</style>
);

/* ─── Avatar ────────────────────────────────────────────────────────────── */
const Avatar = ({ src, name, size = 44, type }) => {
  const meta = CALL_META[type] || CALL_META.incoming;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'linear-gradient(135deg,#0b5545,#1e3a5f)', border: '2px solid #e2e8f0' }}>
        {src
          ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: size * .38, userSelect: 'none' }}>
              {name?.[0]?.toUpperCase() ?? '?'}
            </div>
        }
      </div>
      {/* Type badge */}
      <div style={{ position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: '50%', background: meta.bg, border: `1.5px solid ${meta.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <meta.Icon style={{ width: 9, height: 9, color: meta.color }} strokeWidth={2.5} />
      </div>
    </div>
  );
};

/* ─── Empty state ───────────────────────────────────────────────────────── */
const Empty = ({ filter, search }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', gap: 12, animation: 'ch-fade .3s ease' }}>
    <div style={{ width: 64, height: 64, borderRadius: 20, background: T.slate5, border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {search ? <Search style={{ width: 28, height: 28, color: T.slate3 }} /> : <Phone style={{ width: 28, height: 28, color: T.slate3 }} />}
    </div>
    <div style={{ textAlign: 'center' }}>
      <p style={{ fontWeight: 800, fontSize: 15, color: T.slate1, margin: '0 0 4px' }}>
        {search ? `No results for "${search}"` : filter === 'all' ? 'No calls yet' : `No ${filter} calls`}
      </p>
      <p style={{ fontSize: 13, color: T.slate3, margin: 0, lineHeight: 1.5 }}>
        {search ? 'Try a different name' : 'Calls you make and receive will appear here'}
      </p>
    </div>
  </div>
);

/* ─── Confirm dialog ────────────────────────────────────────────────────── */
const ConfirmDialog = ({ message, onConfirm, onCancel }) => (
  <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }} onClick={onCancel}>
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)' }} />
    <div onClick={e => e.stopPropagation()} style={{ position: 'relative', zIndex: 1, background: '#fff', borderRadius: 20, padding: '24px 24px 20px', maxWidth: 340, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,.18)', animation: 'ch-pop .22s cubic-bezier(.34,1.3,.64,1)' }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: '#fef2f2', border: '1.5px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
        <Trash2 style={{ width: 22, height: 22, color: T.red }} />
      </div>
      <p style={{ fontWeight: 700, fontSize: 16, color: T.slate1, margin: '0 0 6px' }}>Clear History</p>
      <p style={{ fontSize: 13, color: T.slate2, margin: '0 0 20px', lineHeight: 1.55 }}>{message}</p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onCancel} className="ch-btn-ghost" style={{ flex: 1, padding: '10px', borderRadius: 12, background: T.slate5, border: '1.5px solid #e2e8f0', fontWeight: 600, fontSize: 13, color: T.slate2, cursor: 'pointer' }}>Cancel</button>
        <button onClick={onConfirm} className="ch-btn-ghost" style={{ flex: 1, padding: '10px', borderRadius: 12, background: '#fef2f2', border: '1.5px solid #fecaca', fontWeight: 700, fontSize: 13, color: T.red, cursor: 'pointer' }}>Delete</button>
      </div>
    </div>
  </div>
);

/* ─── Single call row ───────────────────────────────────────────────────── */
const CallRow = ({ record, idx, onDelete, onCallAgain }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const meta   = CALL_META[record.type]  || CALL_META.incoming;
  const sMeta  = STATUS_META[record.status] || STATUS_META.completed;

  useEffect(() => {
    if (!menuOpen) return;
    const close = e => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div className="ch-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderRadius: 14, cursor: 'default', position: 'relative', background: '#fff', animationDelay: `${idx * 30}ms` }}>

      <Avatar src={record.peerAvatar} name={record.peerName} size={46} type={record.type} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: T.slate1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{record.peerName}</span>
          <span style={{ fontSize: 10, fontWeight: 700, color: meta.color, background: meta.bg, padding: '1px 6px', borderRadius: 999, flexShrink: 0 }}>{meta.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Status */}
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: sMeta.color, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: sMeta.color }}>{sMeta.label}</span>
          </span>
          {/* Duration */}
          {record.duration > 0 && (
            <>
              <span style={{ color: '#cbd5e1', fontSize: 10 }}>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock style={{ width: 10, height: 10, color: T.slate3 }} />
                <span className="ch-mono" style={{ fontSize: 11, color: T.slate3, fontWeight: 600 }}>{fmtDuration(record.duration)}</span>
              </span>
            </>
          )}
          {/* Time */}
          <span style={{ color: '#cbd5e1', fontSize: 10 }}>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Calendar style={{ width: 10, height: 10, color: T.slate3 }} />
            <span style={{ fontSize: 11, color: T.slate3 }}>{fmtTimestamp(record.timestamp)}</span>
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="ch-actions" style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: 1, flexShrink: 0 }}>
        {/* Call again */}
        <button
          onClick={() => onCallAgain(record)}
          className="ch-row-action"
          title="Call again"
          style={{ width: 36, height: 36, borderRadius: 10, background: T.tealBg, border: `1px solid ${T.tealBd}`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <Phone style={{ width: 15, height: 15, color: '#0ab89a' }} strokeWidth={2.2} />
        </button>

        {/* ⋮ menu */}
        <div style={{ position: 'relative' }} ref={menuRef}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            className="ch-row-action"
            style={{ width: 36, height: 36, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <MoreVertical style={{ width: 15, height: 15, color: T.slate3 }} />
          </button>
          {menuOpen && (
            <div style={{ position: 'absolute', right: 0, top: '110%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', zIndex: 10, minWidth: 150, animation: 'ch-pop .15s ease', overflow: 'hidden' }}>
              <button onClick={() => { onCallAgain(record); setMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.slate1 }}>
                <Phone style={{ width: 14, height: 14, color: '#0ab89a' }} /> Call again
              </button>
              <div style={{ height: 1, background: '#f1f5f9' }} />
              <button onClick={() => { onDelete(record.id); setMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.red }}>
                <Trash2 style={{ width: 14, height: 14 }} /> Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════ */
const CallHistory = () => {
  const { initiateCall, callState } = useAudioCall();

  const [records,     setRecords]     = useState(() => getCallHistory());
  const [filter,      setFilter]      = useState('all');
  const [search,      setSearch]      = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmMsg,  setConfirmMsg]  = useState('');
  const [confirmCb,   setConfirmCb]   = useState(null);
  const searchRef = useRef(null);

  /* ── Live sync from storage events ──────────────────────────────────── */
  useEffect(() => {
    const onUpdate = (e) => setRecords(e.detail ?? getCallHistory());
    window.addEventListener('vmeet-call-history-updated', onUpdate);
    return () => window.removeEventListener('vmeet-call-history-updated', onUpdate);
  }, []);

  /* ── Derived list ───────────────────────────────────────────────────── */
  const filtered = records
    .filter(r => filter === 'all' || r.type === filter)
    .filter(r => !search || r.peerName?.toLowerCase().includes(search.toLowerCase()));

  /* ── Stats ──────────────────────────────────────────────────────────── */
  const stats = {
    total:    records.length,
    missed:   records.filter(r => r.type === 'missed').length,
    incoming: records.filter(r => r.type === 'incoming').length,
    outgoing: records.filter(r => r.type === 'outgoing').length,
  };

  /* ── Handlers ───────────────────────────────────────────────────────── */
  const handleDelete = useCallback((id) => {
    setRecords(deleteCallRecord(id));
  }, []);

  const handleDeleteWithConfirm = useCallback((id) => {
    setConfirmMsg('Remove this call from your history?');
    setConfirmCb(() => () => { handleDelete(id); setShowConfirm(false); });
    setShowConfirm(true);
  }, [handleDelete]);

  const handleClearAll = () => {
    if (records.length === 0) return;
    setConfirmMsg(`Delete all ${records.length} call records? This cannot be undone.`);
    setConfirmCb(() => () => { clearCallHistory(); setRecords([]); setShowConfirm(false); });
    setShowConfirm(true);
  };

  const handleCallAgain = useCallback((record) => {
    if (callState !== 'idle') return;
    initiateCall(record.peerId, record.peerName, record.peerAvatar);
  }, [callState, initiateCall]);

  const handleRefresh = () => setRecords(getCallHistory());

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <div className="ch-root" style={{ height: '100%', display: 'flex', flexDirection: 'column', background: T.bg, minHeight: 0 }}>
      <Styles />
      {showConfirm && <ConfirmDialog message={confirmMsg} onConfirm={confirmCb} onCancel={() => setShowConfirm(false)} />}

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e8edf2', padding: '16px 20px 0', flexShrink: 0 }}>

        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <h1 style={{ fontWeight: 800, fontSize: 22, color: T.slate1, margin: 0, letterSpacing: '-.025em' }}>Call History</h1>
            <p style={{ fontSize: 12, color: T.slate3, margin: '2px 0 0' }}>
              {stats.total} total · {stats.missed} missed
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRefresh} className="ch-btn-ghost" title="Refresh" style={{ width: 36, height: 36, borderRadius: 10, background: T.slate5, border: '1.5px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <RefreshCw style={{ width: 15, height: 15, color: T.slate3 }} />
            </button>
            {records.length > 0 && (
              <button onClick={handleClearAll} className="ch-btn-ghost" title="Clear all" style={{ width: 36, height: 36, borderRadius: 10, background: '#fef2f2', border: '1.5px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Trash style={{ width: 15, height: 15, color: T.red }} />
              </button>
            )}
          </div>
        </div>

        {/* Stat pills */}
        {records.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              { label: 'Incoming', value: stats.incoming, color: T.teal,  bg: T.tealBg },
              { label: 'Outgoing', value: stats.outgoing, color: T.blue,  bg: 'rgba(59,130,246,.09)' },
              { label: 'Missed',   value: stats.missed,   color: T.red,   bg: 'rgba(239,68,68,.09)'  },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 999, background: s.bg }}>
                <span style={{ fontWeight: 800, fontSize: 13, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: s.color, opacity: .75 }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: T.slate3, pointerEvents: 'none' }} />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name…"
            style={{ width: '100%', paddingLeft: 36, paddingRight: search ? 36 : 14, paddingTop: 9, paddingBottom: 9, fontSize: 13, fontFamily: 'DM Sans', fontWeight: 500, color: T.slate1, background: T.slate5, border: '1.5px solid #e2e8f0', borderRadius: 12, outline: 'none', transition: 'border-color .15s' }}
            onFocus={e => { e.target.style.borderColor = T.teal; }}
            onBlur={e => { e.target.style.borderColor = '#e2e8f0'; }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 20, height: 20, borderRadius: '50%', background: T.slate4, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X style={{ width: 10, height: 10, color: T.slate2 }} />
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, paddingBottom: 1 }}>
          {FILTERS.map(f => {
            const active = filter === f.id;
            const count = f.id === 'all' ? records.length : records.filter(r => r.type === f.id).length;
            return (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className="ch-tab"
                style={{
                  padding: '7px 12px', borderRadius: '10px 10px 0 0', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: active ? T.slate1 : 'transparent',
                  color: active ? '#fff' : T.slate3,
                  border: 'none',
                  borderBottom: active ? `2px solid ${T.teal}` : '2px solid transparent',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {f.label}
                {count > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 999, background: active ? T.tealBg : T.slate5, color: active ? T.teal : T.slate3, border: active ? `1px solid ${T.tealBd}` : '1px solid #e2e8f0' }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CALL LIST ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>

        {filtered.length === 0
          ? <Empty filter={filter} search={search} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((record, idx) => (
                <CallRow
                  key={record.id}
                  record={record}
                  idx={idx}
                  onDelete={handleDeleteWithConfirm}
                  onCallAgain={handleCallAgain}
                />
              ))}
            </div>
          )
        }

        {/* Footer info */}
        {filtered.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '16px 0 8px' }}>
            <Info style={{ width: 12, height: 12, color: T.slate3 }} />
            <span style={{ fontSize: 11, color: T.slate3 }}>
              Showing {filtered.length} of {records.length} records
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CallHistory;