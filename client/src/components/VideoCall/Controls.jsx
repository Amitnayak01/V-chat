import { useState, memo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff,
  LayoutGrid, Users, MessageCircle, Hand, MoreHorizontal,
  SwitchCamera, UserCheck, MicOff as MuteAllIcon,
  Radio, StopCircle, Smile,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN: "Frosted command deck"
// Deep navy glass surface, razor-thin borders, status indicators that live
// inside the bar. Breakpoints: xs(<480) sm(480) md(640) lg(1024)
// ─────────────────────────────────────────────────────────────────────────────

const fmtDur = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// ── Pulsing REC indicator ─────────────────────────────────────────────────────
const RecIndicator = ({ duration }) => (
  <motion.div
    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full
               bg-red-500/15 border border-red-500/30 backdrop-blur-sm"
  >
    <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
    </span>
    <span className="text-red-300 text-[10px] font-bold tracking-widest uppercase">REC</span>
    {duration > 0 && (
      <span className="font-mono text-red-200 text-[10px] font-bold tabular-nums ml-0.5">
        {fmtDur(duration)}
      </span>
    )}
  </motion.div>
);

// ── Screen share indicator ────────────────────────────────────────────────────
const ShareIndicator = () => (
  <motion.div
    initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full
               bg-sky-500/15 border border-sky-500/30 backdrop-blur-sm"
  >
    <MonitorUp className="w-3 h-3 text-sky-400" />
    <span className="text-sky-300 text-[10px] font-bold tracking-widest uppercase">Sharing</span>
  </motion.div>
);

// ── Status bar ────────────────────────────────────────────────────────────────
const StatusBar = ({ isRecording, isScreenSharing, recordingDuration }) => (
  <AnimatePresence>
    {(isRecording || isScreenSharing) && (
      <motion.div
        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden"
      >
        <div className="flex items-center justify-center gap-2 pt-2 pb-1 px-4">
          {isRecording  && <RecIndicator duration={recordingDuration} />}
          {isScreenSharing && <ShareIndicator />}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

// ── Tooltip (desktop only) ────────────────────────────────────────────────────
const Tip = ({ label, children }) => (
  <div className="group relative flex items-center justify-center">
    {children}
    <div className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2
                    opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50
                    hidden lg:block">
      <div className="bg-[#1e2130] border border-white/10 text-white text-[11px] font-medium
                      px-2.5 py-1 rounded-lg shadow-xl whitespace-nowrap">
        {label}
      </div>
      <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4
                      border-r-4 border-t-4 border-l-transparent border-r-transparent
                      border-t-[#1e2130]" />
    </div>
  </div>
);

// ── Emoji picker ──────────────────────────────────────────────────────────────
const EMOJIS = ['❤️', '😂', '👏', '🎉', '👍', '🔥'];
const EmojiPicker = memo(({ onSelect, onClose }) => (
  <motion.div
    initial={{ opacity: 0, y: 8, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 8, scale: 0.95 }}
    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
    className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50
               flex gap-0.5 p-2 rounded-2xl
               bg-[#0d1017]/96 backdrop-blur-xl border border-white/10
               shadow-2xl shadow-black/70"
  >
    {EMOJIS.map(e => (
      <motion.button
        key={e} whileHover={{ scale: 1.3, y: -5 }} whileTap={{ scale: 0.9 }}
        onClick={() => { onSelect(e); onClose(); }}
        className="w-10 h-10 text-xl flex items-center justify-center rounded-xl
                   hover:bg-white/8 transition-colors"
      >
        {e}
      </motion.button>
    ))}
  </motion.div>
));
EmojiPicker.displayName = 'EmojiPicker';

// ── More drawer ───────────────────────────────────────────────────────────────
const MoreDrawer = memo(({ items, onClose }) => {
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h); };
  }, [onClose]);

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="absolute bottom-full mb-2 right-0 z-50
                 w-56 rounded-2xl overflow-hidden
                 bg-[#0d1017]/98 backdrop-blur-xl border border-white/10
                 shadow-2xl shadow-black/70"
    >
      {items.map((item, i) => (
        <motion.button
          key={i} whileTap={{ scale: 0.97 }}
          onClick={() => { item.onClick?.(); onClose(); }}
          className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors
                      hover:bg-white/6
                      ${i < items.length - 1 ? 'border-b border-white/5' : ''}
                      ${item.danger ? 'text-red-400' : 'text-slate-200'}`}
        >
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
            ${item.danger ? 'bg-red-500/15' : 'bg-white/6'}`}>
            <item.icon className={`w-4 h-4 ${item.danger ? 'text-red-400' : 'text-slate-400'}`} />
          </div>
          <span className="flex-1 text-left font-medium">{item.label}</span>
          {item.trailing}
        </motion.button>
      ))}
    </motion.div>
  );
});
MoreDrawer.displayName = 'MoreDrawer';

// ── Core button primitive ─────────────────────────────────────────────────────
const Btn = memo(({
  onClick, label, title, icon: Icon, iconEl,
  variant = 'default',   // 'default' | 'active' | 'danger' | 'end'
  pulse = false,
  badge = 0,
  size = 'md',           // 'sm' | 'md' | 'lg'
  showLabel = true,
  disabled = false,
}) => {
  const iconCls = { sm: 'w-4 h-4',         md: 'w-[18px] h-[18px]', lg: 'w-5 h-5'   }[size];
  const btnCls  = { sm: 'w-9 h-9',         md: 'w-11 h-11',          lg: 'w-12 h-12' }[size];
  const bg = {
    default: 'bg-white/7 hover:bg-white/12 border border-white/8 text-slate-200 hover:text-white',
    active:  'bg-blue-500/20 hover:bg-blue-500/28 border border-blue-500/35 text-blue-300',
    danger:  'bg-red-500/18 hover:bg-red-500/28 border border-red-500/30 text-red-300',
    end:     'bg-red-600 hover:bg-red-700 border border-red-500/40 text-white shadow-lg shadow-red-900/50',
  }[variant];

  return (
    <div className="relative flex flex-col items-center gap-1 select-none">
      <motion.button
        whileTap={{ scale: 0.87 }} whileHover={{ scale: disabled ? 1 : 1.05 }}
        onClick={onClick} disabled={disabled} title={title || label}
        className={`
          ${btnCls} rounded-2xl flex items-center justify-center transition-all duration-150
          touch-manipulation ${bg}
          ${pulse ? 'animate-pulse' : ''}
          ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
        `}
      >
        {iconEl ?? (Icon && <Icon className={iconCls} />)}
      </motion.button>
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500
                         rounded-full flex items-center justify-center pointer-events-none
                         text-[9px] font-bold text-white px-0.5 ring-2 ring-slate-950 z-10">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {showLabel && label && (
        <span className={`
          text-[10px] font-medium leading-none text-center truncate max-w-[54px]
          pointer-events-none transition-colors
          ${variant === 'end'    ? 'text-red-400'
          : variant === 'danger' ? 'text-red-400'
          : variant === 'active' ? 'text-blue-400'
          : 'text-slate-500 group-hover:text-slate-400'}
        `}>
          {label}
        </span>
      )}
    </div>
  );
});
Btn.displayName = 'Btn';

const Divider = () => <div className="w-px h-8 bg-white/7 flex-shrink-0 mx-0.5 lg:mx-1" />;

// ─────────────────────────────────────────────────────────────────────────────
// CALL CONTROLS — floating pill above video
// ─────────────────────────────────────────────────────────────────────────────
const CallControls = memo(({
  isMuted, isVideoOff, isScreenSharing, isRecording,
  onToggleMute, onToggleVideo, onToggleScreenShare,
  onToggleRecording, onEndCall, onSwitchCamera,
  onReaction, recordingDuration = 0,
}) => {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMore,  setShowMore]  = useState(false);

  const [callWinW, setCallWinW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setCallWinW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const callIsMd = callWinW >= 768; // md: screen share + record shown inline

  const moreItems = [
    // Flip camera always in drawer (never shown inline)
    { icon: SwitchCamera, label: 'Flip Camera', onClick: onSwitchCamera },
    // Screen share: shown inline md+, in drawer only on <md
    ...(!callIsMd ? [{ icon: MonitorUp, label: isScreenSharing ? 'Stop Sharing' : 'Share Screen', onClick: onToggleScreenShare }] : []),
    // Record: shown inline md+, in drawer only on <md
    ...(!callIsMd ? [{
      icon: isRecording ? StopCircle : Radio,
      label: isRecording ? 'Stop Recording' : 'Start Recording',
      danger: isRecording, onClick: onToggleRecording,
      trailing: isRecording && recordingDuration > 0
        ? <span className="font-mono text-[10px] text-red-300 tabular-nums">{fmtDur(recordingDuration)}</span>
        : null,
    }] : []),
  ];

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center
                    pb-[env(safe-area-inset-bottom,0px)]">
      <StatusBar isRecording={isRecording} isScreenSharing={isScreenSharing} recordingDuration={recordingDuration} />

      <div className="w-full flex justify-center px-3 pb-4 sm:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28, delay: 0.05 }}
          className="relative flex items-end gap-2 sm:gap-2.5 lg:gap-3
                     px-3 sm:px-4 lg:px-6 py-3 sm:py-3.5
                     bg-[#080c12]/92 backdrop-blur-2xl
                     rounded-[22px] border border-white/8"
          style={{ boxShadow: '0 8px 48px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.055)' }}
        >

          <Tip label={isMuted ? 'Unmute' : 'Mute'}>
            <Btn icon={isMuted ? MicOff : Mic}   label={isMuted ? 'Unmute' : 'Mute'}
              variant={isMuted ? 'danger' : 'default'} onClick={onToggleMute} />
          </Tip>

          <Tip label={isVideoOff ? 'Start Camera' : 'Stop Camera'}>
            <Btn icon={isVideoOff ? VideoOff : Video} label={isVideoOff ? 'Start' : 'Stop'}
              variant={isVideoOff ? 'danger' : 'default'} onClick={onToggleVideo} />
          </Tip>

          {/* Screen share — hidden on small, shown md+ */}
          <div className="hidden md:block">
            <Tip label={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}>
              <Btn icon={MonitorUp} label={isScreenSharing ? 'Sharing' : 'Share'}
                variant={isScreenSharing ? 'active' : 'default'} onClick={onToggleScreenShare} />
            </Tip>
          </div>

          {/* Record — hidden on small, shown md+ */}
          <div className="hidden md:block">
            <Tip label={isRecording ? 'Stop Recording' : 'Record'}>
              <Btn icon={isRecording ? StopCircle : Radio}
                label={isRecording ? fmtDur(recordingDuration) : 'Record'}
                variant={isRecording ? 'danger' : 'default'} pulse={isRecording}
                onClick={onToggleRecording} />
            </Tip>
          </div>

          {/* Reactions */}
          <div className="relative">
            <AnimatePresence>
              {showEmoji && (
                <EmojiPicker onSelect={e => onReaction?.(e)} onClose={() => setShowEmoji(false)} />
              )}
            </AnimatePresence>
            <Tip label="Reactions">
              <Btn iconEl={<Smile className="w-[18px] h-[18px]" />} label="React"
                variant={showEmoji ? 'active' : 'default'} onClick={() => setShowEmoji(v => !v)} />
            </Tip>
          </div>

          {/* More — hides overflow items on small screens */}
          <div className="relative">
            <AnimatePresence>
              {showMore && <MoreDrawer items={moreItems} onClose={() => setShowMore(false)} />}
            </AnimatePresence>
            <Tip label="More">
              <Btn icon={MoreHorizontal} label="More"
                variant={showMore ? 'active' : 'default'} onClick={() => setShowMore(v => !v)} />
            </Tip>
          </div>

          <Divider />

          <Tip label="End Call">
            <Btn icon={PhoneOff} label="End" variant="end" size="lg" onClick={onEndCall} />
          </Tip>

        </motion.div>
      </div>
    </div>
  );
});
CallControls.displayName = 'CallControls';


// ─────────────────────────────────────────────────────────────────────────────
// MEETING CONTROLS — anchored bottom bar
// ─────────────────────────────────────────────────────────────────────────────
const MeetingControls = memo(({
  isMuted, isVideoOff, isScreenSharing, isRecording,
  onToggleMute, onToggleVideo, onToggleScreenShare,
  onToggleRecording, onEndCall,
  participantCount = 0,
  onToggleChat, isChatOpen,
  onToggleParticipants, isParticipantsOpen,
  viewMode, onToggleViewMode,
  onRaiseHand, handRaised,
  raisedHandCount = 0,
  // ── MUTE SYSTEM ──────────────────────────────────────────────────────────
  isHost          = false,   // only host sees Mute Everyone
  isForceMuted    = false,   // this user was muted by host
  allowSelfUnmute = true,    // host's permission flag
  onMuteAll,                 // host action: mute all
  onToggleAllowUnmute,       // host action: toggle self-unmute permission
  // ─────────────────────────────────────────────────────────────────────────
  onReaction,
  unreadCount = 0,
  recordingDuration = 0,
}) => {
  const [showEmoji, setShowEmoji] = useState(false);
  const [showMore,  setShowMore]  = useState(false);

  // useWindowWidth tracks viewport width so moreItems only contains
  // actions NOT already visible inline in the bar.
  // md = 640px: Hand becomes inline. lg = 1024px: View + Record become inline.
  const [winW, setWinW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const handler = () => setWinW(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const isMd = winW >= 640;   // matches Tailwind md:
  const isLg = winW >= 1024;  // matches Tailwind lg:

  // Build drawer items — only include what's NOT shown inline
  const moreItems = [
    // Raise hand: hidden on <md, shown inline md+, so only show in drawer on <md
    ...(!isMd ? [{ icon: Hand, label: handRaised ? 'Lower Hand' : 'Raise Hand', onClick: onRaiseHand }] : []),
    // View toggle: hidden on <lg, shown inline lg+
    ...(!isLg ? [{ icon: viewMode === 'grid' ? UserCheck : LayoutGrid,
      label: viewMode === 'grid' ? 'Speaker View' : 'Grid View', onClick: onToggleViewMode }] : []),
    // ── MUTE SYSTEM: host-only actions ──────────────────────────────────
    ...(isHost ? [
      { icon: MuteAllIcon, label: 'Mute Everyone', onClick: onMuteAll },
      {
        icon: MuteAllIcon,
        label: allowSelfUnmute ? '🔒 Prevent Self-Unmute' : '🔓 Allow Self-Unmute',
        onClick: () => onToggleAllowUnmute?.(!allowSelfUnmute),
      },
    ] : []),
    // Record: hidden on <lg, shown inline lg+
    ...(!isLg ? [{
      icon: isRecording ? StopCircle : Radio,
      label: isRecording ? 'Stop Recording' : 'Start Recording',
      danger: isRecording, onClick: onToggleRecording,
      trailing: isRecording && recordingDuration > 0
        ? <span className="font-mono text-[10px] text-red-300 tabular-nums">{fmtDur(recordingDuration)}</span>
        : null,
    }] : []),
  ];

  return (
    <div
      className="relative bg-[#07090f]/95 backdrop-blur-2xl border-t border-white/6
                 pb-[env(safe-area-inset-bottom,0px)]"
      style={{ boxShadow: '0 -1px 0 rgba(255,255,255,0.035), 0 -12px 40px rgba(0,0,0,0.55)' }}
    >
      <StatusBar isRecording={isRecording} isScreenSharing={isScreenSharing} recordingDuration={recordingDuration} />

      {/* Reaction picker — centred above bar */}
      <AnimatePresence>
        {showEmoji && (
          <div className="absolute bottom-full left-0 right-0 z-50 flex justify-center pointer-events-none">
            <div className="pointer-events-auto">
              <EmojiPicker onSelect={e => onReaction?.(e)} onClose={() => setShowEmoji(false)} />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* More drawer — moved inside the More button's relative container below */}

      {/* ── Button row
           Layout rules:
           • xs (<480px):  mute · cam · [share] · chat · people · react · more · END
           • sm (480+):    + screen share visible, more compact
           • md (640+):    + raise hand, record in More still
           • lg (1024+):   + view toggle, record visible, full spacing
          ── */}
      <div className="flex items-center justify-center flex-wrap sm:flex-nowrap
                      gap-0.5 xs:gap-1 sm:gap-1.5 lg:gap-2
                      px-2 sm:px-4 lg:px-8 py-2.5 sm:py-3 lg:py-3.5">

        {/* ── PRIMARY ── */}
        {/* Mic button: shows a locked red state when host has force-muted and
            self-unmute is disabled, amber "tap to unmute" state when allowed */}
        <Tip label={
          isForceMuted && !allowSelfUnmute
            ? 'Muted by host (locked)'
            : isForceMuted && allowSelfUnmute
              ? 'Muted by host — tap to unmute'
              : isMuted ? 'Unmute' : 'Mute'
        }>
          <div className="relative">
            {/* Locked pulse ring when host has disabled self-unmute */}
            {isForceMuted && !allowSelfUnmute && (
              <span className="absolute inset-0 rounded-2xl animate-ping bg-red-500/25 pointer-events-none" />
            )}
            <Btn
              icon={isMuted ? MicOff : Mic}
              label={isForceMuted && !allowSelfUnmute ? 'Locked' : isMuted ? 'Unmute' : 'Mute'}
              variant={isMuted ? 'danger' : 'default'}
              onClick={onToggleMute}
              disabled={isForceMuted && !allowSelfUnmute}
            />
            {/* Host-muted badge — small lock icon overlaid on button */}
            {isForceMuted && (
              <span
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center
                           pointer-events-none z-10 ring-2 ring-slate-950
                           bg-red-600 text-white text-[9px] font-bold"
                title={allowSelfUnmute ? 'Muted by host' : 'Muted by host (locked)'}
              >
                {allowSelfUnmute ? '!' : '🔒'}
              </span>
            )}
          </div>
        </Tip>

        <Tip label={isVideoOff ? 'Start Camera' : 'Stop Camera'}>
          <Btn icon={isVideoOff ? VideoOff : Video} label={isVideoOff ? 'Start' : 'Camera'}
            variant={isVideoOff ? 'danger' : 'default'} onClick={onToggleVideo} />
        </Tip>

        <Tip label={isScreenSharing ? 'Stop Sharing' : 'Share Screen'}>
          <Btn icon={MonitorUp} label={isScreenSharing ? 'Sharing' : 'Share'}
            variant={isScreenSharing ? 'active' : 'default'} onClick={onToggleScreenShare} />
        </Tip>

        <div className="hidden sm:block"><Divider /></div>

        {/* ── SECONDARY ── */}
        <Tip label="Chat">
          <Btn icon={MessageCircle} label="Chat"
            variant={isChatOpen ? 'active' : 'default'}
            badge={isChatOpen ? 0 : unreadCount}
            onClick={onToggleChat} />
        </Tip>

        <Tip label={`People (${participantCount})`}>
          <Btn icon={Users}
            label={participantCount > 0 ? `${participantCount}` : 'People'}
            variant={isParticipantsOpen ? 'active' : 'default'}
            onClick={onToggleParticipants} />
        </Tip>

        {/* Reactions */}
        <div className="relative">
          <Tip label="Reactions">
            <Btn iconEl={<Smile className="w-[18px] h-[18px]" />} label="React"
              variant={showEmoji ? 'active' : 'default'} onClick={() => setShowEmoji(v => !v)} />
          </Tip>
        </div>

        {/* ── RAISE HAND: md+ inline — amber pulse ring when others have hands up ── */}
        <div className="hidden md:block">
          <Tip label={handRaised ? 'Lower Hand ✋' : raisedHandCount > 0 ? `Raise Hand (${raisedHandCount} raised)` : 'Raise Hand'}>
            <div className="relative">
              {/* Amber pulse ring shown when there are raised hands and own hand is down */}
              {raisedHandCount > 0 && !handRaised && (
                <span className="absolute inset-0 rounded-2xl animate-ping bg-amber-400/30 pointer-events-none" />
              )}
              <Btn
                icon={Hand}
                label={handRaised ? 'Lower' : 'Hand'}
                variant={handRaised ? 'active' : 'default'}
                onClick={onRaiseHand}
                badge={raisedHandCount > 0 && !handRaised ? raisedHandCount : 0}
              />
            </div>
          </Tip>
        </div>

        {/* View toggle — lg+ inline */}
        <div className="hidden lg:block">
          <Tip label={viewMode === 'grid' ? 'Speaker View' : 'Grid View'}>
            <Btn icon={viewMode === 'grid' ? UserCheck : LayoutGrid}
              label={viewMode === 'grid' ? 'Speaker' : 'Grid'}
              onClick={onToggleViewMode} />
          </Tip>
        </div>

        {/* Record — lg+ inline */}
        <div className="hidden lg:block">
          <Tip label={isRecording ? 'Stop Recording' : 'Record'}>
            <Btn icon={isRecording ? StopCircle : Radio}
              label={isRecording ? fmtDur(recordingDuration) : 'Record'}
              variant={isRecording ? 'danger' : 'default'} pulse={isRecording}
              onClick={onToggleRecording} />
          </Tip>
        </div>

        {/* More — drawer anchored directly above this button */}
        <div className="relative">
          <AnimatePresence>
            {showMore && (
              <MoreDrawer items={moreItems} onClose={() => setShowMore(false)} />
            )}
          </AnimatePresence>
          <Tip label="More">
            <Btn icon={MoreHorizontal} label="More"
              variant={showMore ? 'active' : 'default'} onClick={() => setShowMore(v => !v)} />
          </Tip>
        </div>

        <div className="hidden sm:block"><Divider /></div>

        {/* ── END — always last, always red ── */}
        <Tip label="Leave">
          <Btn icon={PhoneOff} label="End" variant="end" size="lg" onClick={onEndCall} />
        </Tip>

      </div>
    </div>
  );
});
MeetingControls.displayName = 'MeetingControls';


// ─────────────────────────────────────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────────────────────────────────────
const Controls = memo(({ mode = 'call', ...props }) => (
  <AnimatePresence mode="wait">
    {mode === 'meeting' ? (
      <motion.div key="meeting"
        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }}
      >
        <MeetingControls {...props} />
      </motion.div>
    ) : (
      <motion.div key="call"
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.22 }}
        className="absolute bottom-0 left-0 right-0 z-10"
      >
        <CallControls {...props} />
      </motion.div>
    )}
  </AnimatePresence>
));
Controls.displayName = 'Controls';

export default Controls;