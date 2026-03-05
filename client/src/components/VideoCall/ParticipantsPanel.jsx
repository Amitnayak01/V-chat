import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, MicOff, VideoOff, Pin, UserX } from 'lucide-react';

// ── Avatar colour ──────────────────────────────────────────────────────────
const avatarHue = (name = '') =>
  ((name.charCodeAt(0) ?? 65) * 137 + (name.charCodeAt(1) ?? 0) * 31) % 360;

// ── Participant row ────────────────────────────────────────────────────────
const ParticipantRow = memo(({
  participant,
  isLocal,
  isActive,
  handRaised,
  forceMuted,   // ← host has force-muted this participant
  isHost,       // ← local user is the host (shows mute actions)
  onPin,
  onMute,
  onRemove,
}) => {
  const hue = avatarHue(participant.username);

  return (
    <motion.div
      layout
      layoutId={`participant-row-${participant.userId}`}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12 }}
      className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all group
        ${handRaised
          ? 'bg-amber-500/10 border border-amber-500/25'
          : forceMuted
            ? 'bg-red-500/8 border border-red-500/15'
            : isActive
              ? 'bg-emerald-500/10 border border-emerald-500/25'
              : 'hover:bg-white/5 border border-transparent'}`}
    >
      {/* Avatar */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center
                   text-white text-xs font-bold flex-shrink-0 relative"
        style={{ background: `hsl(${hue},48%,34%)` }}
      >
        {participant.username.charAt(0).toUpperCase()}

        {/* ── RAISE HAND: animated ✋ badge overlays the speaking dot ── */}
        <AnimatePresence>
          {handRaised && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 22 }}
              className="absolute -bottom-1 -right-1 text-[13px] leading-none select-none"
              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
            >
              ✋
            </motion.span>
          )}
        </AnimatePresence>

        {/* Speaking dot — only when not hand-raised */}
        {!handRaised && isActive && (
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full
                           bg-emerald-400 border-2 border-slate-900 animate-pulse" />
        )}
      </div>

      {/* Name + status label */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">
          {participant.username}
          {isLocal && <span className="text-slate-400 font-normal"> (You)</span>}
        </p>
        {/* Priority: raise hand > force-muted > speaking */}
        {handRaised ? (
          <p className="text-amber-400 text-[10px] leading-tight font-medium">✋ Hand raised</p>
        ) : forceMuted ? (
          <p className="text-red-400 text-[10px] leading-tight font-medium flex items-center gap-0.5">
            🔇 Muted by host
          </p>
        ) : isActive ? (
          <p className="text-emerald-400 text-[10px] leading-tight">Speaking…</p>
        ) : null}
      </div>

      {/* Status icons — always visible */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Force-muted icon: bright red, distinct from regular self-mute */}
        {forceMuted ? (
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center"
            title="Muted by host"
          >
            <MicOff className="w-2.5 h-2.5 text-white" />
          </motion.div>
        ) : participant.isMuted ? (
          <MicOff className="w-3.5 h-3.5 text-red-400" />
        ) : null}
        {participant.isVideoOff && (
          <VideoOff className="w-3.5 h-3.5 text-slate-500" />
        )}
      </div>

      {/* Host actions — appear on hover (only shown to the host) */}
      {!isLocal && isHost && (
        <div className="hidden group-hover:flex items-center gap-1 flex-shrink-0">
          {onPin && (
            <button
              onClick={() => onPin(participant.userId)}
              title="Pin participant"
              className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 flex items-center
                         justify-center text-slate-300 transition-all"
            >
              <Pin className="w-3 h-3" />
            </button>
          )}
          {onMute && (
            <button
              onClick={() => onMute(participant.userId)}
              title="Mute"
              className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 flex items-center
                         justify-center text-slate-300 transition-all"
            >
              <MicOff className="w-3 h-3" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(participant.userId)}
              title="Remove from call"
              className="w-6 h-6 rounded bg-red-500/20 hover:bg-red-500/40 flex items-center
                         justify-center text-red-400 transition-all"
            >
              <UserX className="w-3 h-3" />
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
});
ParticipantRow.displayName = 'ParticipantRow';

// ─────────────────────────────────────────────────────────────────────────────
const ParticipantsPanel = memo(({
  isOpen,
  onClose,
  participants       = [],
  localUserId,
  activeSpeaker,
  handRaisedIds      = new Set(),
  forceMutedIds      = new Set(),   // ← Set of userIds force-muted by host
  isHost             = false,        // ← whether local user is the host
  onPinParticipant,
  onMuteParticipant,
  onRemoveParticipant,
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="participants"
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0,      opacity: 1 }}
          exit={{ x: '100%',    opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 34 }}
          className="w-72 bg-slate-900/98 backdrop-blur-sm border-l border-white/10
                     flex flex-col h-full flex-shrink-0"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
            <div>
              {/* ── RAISE HAND: count pill in header ── */}
              <div className="flex items-center gap-2">
                <h3 className="text-white font-semibold text-sm">Participants</h3>
                <AnimatePresence>
                  {handRaisedIds.size > 0 && (
                    <motion.span
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                      className="flex items-center gap-0.5 bg-amber-500/20 border border-amber-500/30
                                 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    >
                      ✋ {handRaisedIds.size}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-slate-500 text-[10px]">{participants.length} in call</p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20
                         flex items-center justify-center text-slate-300 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto px-3 py-2 min-h-0">
            {participants.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-slate-500 text-xs">
                No participants yet
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {participants.map(p => (
                  <ParticipantRow
                    key={p.userId ?? p}
                    participant={typeof p === 'string' ? { userId: p, username: p.slice(0, 6) } : p}
                    isLocal={p.userId === localUserId}
                    isActive={activeSpeaker === p.userId}
                    handRaised={handRaisedIds.has(p.userId)}
                    forceMuted={forceMutedIds.has(p.userId)}
                    isHost={isHost}
                    onPin={onPinParticipant}
                    onMute={onMuteParticipant}
                    onRemove={onRemoveParticipant}
                  />
                ))}
              </AnimatePresence>
            )}
          </div>

          <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
        </motion.div>
      )}
    </AnimatePresence>
  );
});

ParticipantsPanel.displayName = 'ParticipantsPanel';
export default ParticipantsPanel;