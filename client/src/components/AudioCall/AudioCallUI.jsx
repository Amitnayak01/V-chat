

import { useEffect, useRef, useState, useCallback } from 'react';
import { Mic, MicOff, PhoneOff, Phone, Users } from 'lucide-react';
import { useAudioCall } from "../../context/AudioCallContext";

// ─── Format MM:SS ─────────────────────────────────────────────────────────────
const fmt = (s) =>
  `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

// ─── Waveform bars (animated when speaking) ───────────────────────────────────
const Bars = ({ active, color = '#10b981' }) => (
  <div className="flex items-end gap-[2px] h-4">
    {[0.5, 0.9, 0.6, 1, 0.7, 0.85, 0.55].map((h, i) => (
      <span
        key={i}
        style={{
          width: 2,
          height: active ? `${h * 100}%` : '30%',
          background: color,
          borderRadius: 2,
          transition: 'height 0.12s ease',
          animation: active
            ? `callBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`
            : 'none',
        }}
      />
    ))}
  </div>
);

// ─── Avatar bubble ────────────────────────────────────────────────────────────
const AvatarBubble = ({ avatar, name, size = 80, speaking = false }) => (
  <div
    className="relative flex-shrink-0"
    style={{ width: size, height: size }}
  >
    {speaking && (
      <span
        className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping"
        style={{ animationDuration: '1s' }}
      />
    )}
    <div
      className="relative w-full h-full rounded-full overflow-hidden"
      style={{
        boxShadow: speaking
          ? '0 0 0 3px #10b981, 0 8px 24px rgba(16,185,129,0.35)'
          : '0 4px 16px rgba(0,0,0,0.4)',
        transition: 'box-shadow 0.25s ease',
      }}
    >
      {avatar ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-bold text-white select-none"
          style={{
            background: 'linear-gradient(135deg, #0f766e, #0891b2)',
            fontSize: size * 0.35,
          }}
        >
          {name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  </div>
);

// ─── Participant tile (group calls) ───────────────────────────────────────────
const ParticipantTile = ({ participant, speaking }) => (
  <div className="flex flex-col items-center gap-2 p-3">
    <AvatarBubble
      avatar={participant.avatar}
      name={participant.username}
      size={56}
      speaking={speaking}
    />
    <div className="text-center">
      <p className="text-white text-xs font-semibold truncate max-w-[64px]">
        {participant.username}
      </p>
      {speaking && <Bars active color="#10b981" />}
    </div>
  </div>
);

// ─── Control button ───────────────────────────────────────────────────────────
const ControlBtn = ({ icon: Icon, label, onClick, variant = 'default' }) => {
  const styles = {
    default: 'bg-white/10 hover:bg-white/20 text-white border border-white/10',
    muted:   'bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30',
    end:     'bg-rose-600 hover:bg-rose-700 text-white border border-rose-500/30 shadow-lg shadow-rose-900/50',
  };
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 group active:scale-90 transition-transform`}
    >
      <div
        className={`w-14 h-14 rounded-2xl flex items-center justify-center backdrop-blur-sm ${styles[variant]} transition-all duration-150`}
      >
        <Icon className="w-6 h-6" strokeWidth={2} />
      </div>
      <span className="text-[10px] font-semibold text-slate-400 group-hover:text-slate-300">
        {label}
      </span>
    </button>
  );
};

// ─── Remote audio player: attaches remote MediaStream to an <audio> element ──
const RemoteAudio = ({ userId, stream }) => {
  const audioRef = useRef(null);
  useEffect(() => {
    const el = audioRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [stream]);
  return <audio ref={audioRef} autoPlay playsInline key={userId} />;
};

// ─── Simple active-speaker detection via AudioContext analyser ────────────────
const useActiveSpeaker = (remoteStreams) => {
  const [speaker, setSpeaker] = useState(null);
  const analysersRef = useRef(new Map()); // userId → AnalyserNode
  const rafRef       = useRef(null);
  const ctx          = useRef(null);

  useEffect(() => {
    if (!remoteStreams.size) { setSpeaker(null); return; }

    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!ctx.current) ctx.current = new Ctx();

    // Add new analysers
    remoteStreams.forEach((stream, uid) => {
      if (analysersRef.current.has(uid)) return;
      try {
        const src      = ctx.current.createMediaStreamSource(stream);
        const analyser = ctx.current.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analysersRef.current.set(uid, { analyser, data: new Uint8Array(analyser.frequencyBinCount) });
      } catch (_) {}
    });

    // Remove stale analysers
    for (const uid of analysersRef.current.keys()) {
      if (!remoteStreams.has(uid)) analysersRef.current.delete(uid);
    }

    const poll = () => {
      let maxRms = 0, loudest = null;
      analysersRef.current.forEach(({ analyser, data }, uid) => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += (v - 128) ** 2;
        const rms = Math.sqrt(sum / data.length);
        if (rms > maxRms) { maxRms = rms; loudest = uid; }
      });
      setSpeaker(maxRms > 3 ? loudest : null);
      rafRef.current = requestAnimationFrame(poll);
    };
    poll();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [remoteStreams]);

  return speaker;
};

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════
const AudioCallUI = () => {
  const {
    callState, activeCall, remoteStreams,
    isMuted, callDuration, participants, callStatus,
    endCall, toggleMute,
  } = useAudioCall();

  const activeSpeaker = useActiveSpeaker(remoteStreams);

  if (!['calling', 'connecting', 'connected'].includes(callState) || !activeCall) {
    return null;
  }

  const isConnected = callState === 'connected';
  const isGroup     = activeCall.isGroup;

  // Status line
  const statusText = callStatus || (
    callState === 'calling'    ? 'Calling…'     :
    callState === 'connecting' ? 'Connecting…'  :
    fmt(callDuration)
  );

  return (
    <>
      <style>{`
        @keyframes callBar {
          from { transform: scaleY(0.4); opacity: 0.7; }
          to   { transform: scaleY(1);   opacity: 1; }
        }
        @keyframes audioUISlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>

      {/* ── Hidden audio elements for each remote stream ──────────────────── */}
      {Array.from(remoteStreams.entries()).map(([uid, stream]) => (
        <RemoteAudio key={uid} userId={uid} stream={stream} />
      ))}

      {/* ── Floating call window ──────────────────────────────────────────── */}
      <div
        className="fixed bottom-6 right-6 z-[190] select-none"
        style={{ animation: 'audioUISlideUp 0.25s cubic-bezier(0.34,1.4,0.64,1) forwards' }}
      >
        <div
          className="rounded-[24px] overflow-hidden"
          style={{
            width: isGroup ? 320 : 260,
            background: 'linear-gradient(160deg, #0a1628 0%, #0d2137 50%, #0f172a 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* ── Top accent ─────────────────────────────────────────────────── */}
          <div
            className="h-[2px]"
            style={{
              background: isConnected
                ? 'linear-gradient(90deg, #10b981, #06b6d4, #10b981)'
                : 'linear-gradient(90deg, #f59e0b, #f97316)',
            }}
          />

          <div className="p-5">
            {/* ── 1:1 Call UI ─────────────────────────────────────────────── */}
            {!isGroup && (
              <div className="flex flex-col items-center gap-4">
                {/* Avatar */}
                <AvatarBubble
                  avatar={activeCall.peerAvatar}
                  name={activeCall.peerName}
                  size={72}
                  speaking={isConnected && remoteStreams.size > 0}
                />

                {/* Name + status */}
                <div className="text-center">
                  <p className="text-white font-bold text-base leading-tight mb-1">
                    {activeCall.peerName}
                  </p>
                  <div className="flex items-center justify-center gap-1.5">
                    {isConnected && remoteStreams.size > 0 && (
                      <Bars active color="#10b981" />
                    )}
                    <span
                      className="text-xs font-mono font-semibold"
                      style={{ color: isConnected ? '#10b981' : '#f59e0b' }}
                    >
                      {statusText}
                    </span>
                    {isConnected && remoteStreams.size > 0 && (
                      <Bars active color="#10b981" />
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-end gap-8 mt-1">
                  <ControlBtn
                    icon={isMuted ? MicOff : Mic}
                    label={isMuted ? 'Unmute' : 'Mute'}
                    variant={isMuted ? 'muted' : 'default'}
                    onClick={toggleMute}
                  />
                  <ControlBtn
                    icon={PhoneOff}
                    label="End"
                    variant="end"
                    onClick={endCall}
                  />
                </div>
              </div>
            )}

            {/* ── Group Call UI ────────────────────────────────────────────── */}
            {isGroup && (
              <div className="flex flex-col gap-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-white font-bold text-sm truncate max-w-[120px]">
                      {activeCall.peerName || 'Group Call'}
                    </span>
                  </div>
                  <span
                    className="text-xs font-mono font-semibold"
                    style={{ color: isConnected ? '#10b981' : '#f59e0b' }}
                  >
                    {statusText}
                  </span>
                </div>

                {/* Participant tiles */}
                {participants.length > 0 ? (
                  <div className="flex flex-wrap justify-center">
                    {participants.map((p) => (
                      <ParticipantTile
                        key={p.userId}
                        participant={p}
                        speaking={activeSpeaker === p.userId}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs text-center py-3">
                    Waiting for others to join…
                  </p>
                )}

                {/* Controls */}
                <div className="flex items-center justify-center gap-8 pt-1">
                  <ControlBtn
                    icon={isMuted ? MicOff : Mic}
                    label={isMuted ? 'Unmute' : 'Mute'}
                    variant={isMuted ? 'muted' : 'default'}
                    onClick={toggleMute}
                  />
                  <ControlBtn
                    icon={PhoneOff}
                    label="Leave"
                    variant="end"
                    onClick={endCall}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AudioCallUI;