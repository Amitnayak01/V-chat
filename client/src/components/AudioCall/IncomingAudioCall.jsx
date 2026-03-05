/**
 * IncomingAudioCall.jsx
 * ─────────────────────
 * WhatsApp-style incoming audio call popup.
 * Mounts globally (via App.jsx) so it appears on any page.
 * Reads state from AudioCallContext — zero props required.
 */

import { useEffect, useRef } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { useAudioCall } from "../../context/AudioCallContext";
// ── Animated waveform bars (speaking indicator on ring) ──────────────────────
const RingWave = () => (
  <div className="flex items-end justify-center gap-[3px] h-5">
    {[0.4, 0.7, 1, 0.7, 0.4].map((h, i) => (
      <span
        key={i}
        className="w-[3px] rounded-full bg-emerald-400"
        style={{
          height: `${h * 100}%`,
          animation: `audioBarPulse 0.9s ease-in-out ${i * 0.12}s infinite alternate`,
        }}
      />
    ))}
  </div>
);

// ── Avatar with pulsing ring ──────────────────────────────────────────────────
const CallerAvatar = ({ avatar, name }) => (
  <div className="relative flex items-center justify-center mb-5">
    {/* Outer pulse rings */}
    <span className="absolute w-28 h-28 rounded-full bg-emerald-500/20 animate-ping" style={{ animationDuration: '1.6s' }} />
    <span className="absolute w-24 h-24 rounded-full bg-emerald-500/30 animate-ping" style={{ animationDuration: '1.2s' }} />

    {/* Avatar */}
    <div className="relative z-10 w-20 h-20 rounded-full overflow-hidden ring-4 ring-emerald-400/60 shadow-xl shadow-emerald-900/30">
      {avatar ? (
        <img src={avatar} alt={name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-2xl font-bold select-none">
          {name?.[0]?.toUpperCase() ?? '?'}
        </div>
      )}
    </div>
  </div>
);

// ── Action button ─────────────────────────────────────────────────────────────
const ActionBtn = ({ icon: Icon, label, variant, onClick }) => {
  const color = variant === 'accept'
    ? 'bg-emerald-500 hover:bg-emerald-400 shadow-lg shadow-emerald-900/40'
    : 'bg-rose-500   hover:bg-rose-400   shadow-lg shadow-rose-900/40';

  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 group transition-all duration-150 active:scale-90`}
    >
      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${color} transition-all duration-150`}>
        <Icon className="w-7 h-7 text-white" strokeWidth={2.2} />
      </div>
      <span className="text-xs font-semibold text-slate-400 group-hover:text-white transition-colors">
        {label}
      </span>
    </button>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
const IncomingAudioCall = () => {
  const { callState, incomingCall, acceptCall, rejectCall } = useAudioCall();
  const overlayRef = useRef(null);

  // Prevent background scroll while popup is showing
  useEffect(() => {
    if (callState === 'incoming') {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [callState]);

  if (callState !== 'incoming' || !incomingCall) return null;

  return (
    <>
      {/* ── CSS for the waveform animation ───────────────────────────── */}
      <style>{`
        @keyframes audioBarPulse {
          from { transform: scaleY(0.3); opacity: 0.6; }
          to   { transform: scaleY(1);   opacity: 1;   }
        }
        @keyframes incomingSlideUp {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)    scale(1);    }
        }
      `}</style>

      {/* ── Backdrop ─────────────────────────────────────────────────── */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6"
        style={{ background: 'rgba(2, 6, 23, 0.72)', backdropFilter: 'blur(8px)' }}
      >
        {/* ── Card ───────────────────────────────────────────────────── */}
        <div
          className="w-full sm:max-w-[340px] rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
          style={{
            background: 'linear-gradient(145deg, #0f172a 0%, #1a2744 60%, #0d2137 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 32px 80px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
            animation: 'incomingSlideUp 0.28s cubic-bezier(0.34, 1.4, 0.64, 1) forwards',
          }}
        >
          {/* Top accent bar */}
          <div className="h-[3px] bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />

          <div className="px-8 pt-8 pb-10 flex flex-col items-center text-center">
            {/* Caller avatar */}
            <CallerAvatar
              avatar={incomingCall.callerAvatar}
              name={incomingCall.callerName}
            />

            {/* Caller name */}
            <h2 className="text-white text-xl font-bold mb-1 tracking-tight">
              {incomingCall.callerName}
            </h2>

            {/* Animated "Audio call" label */}
            <div className="flex items-center gap-2 mb-7">
              <RingWave />
              <span className="text-emerald-400 text-xs font-semibold tracking-widest uppercase">
                Audio call
              </span>
              <RingWave />
            </div>

            {/* Accept / Reject buttons */}
            <div className="flex items-start justify-center gap-16 w-full">
              <ActionBtn
                icon={PhoneOff}
                label="Decline"
                variant="reject"
                onClick={rejectCall}
              />
              <ActionBtn
                icon={Phone}
                label="Accept"
                variant="accept"
                onClick={acceptCall}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default IncomingAudioCall;