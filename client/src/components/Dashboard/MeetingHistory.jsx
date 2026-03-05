import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Video, Clock, Users, Calendar, ExternalLink,
  Trash2, RefreshCw, History, TrendingUp,
  Copy, Loader2, AlertCircle, Play
} from 'lucide-react';
import { roomAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const formatDuration = (sec) => {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  const diff = Math.floor((Date.now() - date) / 86400000);
  if (diff === 0) return `Today ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (diff === 1) return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  if (diff < 7)  return `${diff} days ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon: Icon, label, value, color }) => (
  <div className="card p-4 flex items-center space-x-4">
    <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon className="w-6 h-6 text-white" />
    </div>
    <div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  </div>
);

// ─── Meeting Row ──────────────────────────────────────────────────────────────
const MeetingRow = ({ meeting, currentUserId, onDelete, onCopy, onJoin }) => {
  const isHost = meeting.host?._id?.toString() === currentUserId?.toString();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!window.confirm('Remove this meeting from your history?')) return;
    setDeleting(true);
    await onDelete(meeting.roomId);
    setDeleting(false);
  };

  return (
    <div className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-primary-200 hover:bg-primary-50/30 transition-all group">

      {/* Icon */}
      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${meeting.isActive ? 'bg-green-100' : 'bg-slate-100'}`}>
        <Video className={`w-5 h-5 sm:w-6 sm:h-6 ${meeting.isActive ? 'text-green-600' : 'text-slate-400'}`} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
          <p className="text-sm sm:text-base font-semibold text-slate-900 truncate">
            {meeting.participants?.length > 0 ? (() => {
              const others = meeting.participants.filter(
                p => p._id?.toString() !== currentUserId?.toString()
              );
              if (others.length === 0) return "You";
              if (others.length === 1) return `You & ${others[0].username}`;
              if (others.length === 2) return `You, ${others[0].username} & ${others[1].username}`;
              return `You, ${others[0].username} & ${others.length - 1} others`;
            })() : `Meeting ···${meeting.roomId.slice(-8)}`}
          </p>
          {meeting.isActive && (
            <span className="hidden sm:flex items-center gap-1 bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />Live
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(meeting.startedAt)}</span>
          {formatDuration(meeting.duration) && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatDuration(meeting.duration)}</span>}
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{meeting.participantCount} participant{meeting.participantCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Avatars */}
      <div className="hidden md:flex -space-x-2 flex-shrink-0">
        {(meeting.participants || []).slice(0, 3).map((p, i) => (
          <img key={i} src={p.avatar} alt={p.username} title={p.username} className="w-7 h-7 rounded-full border-2 border-white object-cover" />
        ))}
        {meeting.participantCount > 3 && (
          <div className="w-7 h-7 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-xs text-slate-600 font-medium">
            +{meeting.participantCount - 3}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        <button
          onClick={() => onJoin(meeting.roomId)}
          title={meeting.isActive ? 'Join live' : 'Rejoin room'}
          className="flex w-8 h-8 rounded-lg hover:bg-primary-100 items-center justify-center text-slate-400 hover:text-primary-600 transition-colors"
        >
          {meeting.isActive ? <Play className="w-4 h-4" /> : <ExternalLink className="w-4 h-4" />}
        </button>
        {isHost && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            title="Remove from history"
            className="w-8 h-8 rounded-lg hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const MeetingHistory = () => {
  const { user }   = useAuth();
  const navigate   = useNavigate();

  const [rooms,       setRooms]       = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [statsLoad,   setStatsLoad]   = useState(true);
  const [loadingMore, setLoadingMore] = useState(false); // ← NEW
  const [error,       setError]       = useState(null);
  const [page,        setPage]        = useState(1);
  const [pagination,  setPagination]  = useState(null);
  const [filter,      setFilter]      = useState('all');

  // Sentinel div watched by IntersectionObserver
  const sentinelRef = useRef(null);
  const observerRef = useRef(null);

  // ─── Fetch page 1 – full replace (used by Refresh) ────────────────────────
  const fetchHistory = useCallback(async (p = 1) => {
    setLoading(true); setError(null);
    try {
      const res = await roomAPI.getHistory(p, 10);
      if (res.data.success) {
        setRooms(res.data.rooms);
        setPagination(res.data.pagination);
        setPage(p);
      }
    } catch {
      setError('Failed to load meeting history. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Append next page – used by infinite scroll only ──────────────────────
  const fetchNextPage = useCallback(async (nextPage) => {
    setLoadingMore(true);
    try {
      const res = await roomAPI.getHistory(nextPage, 10);
      if (res.data.success) {
        setRooms(prev => {
          const existingIds = new Set(prev.map(r => r.roomId));
          const fresh = res.data.rooms.filter(r => !existingIds.has(r.roomId));
          return [...prev, ...fresh];
        });
        setPagination(res.data.pagination);
        setPage(nextPage);
      }
    } catch {
      toast.error('Failed to load more meetings');
    } finally {
      setLoadingMore(false);
    }
  }, []);

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setStatsLoad(true);
    try {
      const res = await roomAPI.getStats();
      if (res.data.success) setStats(res.data.stats);
    } catch { /* silent */ }
    finally { setStatsLoad(false); }
  }, []);

  // ─── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { fetchHistory(1); fetchStats(); }, [fetchHistory, fetchStats]);

  // ─── IntersectionObserver – wire up / tear down on relevant state changes ──
  useEffect(() => {
    // Disconnect any previous observer before re-evaluating
    if (observerRef.current) observerRef.current.disconnect();

    const hasMore = pagination && page < pagination.pages;

    // Skip if still on first load, a page is already in-flight, or no more pages
    if (loading || loadingMore || !hasMore) return;

    observerRef.current = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage(page + 1);
      },
      { threshold: 0.1 }
    );

    if (sentinelRef.current) observerRef.current.observe(sentinelRef.current);

    return () => observerRef.current?.disconnect();
  }, [loading, loadingMore, page, pagination, fetchNextPage]);

  // ─── Actions ───────────────────────────────────────────────────────────────
  const handleDelete = async (roomId) => {
    try {
      await roomAPI.deleteRoom(roomId);
      toast.success('Removed from history');
      setRooms(p => p.filter(r => r.roomId !== roomId));
      fetchStats();
    } catch {
      toast.error('Failed to remove meeting');
    }
  };

  const handleCopy = (roomId) => {
    navigator.clipboard.writeText(`${window.location.origin}/join/${roomId}`);
    toast.success('Meeting link copied!');
  };

  // ─── Filter + sort ─────────────────────────────────────────────────────────
  const filtered = rooms
    .filter(r => {
      const isHost = r.host?._id?.toString() === user?._id?.toString();
      if (filter === 'hosted') return isHost;
      if (filter === 'joined') return !isHost;
      if (filter === 'live')   return r.isActive;
      if (filter === 'ended')  return !r.isActive;
      return true;
    })
    .sort((a, b) => {
      const aIsHost = a.host?._id?.toString() === user?._id?.toString();
      const bIsHost = b.host?._id?.toString() === user?._id?.toString();
      if (aIsHost === bIsHost) return 0;
      return aIsHost ? -1 : 1; // hosted first
    });

  const liveCount   = rooms.filter(r => r.isActive).length;
  const hostedCount = rooms.filter(r => r.host?._id?.toString() === user?._id?.toString()).length;
  const joinedCount = rooms.length - hostedCount;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div>
          <h2 className="text-xl sm:text-3xl font-display font-bold text-slate-900 flex items-center gap-2">
            <History className="w-6 h-6 text-primary-500" />Meeting History
          </h2>
          <p className="text-sm sm:text-base text-slate-600 mt-1">All your past and live meetings</p>
        </div>
        <button
          onClick={() => { fetchHistory(1); fetchStats(); }}
          className="btn btn-secondary flex items-center gap-2 text-sm py-2 px-3"
        >
          <RefreshCw className="w-4 h-4" /><span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {statsLoad
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="card p-4 h-20 animate-pulse bg-slate-100" />)
          : <>
              <StatCard icon={Video}      label="Total Meetings"    value={stats?.totalMeetings      ?? '—'} color="bg-primary-500" />
              <StatCard icon={TrendingUp} label="Hosted"            value={stats?.hostedMeetings     ?? '—'} color="bg-violet-500"  />
              <StatCard icon={Users}      label="Joined"            value={stats?.joinedMeetings     ?? '—'} color="bg-green-500"   />
              <StatCard icon={Clock}      label="Hours in Calls"    value={stats?.totalDurationHours ?? '—'} color="bg-orange-500"  />
            </>
        }
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {[
          { id: 'all',    label: 'All Meetings' },
          { id: 'hosted', label: 'Hosted by Me', badge: hostedCount },
          { id: 'joined', label: 'Joined',        badge: joinedCount },
          { id: 'live',   label: 'Live Now',      badge: liveCount },
          { id: 'ended',  label: 'Past Meetings' },
        ].map(({ id, label, badge }) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all flex items-center gap-1.5 ${
              filter === id
                ? 'bg-primary-600 text-white shadow-sm'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-primary-300 hover:text-primary-600'
            }`}>
            {id === 'live' && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
            {label}
            {badge > 0 && (
              <span className={`text-xs px-1.5 rounded-full ${filter === id ? 'bg-white/20' : 'bg-green-100 text-green-700'}`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-2 sm:space-y-3">
        {loading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 sm:h-20 rounded-xl bg-slate-100 animate-pulse" />
            ))
          : error
            ? <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle className="w-12 h-12 text-red-400 mb-3" />
                <p className="text-slate-700 font-medium mb-3">{error}</p>
                <button onClick={() => fetchHistory(1)} className="btn btn-primary text-sm py-2">Try Again</button>
              </div>
            : filtered.length === 0
              ? <div className="flex flex-col items-center justify-center py-16 text-center">
                  <History className="w-16 h-16 text-slate-200 mb-4" />
                  <h3 className="text-lg font-semibold text-slate-700 mb-1">No meetings yet</h3>
                  <p className="text-slate-500 text-sm max-w-xs">
                    {filter === 'live'
                      ? 'No active meetings right now.'
                      : 'Start or join a meeting to see your history here.'}
                  </p>
                </div>
              : filtered.map(m => (
                  <MeetingRow
                    key={m._id}
                    meeting={m}
                    currentUserId={user?._id}
                    onDelete={handleDelete}
                    onCopy={handleCopy}
                    onJoin={(id) => navigate(`/room/${id}`)}
                  />
                ))
        }

        {/* ── Infinite scroll anchor, spinner & end-of-list message ── */}
        {!loading && !error && (
          <>
            {/*
              Sentinel – sits just below the last row.
              When it enters the viewport the observer fires fetchNextPage().
            */}
            <div ref={sentinelRef} className="h-1" aria-hidden="true" />

            {/* Spinner while next page is being fetched */}
            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
                <Loader2 className="w-5 h-5 animate-spin" />
                Loading more meetings…
              </div>
            )}

            {/* End-of-list – only shown after all pages are loaded */}
            {!loadingMore && pagination && page >= pagination.pages && filtered.length > 0 && (
              <p className="text-center text-xs text-slate-400 py-6">
                You've reached the end · {pagination.total} meeting{pagination.total !== 1 ? 's' : ''} total
              </p>
            )}
          </>
        )}
      </div>

    </div>
  );
};

export default MeetingHistory;