import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Phone, MessageCircle, Video, PhoneCall,
  MapPin, Briefcase, Mail, Clock, Calendar,
  Loader2, UserX, Wifi, WifiOff, Shield, Edit2,
  User, RefreshCw, Info
} from 'lucide-react';
import { userAPI, directMessageAPI, authAPI } from '../../utils/api';
import { useAuth }      from '../../context/AuthContext';
import { useSocket }    from '../../context/SocketContext';
import { useAudioCall } from '../../context/AudioCallContext';
import { generateRoomId } from '../../utils/webrtc';
import toast from 'react-hot-toast';

/* ══════════════════════════════════════════════════════════════════════════
   HELPERS  — 100% unchanged
══════════════════════════════════════════════════════════════════════════ */
const getStatusMeta = (status) => {
  switch (status) {
    case 'online': return { label: 'Online now',     dot: 'bg-green-500',  badge: 'bg-green-100 text-green-700',   pulse: true  };
    case 'away':   return { label: 'Away',           dot: 'bg-yellow-400', badge: 'bg-yellow-100 text-yellow-700', pulse: false };
    case 'busy':   return { label: 'Do Not Disturb', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700',       pulse: false };
    default:       return { label: 'Offline',        dot: 'bg-slate-400',  badge: 'bg-slate-100 text-slate-500',   pulse: false };
  }
};

const getLastSeen = (lastSeen) => {
  if (!lastSeen) return 'Unknown';
  const diff = Math.floor((Date.now() - new Date(lastSeen)) / 60000);
  if (diff < 1)    return 'Just now';
  if (diff < 60)   return `${diff} minute${diff > 1 ? 's' : ''} ago`;
  if (diff < 1440) return `${Math.floor(diff / 60)} hour${Math.floor(diff / 60) > 1 ? 's' : ''} ago`;
  return `${Math.floor(diff / 1440)} day${Math.floor(diff / 1440) > 1 ? 's' : ''} ago`;
};

const formatJoined = (date) => {
  if (!date) return 'Unknown';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
};

/* ══════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS  — 100% unchanged
══════════════════════════════════════════════════════════════════════════ */
const statusDots = { online: 'bg-green-500', away: 'bg-yellow-400', busy: 'bg-red-500', offline: 'bg-slate-400' };

const StatusBadge = ({ status }) => (
  <span className="inline-flex items-center gap-1.5 text-sm text-slate-600 capitalize font-medium">
    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDots[status] || 'bg-slate-400'}`} />
    {status || 'Offline'}
  </span>
);

const StatPill = ({ label, value, color = 'text-slate-900' }) => (
  <div className="flex flex-col items-center px-2 sm:px-4 py-3 sm:py-4 flex-1">
    <span className={`text-xl sm:text-2xl font-black ${color}`}>{value ?? '—'}</span>
    <span className="text-[10px] sm:text-xs text-slate-500 mt-0.5 font-medium text-center leading-tight">{label}</span>
  </div>
);

const SectionHeader = ({ icon: Icon, title, color = 'text-blue-500', action }) => (
  <div className="flex items-center justify-between mb-3 sm:mb-4">
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0">
        <Icon className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${color}`} />
      </div>
      <h2 className="text-sm sm:text-base font-bold text-slate-800">{title}</h2>
    </div>
    {action}
  </div>
);

const InfoRow = ({ icon: Icon, label, value, accent, valueClass = '' }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2.5 sm:py-3 border-b border-slate-50 last:border-0">
      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
        <p className={`text-sm font-medium text-slate-800 mt-0.5 break-words ${valueClass}`}>{value}</p>
      </div>
    </div>
  );
};

const EmptyFieldRow = ({ icon: Icon, label, accent, onEdit }) => (
  <div className="flex items-center gap-3 py-2.5 sm:py-3 border-b border-slate-50 last:border-0 opacity-50">
    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
      <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
    </div>
    <div className="flex-1">
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
      <button onClick={onEdit} className="text-xs text-blue-500 hover:underline mt-0.5 font-medium">
        + Add {label.toLowerCase()}
      </button>
    </div>
  </div>
);

const Card = ({ children, className = '', delay = 0 }) => (
  <div
    className={`anim-fade-up bg-white rounded-2xl shadow-sm ${className}`}
    style={{ animationDelay: `${delay}ms` }}
  >
    {children}
  </div>
);

/* ══════════════════════════════════════════════════════════════════════════
   USER PROFILE PAGE  —  route: /user/:id
══════════════════════════════════════════════════════════════════════════ */
const UserProfilePage = () => {
  const { id }                              = useParams();
  const navigate                            = useNavigate();
  const { user: currentUser, updateUser }   = useAuth();
  const { socket, onlineUsers, emit }       = useSocket();
  const { initiateCall }                    = useAudioCall();

  const [profile,      setProfile]      = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [notFound,     setNotFound]     = useState(false);
  const [messaging,    setMessaging]    = useState(false);
  const [calling,      setCalling]      = useState(false);
  const [voiceCalling, setVoiceCalling] = useState(false);   // NEW
  const [refreshing,   setRefreshing]   = useState(false);

  const callTimerRef      = useRef(null);
  const voiceCallTimerRef = useRef(null);   // NEW

  const isOwnProfile = profile?._id === currentUser?._id;

  // toString() comparison fixes MongoDB ObjectId vs string mismatch
  const isOnline = profile
    ? onlineUsers.some(uid => uid?.toString() === profile._id?.toString())
    : false;

  const liveStatus = isOnline ? 'online' : (profile?.status || 'offline');
  const status     = getStatusMeta(liveStatus);

  /* ── Cleanup timers on unmount ───────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (callTimerRef.current)      clearTimeout(callTimerRef.current);
      if (voiceCallTimerRef.current) clearTimeout(voiceCallTimerRef.current);
    };
  }, []);

  /* ── Fetch profile — 100% unchanged ─────────────────────────────── */
  const doFetch = async (showLoading = true) => {
    try {
      if (showLoading) { setLoading(true); setNotFound(false); }
      let userData = null;

      // Own profile → use authAPI.getMe() for full data
      // Do NOT use getUserById('me') — crashes MongoDB with a CastError
      if (id === currentUser?._id) {
        try {
          const res = await authAPI.getMe();
          userData  = res.data?.user;
        } catch { /* fallback below */ }
      }

      if (!userData) {
        try {
          const res = await userAPI.getUserById(id);
          userData  = res.data?.user || res.data;
        } catch {
          // Last resort: fetch all users and find by id
          const res  = await userAPI.getAllUsers();
          const list = Array.isArray(res.data) ? res.data : (res.data?.users || []);
          userData   = list.find((u) => u._id === id);
        }
      }

      if (!userData) { setNotFound(true); return; }
      setProfile(userData);
      // Keep AuthContext in sync when viewing own profile
      if (id === currentUser?._id && updateUser) updateUser(userData);
    } catch (err) {
      console.error('Failed to load user profile:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { doFetch(); }, [id, currentUser?._id]); // eslint-disable-line

  /* ── Manual refresh — unchanged ─────────────────────────────────── */
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await authAPI.getMe();
      if (res.data?.success && res.data.user) {
        setProfile(res.data.user);
        if (updateUser) updateUser(res.data.user);
        toast.success('Profile refreshed');
      }
    } catch {
      toast.error('Could not refresh profile');
    } finally {
      setRefreshing(false);
    }
  };

  /* ── Message handler — unchanged ────────────────────────────────── */
  const handleMessage = async () => {
    if (messaging) return;
    setMessaging(true);
    try {
      const res = await directMessageAPI.getOrCreateConversation(profile._id);
      if (res.data?.success) {
        navigate('/dashboard/chats', {
          state: {
            openChat:       true,
            conversationId: res.data.conversation.conversationId,
            targetUser:     profile,
          },
        });
      } else {
        toast.error('Could not open conversation');
      }
    } catch {
      toast.error('Failed to start conversation');
    } finally {
      setMessaging(false);
    }
  };

  /* ── Video call handler — unchanged ─────────────────────────────── */
  const handleCall = () => {
    if (calling) return;
    if (!socket?.connected) { toast.error('Not connected to server. Please wait…'); return; }
    const roomId = generateRoomId();
    emit('call-user', {
      callerId:     currentUser._id,
      receiverId:   profile._id,
      roomId,
      callerName:   currentUser.username,
      callerAvatar: currentUser.avatar,
    });
    toast.success(`Calling ${profile.username}…`, { duration: 5000 });
    setCalling(true);
    // Navigate caller to room after 1 s; receiver gets incoming-call popup
    callTimerRef.current = setTimeout(() => navigate(`/room/${roomId}`), 1000);
  };

  /* ── Voice / audio call handler — uses AudioCallContext ─────────── */
  const handleVoiceCall = () => {
    if (voiceCalling) return;
    initiateCall(profile._id, profile.username, profile.avatar);
    setVoiceCalling(true);
    voiceCallTimerRef.current = setTimeout(() => setVoiceCalling(false), 6000);
  };

  /* ── Edit profile nav — unchanged ───────────────────────────────── */
  const handleEditProfile = () => navigate('/dashboard/profile');

  /* ── Loading ─────────────────────────────────────────────────────── */
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="text-center">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500 mx-auto mb-3" />
        <p className="text-slate-500 text-sm font-medium">Loading profile…</p>
      </div>
    </div>
  );

  /* ── Not found ───────────────────────────────────────────────────── */
  if (notFound) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6">
      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center">
        <UserX className="w-9 h-9 text-slate-400" />
      </div>
      <h2 className="text-xl font-black text-slate-800">User not found</h2>
      <p className="text-slate-500 text-sm text-center">This profile doesn't exist or was removed.</p>
      <button
        onClick={() => navigate(-1)}
        className="mt-2 flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-all shadow-md active:scale-95"
      >
        <ArrowLeft className="w-4 h-4" /> Go Back
      </button>
    </div>
  );

  /* ── Profile completeness score (own profile nudge) ─────────────── */
  const completedFields = [profile.bio, profile.phone, profile.location, profile.company, profile.avatar].filter(Boolean).length;
  const completePct     = Math.round((completedFields / 5) * 100);

  /* ════════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50">
      <style>{`
        @keyframes fadeUp  { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.93) }     to { opacity:1; transform:scale(1) }      }
        .anim-fade-up  { animation: fadeUp  0.35s ease both; }
        .anim-scale-in { animation: scaleIn 0.3s  ease both; }
      `}</style>

      {/* ════════════════════════════════════════════════════════════
          STICKY TOP BAR
      ════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 px-3 sm:px-5 py-3 flex items-center justify-between gap-2">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900 font-semibold text-sm transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5" /> Back
        </button>

        <span className="text-sm font-bold text-slate-700 truncate max-w-[120px] sm:max-w-xs">
          {profile.username}
        </span>

        {isOwnProfile ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleRefresh} disabled={refreshing}
              title="Refresh profile"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleEditProfile}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          </div>
        ) : (
          <div className="w-12 flex-shrink-0" />
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════
          PAGE BODY
      ════════════════════════════════════════════════════════════ */}
      <div className="max-w-lg mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-3 sm:space-y-4 pb-8">

        {/* ════════════════════════════════════════════════════════
            HERO CARD
        ════════════════════════════════════════════════════════ */}
        <div className="anim-scale-in bg-white rounded-2xl sm:rounded-3xl shadow-sm overflow-hidden">

          {/* Banner */}
          <div className="h-24 sm:h-28 bg-gradient-to-br from-blue-500 via-blue-600 to-violet-700 relative">
            <div className="absolute -top-8 -right-8 w-32 sm:w-36 h-32 sm:h-36 bg-white/10 rounded-full" />
            <div className="absolute -bottom-4 left-4 sm:left-6 w-20 sm:w-24 h-20 sm:h-24 bg-white/10 rounded-full" />
            <div className={`absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-bold ${status.badge} shadow-sm`}>
              <span className={`w-1.5 h-1.5 rounded-full ${status.dot} ${status.pulse ? 'animate-pulse' : ''} flex-shrink-0`} />
              {status.label}
            </div>
          </div>

          {/* Avatar + actions row */}
          <div className="px-4 sm:px-5 pb-4 sm:pb-5">
            <div className="flex items-end justify-between -mt-8 sm:-mt-10 mb-3 gap-2">

              {/* Avatar */}
              <div className="relative flex-shrink-0">
                <img
                  src={profile.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.username}`}
                  alt={profile.username}
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl object-cover ring-4 ring-white shadow-xl"
                  onError={(e) => { e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.username}`; }}
                />
                <span className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-white shadow-sm ${status.dot} ${status.pulse ? 'animate-pulse' : ''}`} />
              </div>

              {/* Action chips */}
              {isOwnProfile ? (
                <button
                  onClick={handleEditProfile}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all active:scale-95 mb-1 flex-shrink-0"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Profile
                </button>
              ) : (
                <div className="flex gap-1.5 sm:gap-2 mb-1 flex-shrink-0">
                  {/* Message chip */}
                  <button
                    onClick={handleMessage} disabled={messaging}
                    title="Send message"
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-60"
                  >
                    {messaging
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <MessageCircle className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Message</span>
                  </button>

                  {/* Voice chip — NEW */}
                  <button
                    onClick={handleVoiceCall} disabled={voiceCalling}
                    title="Voice call"
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-200 active:scale-95 disabled:opacity-60"
                  >
                    {voiceCalling
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <PhoneCall className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Voice</span>
                  </button>

                  {/* Video chip */}
                  <button
                    onClick={handleCall} disabled={calling}
                    title="Video call"
                    className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-blue-200 active:scale-95 disabled:opacity-60"
                  >
                    {calling
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Video className="w-3.5 h-3.5" />}
                    <span className="hidden sm:inline">Call</span>
                  </button>
                </div>
              )}
            </div>

            {/* Name + YOU badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">{profile.username}</h1>
              {isOwnProfile && (
                <span className="text-[10px] font-bold bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">YOU</span>
              )}
            </div>

            {/* Email */}
            {profile.email && (
              <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1 truncate">
                <Mail className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">{profile.email}</span>
              </p>
            )}

            {/* Status badge */}
            <div className="mt-2">
              <StatusBadge status={liveStatus} />
            </div>

            {/* Bio */}
            {profile.bio ? (
              <p className="text-sm text-slate-600 mt-3 leading-relaxed bg-slate-50 rounded-xl px-3 sm:px-4 py-3 border border-slate-100">
                {profile.bio}
              </p>
            ) : isOwnProfile ? (
              <button
                onClick={handleEditProfile}
                className="mt-3 w-full text-sm text-slate-400 bg-slate-50 border border-dashed border-slate-200 rounded-xl px-4 py-3 hover:border-blue-300 hover:text-blue-500 transition-colors text-left"
              >
                ✏️ Add a bio to introduce yourself…
              </button>
            ) : null}
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            STATS ROW
        ════════════════════════════════════════════════════════ */}
        <Card delay={60} className="overflow-hidden">
          <div className="flex divide-x divide-slate-100">
            <StatPill label="Meetings"    value={profile.meetingCount ?? 0} color="text-blue-600"   />
            <StatPill label="Messages"    value={profile.messageCount ?? 0} color="text-violet-600" />
            <StatPill label="Days Active" value={profile.daysActive   ?? 0} color="text-green-600"  />
          </div>
        </Card>

        {/* ════════════════════════════════════════════════════════
            BASIC INFORMATION
        ════════════════════════════════════════════════════════ */}
        <Card delay={100} className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
          <SectionHeader
            icon={User}
            title="Basic Information"
            color="text-blue-500"
            action={isOwnProfile && (
              <button onClick={handleEditProfile} className="text-xs text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-1">
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            )}
          />
          <InfoRow icon={User}  label="Username" value={profile.username} accent="bg-blue-50 text-blue-500"     />
          <InfoRow icon={Mail}  label="Email"    value={profile.email}    accent="bg-indigo-50 text-indigo-500" />
          {profile.phone
            ? <InfoRow icon={Phone} label="Phone" value={profile.phone} accent="bg-green-50 text-green-500" />
            : isOwnProfile
            ? <EmptyFieldRow icon={Phone} label="Phone" accent="bg-green-50 text-green-500" onEdit={handleEditProfile} />
            : null}
          {profile.bio
            ? <InfoRow icon={Info} label="Bio" value={profile.bio} accent="bg-amber-50 text-amber-500" />
            : isOwnProfile
            ? <EmptyFieldRow icon={Info} label="Bio" accent="bg-amber-50 text-amber-500" onEdit={handleEditProfile} />
            : null}
          {!isOwnProfile && !profile.email && !profile.phone && !profile.bio && (
            <p className="text-sm text-slate-400 text-center py-4">No contact info available</p>
          )}
        </Card>

        {/* ════════════════════════════════════════════════════════
            ADDITIONAL INFORMATION
        ════════════════════════════════════════════════════════ */}
        <Card delay={140} className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
          <SectionHeader
            icon={Briefcase}
            title="Additional Information"
            color="text-violet-500"
            action={isOwnProfile && (
              <button onClick={handleEditProfile} className="text-xs text-blue-500 hover:text-blue-700 font-semibold flex items-center gap-1">
                <Edit2 className="w-3 h-3" /> Edit
              </button>
            )}
          />
          {profile.location
            ? <InfoRow icon={MapPin}    label="Location"               value={profile.location} accent="bg-orange-50 text-orange-500" />
            : isOwnProfile
            ? <EmptyFieldRow icon={MapPin} label="Location" accent="bg-orange-50 text-orange-500" onEdit={handleEditProfile} />
            : null}
          {profile.company
            ? <InfoRow icon={Briefcase} label="Company / Organization" value={profile.company}  accent="bg-violet-50 text-violet-500" />
            : isOwnProfile
            ? <EmptyFieldRow icon={Briefcase} label="Company" accent="bg-violet-50 text-violet-500" onEdit={handleEditProfile} />
            : null}
          <InfoRow
            icon={Calendar} label="Member Since"
            value={formatJoined(profile.createdAt)}
            accent="bg-slate-50 text-slate-400"
          />
          <InfoRow
            icon={Clock} label="Last Seen"
            value={isOnline ? 'Active right now' : getLastSeen(profile.lastSeen)}
            accent="bg-slate-50 text-slate-400"
            valueClass={isOnline ? 'text-green-600 font-semibold' : ''}
          />
          {!isOwnProfile && !profile.location && !profile.company && (
            <p className="text-sm text-slate-400 text-center py-4">No additional information</p>
          )}
        </Card>

        {/* ════════════════════════════════════════════════════════
            PROFILE COMPLETENESS — own profile only
        ════════════════════════════════════════════════════════ */}
        {isOwnProfile && completePct < 100 && (
          <Card delay={170} className="px-4 sm:px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-bold text-slate-700">Profile completeness</p>
              <span className="text-sm font-black text-blue-600">{completePct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${completePct}%` }}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Complete your profile so others know you better.{' '}
              <button onClick={handleEditProfile} className="text-blue-500 hover:underline font-semibold">
                Fill in missing fields →
              </button>
            </p>
          </Card>
        )}

        {/* ════════════════════════════════════════════════════════
            CONNECTION STATUS CARD
        ════════════════════════════════════════════════════════ */}
        <Card delay={200} className="px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4">
          <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isOnline ? 'bg-green-50' : 'bg-slate-100'}`}>
            {isOnline
              ? <Wifi    className="w-4 h-4 sm:w-5 sm:h-5 text-green-500" />
              : <WifiOff className="w-4 h-4 sm:w-5 sm:h-5 text-slate-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-800">
              {isOnline ? 'Currently online' : 'Currently offline'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5 truncate">
              {isOnline ? 'Available for calls and messages' : `Last seen ${getLastSeen(profile.lastSeen)}`}
            </p>
          </div>
          {isOnline && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 font-bold flex-shrink-0">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live
            </div>
          )}
        </Card>

        {/* ════════════════════════════════════════════════════════
            ACCOUNT SECURITY — own profile only
        ════════════════════════════════════════════════════════ */}
        {isOwnProfile && (
          <Card delay={230} className="px-4 sm:px-5 py-4 sm:py-5">
            <SectionHeader icon={Shield} title="Account Security" color="text-slate-500" />
            <div className="bg-slate-50 rounded-xl p-3 sm:p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-700">Password</p>
                <p className="text-xs text-slate-400 mt-0.5">Last changed: unknown</p>
              </div>
              <span className="text-sm bg-slate-200 text-slate-500 px-2 sm:px-3 py-1.5 rounded-lg font-mono tracking-widest select-none flex-shrink-0">
                ●●●●●●●●
              </span>
            </div>
            <div className="flex items-center justify-between mt-3 gap-2">
              <p className="text-xs text-slate-400">
                Manage your password in{' '}
                <span className="text-blue-500 font-medium">Settings → Security</span>
              </p>
              <button
                onClick={() => navigate('/dashboard/settings')}
                className="text-xs text-blue-500 hover:text-blue-700 font-bold flex-shrink-0"
              >
                Go →
              </button>
            </div>
          </Card>
        )}

        {/* ════════════════════════════════════════════════════════
            FULL-WIDTH ACTION BUTTONS — other user only
            3 cols: Message | Voice Call | Video Call
        ════════════════════════════════════════════════════════ */}
        {!isOwnProfile && (
          <div
            className="anim-fade-up grid grid-cols-3 gap-2 sm:gap-3 pb-2"
            style={{ animationDelay: '250ms' }}
          >
            {/* Message */}
            <button
              onClick={handleMessage} disabled={messaging}
              className="flex flex-col items-center justify-center gap-1.5 py-3.5 sm:py-4 rounded-2xl bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 hover:text-violet-700 font-bold text-xs transition-all shadow-sm active:scale-95 disabled:opacity-60"
            >
              {messaging ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />}
              Message
            </button>

            {/* Voice Call — NEW */}
            <button
              onClick={handleVoiceCall} disabled={voiceCalling}
              className="flex flex-col items-center justify-center gap-1.5 py-3.5 sm:py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs transition-all shadow-lg shadow-emerald-200 active:scale-95 disabled:opacity-60"
            >
              {voiceCalling ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5" />}
              Voice Call
            </button>

            {/* Video Call */}
            <button
              onClick={handleCall} disabled={calling}
              className="flex flex-col items-center justify-center gap-1.5 py-3.5 sm:py-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs transition-all shadow-lg shadow-blue-200 active:scale-95 disabled:opacity-60"
            >
              {calling ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Video className="w-4 h-4 sm:w-5 sm:h-5" />}
              Video Call
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default UserProfilePage;