/**
 * callHistoryStore.js
 * ────────────────────
 * Pure localStorage CRUD for V-Meet call history.
 * Dispatches 'vmeet-call-history-updated' CustomEvent after every write
 * so any mounted <CallHistory /> panel can reactively refresh.
 */

const STORAGE_KEY = 'vmeet_call_history';
const MAX_RECORDS = 300;

/** @returns {CallRecord[]} */
export const getCallHistory = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

/**
 * @typedef {Object} CallRecord
 * @property {string}  id
 * @property {string}  peerId
 * @property {string}  peerName
 * @property {string}  [peerAvatar]
 * @property {'incoming'|'outgoing'|'missed'} type
 * @property {'completed'|'rejected'|'missed'} status
 * @property {number}  duration   — seconds
 * @property {string}  timestamp  — ISO 8601
 */

/**
 * Prepend a new record (most-recent-first).
 * Returns the updated full list.
 * @param {Omit<CallRecord,'id'>} record
 * @returns {CallRecord[]}
 */
export const saveCallRecord = (record) => {
  const all = getCallHistory();
  const next = [
    { ...record, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` },
    ...all,
  ].slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('vmeet-call-history-updated', { detail: next }));
  } catch {}
  return next;
};

/**
 * Delete a single record by id.
 * @param {string} id
 * @returns {CallRecord[]}
 */
export const deleteCallRecord = (id) => {
  const next = getCallHistory().filter((r) => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('vmeet-call-history-updated', { detail: next }));
  } catch {}
  return next;
};

/** Wipe the entire history. */
export const clearCallHistory = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('vmeet-call-history-updated', { detail: [] }));
  } catch {}
};

/** Format seconds → "mm:ss" or "hh:mm:ss" */
export const fmtDuration = (secs) => {
  if (!secs || secs < 1) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
};

/** Relative / absolute timestamp label */
export const fmtTimestamp = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 1000);

  if (diff < 60)     return 'Just now';
  if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) {
    return d.toLocaleDateString([], { weekday: 'short' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
         d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};