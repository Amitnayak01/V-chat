import { memo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─────────────────────────────────────────────────────────────────────────────
// HandRaisedBanner
//
// TWO SEPARATE CONCERNS:
//
//  1. PERSISTENT raised-hand cards  (raisedHands prop)
//     Driven directly by handRaisedMap in VideoRoom — stays visible the entire
//     time the hand is up, disappears the instant it is lowered. No timer.
//     A gentle continuous pulse keeps drawing attention.
//
//  2. TRANSIENT "lowered" toasts  (notifications prop)
//     Appears briefly (LOWERED_MS) when someone lowers their hand, then
//     auto-dismisses itself.
//
// Props:
//   raisedHands    Array<{ userId, username }>
//   notifications  Array<{ id, userId, username, type: 'lowered', ts }>
//   onDismiss      (id: string) => void
//   localUserId    string
// ─────────────────────────────────────────────────────────────────────────────

const LOWERED_MS = 2000;

const avatarHue = (name = '') =>
  ((name.charCodeAt(0) ?? 65) * 137 + (name.charCodeAt(1) ?? 0) * 31) % 360;

// ── Persistent raised-hand card ───────────────────────────────────────────────
const RaisedCard = memo(({ userId, username, isLocal }) => {
  const hue = avatarHue(username);

  return (
    <motion.div
      layout
      layoutId={`raised-${userId}`}
      initial={{ opacity: 0, x: 56, scale: 0.88 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 56, scale: 0.88, transition: { duration: 0.22 } }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="flex items-center gap-2.5 pl-2.5 pr-3.5 py-2
                      rounded-2xl border backdrop-blur-xl shadow-2xl shadow-black/60
                      min-w-[200px] max-w-[260px]
                      bg-amber-950/90 border-amber-500/40">

        {/* Avatar + waving ✋ badge */}
        <div className="relative flex-shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center
                       text-white text-[11px] font-bold select-none"
            style={{ background: `hsl(${hue},48%,34%)` }}
          >
            {username.charAt(0).toUpperCase()}
          </div>
          <motion.span
            className="absolute -bottom-1 -right-1 text-[13px] leading-none select-none"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
            animate={{ rotate: [0, 20, -8, 20, 0] }}
            transition={{ duration: 0.7, delay: 0.1 }}
          >
            ✋
          </motion.span>
        </div>

        {/* Name + label */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-[12px] font-semibold leading-tight truncate">
            {isLocal ? 'You' : username}
          </p>
          <p className="text-amber-300 text-[10px] leading-tight font-medium">
            raised their hand
          </p>
        </div>

        {/* Continuously pulsing hand to keep drawing attention */}
        <motion.span
          className="text-lg flex-shrink-0 select-none"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        >
          ✋
        </motion.span>
      </div>

      {/* Static amber underline — no drain, always visible */}
      <div className="h-[2px] bg-amber-500/40 rounded-full mx-2 mt-0.5" />
    </motion.div>
  );
});
RaisedCard.displayName = 'RaisedCard';

// ── Transient "lowered hand" toast ────────────────────────────────────────────
const LoweredCard = memo(({ notification: n, onDismiss, isLocal }) => {
  const timerRef = useRef(null);
  const hue      = avatarHue(n.username);

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(n.id), LOWERED_MS);
    return () => clearTimeout(timerRef.current);
  }, [n.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 56, scale: 0.88 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 56, scale: 0.88, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <div className="flex items-center gap-2.5 pl-2.5 pr-3.5 py-2
                      rounded-2xl border backdrop-blur-xl shadow-xl shadow-black/40
                      min-w-[200px] max-w-[260px]
                      bg-slate-900/85 border-white/10">
        <div className="relative flex-shrink-0">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center
                       text-white text-[11px] font-bold select-none"
            style={{ background: `hsl(${hue},48%,34%)` }}
          >
            {n.username.charAt(0).toUpperCase()}
          </div>
          <span
            className="absolute -bottom-1 -right-1 text-[13px] leading-none select-none"
            style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}
          >
            👇
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-[12px] font-semibold leading-tight truncate">
            {isLocal ? 'You' : n.username}
          </p>
          <p className="text-slate-400 text-[10px] leading-tight font-medium">
            lowered their hand
          </p>
        </div>
      </div>
    </motion.div>
  );
});
LoweredCard.displayName = 'LoweredCard';

// ── Container ─────────────────────────────────────────────────────────────────
const HandRaisedBanner = memo(({
  raisedHands   = [],  // Array<{ userId, username }> — live, from handRaisedMap
  notifications = [],  // Array<{ id, userId, username, type: 'lowered', ts }>
  onDismiss,
  localUserId,
}) => {
  const hasContent = raisedHands.length > 0 || notifications.length > 0;
  if (!hasContent) return null;

  return (
    <div className="absolute top-16 right-3 sm:right-4 z-40
                    flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">

        {/* Persistent raised-hand cards — one per user, live from Map */}
        {raisedHands.map(({ userId, username }) => (
          <div key={`raised-${userId}`} className="pointer-events-auto">
            <RaisedCard
              userId={userId}
              username={username}
              isLocal={userId === localUserId}
            />
          </div>
        ))}

        {/* Transient lowered-hand toasts */}
        {notifications.map(n => (
          <div key={n.id} className="pointer-events-auto">
            <LoweredCard
              notification={n}
              onDismiss={onDismiss}
              isLocal={n.userId === localUserId}
            />
          </div>
        ))}

      </AnimatePresence>
    </div>
  );
});
HandRaisedBanner.displayName = 'HandRaisedBanner';

export default HandRaisedBanner;