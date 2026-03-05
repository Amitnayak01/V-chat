import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MicOff, VideoOff, Pin, Maximize2, Play } from 'lucide-react';

// ─── Avatar colour derived from username ──────────────────────────────────────
const avatarHue = (name = '') =>
  ((name.charCodeAt(0) ?? 65) * 137 + (name.charCodeAt(1) ?? 0) * 31) % 360;

// ─── VideoTile ────────────────────────────────────────────────────────────────
const VideoTile = memo(({
  stream,
  username     = 'User',
  isMuted      = false,
  isVideoOff   = false,
  isLocal      = false,
  isActive     = false,
  isPinned     = false,
  isFloating   = false,
  onPin,
  onMaximize,
  onDoubleClick,
  className    = '',
  style        = {},
}) => {
  const videoRef      = useRef(null);
  const [hover,       setHover]      = useState(false);
  const [needsPlay,   setNeedsPlay]  = useState(false);
  const [hasVideo,    setHasVideo]   = useState(false);

  // ── Core: attach stream → video element and manage play ──────────────────
  //
  // ROOT CAUSE FIX:
  // WebRTCContext reuses the SAME MediaStream object across renders —
  // it just mutates it by calling addTrack(). React sees the same stream
  // reference so VideoTile's useEffect never re-fires, meaning checkTrack()
  // never runs after the video track arrives.
  //
  // Fix: we also listen to the stream's 'addtrack' event at the top level
  // and directly poke the video element, bypassing React's effect system
  // entirely for the "video track just arrived" case.
  //
  // We also use a polling fallback: every 400 ms while video is not showing,
  // we re-check whether the video element has started producing frames.
  // This handles the race where addtrack fires before the track is live.

  const tryPlay = useCallback(async (v) => {
    if (!v || !v.srcObject) return;
    try {
      await v.play();
      setNeedsPlay(false);
    } catch (err) {
      if (err.name === 'NotAllowedError') setNeedsPlay(true);
      // AbortError: another play in flight — safe to ignore
    }
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    // ── Clear when no stream ──────────────────────────────────────────────
    if (!stream) {
      v.srcObject = null;
      setHasVideo(false);
      setNeedsPlay(false);
      return;
    }

    // ── Attach stream (even if same reference — always re-check state) ────
    if (v.srcObject !== stream) {
      v.srcObject = stream;
      setHasVideo(false);
    }

    // ── Check whether there is a live, enabled video track ────────────────
    const checkVideoTrack = () => {
      const vTracks = stream.getVideoTracks();
      const hasLive  = vTracks.length > 0 && vTracks.some(t => t.readyState !== 'ended' && t.enabled);
      if (hasLive) {
        setHasVideo(true);
        tryPlay(v);
      }
      return hasLive;
    };

    // Run immediately
    checkVideoTrack();

    // ── Polling: re-check every 400 ms until video is flowing ────────────
    // Handles the common case where the video track exists but the <video>
    // element hasn't started producing frames yet at the moment checkVideoTrack runs.
    let pollCount = 0;
    const MAX_POLLS = 30; // give up after ~12 seconds
    const pollTimer = setInterval(() => {
      pollCount++;
      if (pollCount > MAX_POLLS) { clearInterval(pollTimer); return; }

      const vt = stream.getVideoTracks();
      const live = vt.length > 0 && vt.some(t => t.readyState !== 'ended' && t.enabled);
      if (live && v.readyState >= 2 && v.videoWidth > 0) {
        setHasVideo(true);
        tryPlay(v);
        clearInterval(pollTimer);
      } else if (live) {
        // Track exists but video not flowing yet — try play again
        tryPlay(v);
      }
    }, 400);

    // ── Addtrack: fires when a track is added to the SAME stream object ───
    // This is the main fix for the "same MediaStream reference" problem.
    const onAddTrack = (e) => {
      if (e.track.kind === 'video') {
        e.track.onunmute = () => { setHasVideo(true); tryPlay(v); };
        checkVideoTrack();
        tryPlay(v);
      }
    };
    const onRemoveTrack = () => checkVideoTrack();

    // ── Video element events ──────────────────────────────────────────────
    const onTimeUpdate   = () => { setHasVideo(true); };
    const onCanPlay      = () => { setHasVideo(true); tryPlay(v); };
    const onLoadedMeta   = () => { if (v.videoWidth > 0) setHasVideo(true); };

    stream.addEventListener('addtrack',    onAddTrack);
    stream.addEventListener('removetrack', onRemoveTrack);
    v.addEventListener('timeupdate',  onTimeUpdate);
    v.addEventListener('canplay',     onCanPlay);
    v.addEventListener('loadedmetadata', onLoadedMeta);

    tryPlay(v);

    return () => {
      clearInterval(pollTimer);
      stream.removeEventListener('addtrack',    onAddTrack);
      stream.removeEventListener('removetrack', onRemoveTrack);
      v.removeEventListener('timeupdate',  onTimeUpdate);
      v.removeEventListener('canplay',     onCanPlay);
      v.removeEventListener('loadedmetadata', onLoadedMeta);
    };
  }, [stream, tryPlay]);

  // ── Re-attempt play on user gesture if autoplay was blocked ──────────────
  useEffect(() => {
    if (!needsPlay) return;
    const go = () => { const v = videoRef.current; if (v?.paused) tryPlay(v); };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown',     go, { once: true });
    return () => {
      window.removeEventListener('pointerdown', go);
      window.removeEventListener('keydown',     go);
    };
  }, [needsPlay, tryPlay]);

  const initial   = username.charAt(0).toUpperCase();
  const hue       = avatarHue(username);
  const showVideo = !!(stream && !isVideoOff && hasVideo);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onDoubleClick={onDoubleClick}
      className={`
        relative overflow-hidden bg-slate-900 select-none
        ${isActive && !isFloating ? 'ring-2 ring-inset ring-emerald-400/70' : ''}
        ${isPinned && !isFloating ? 'ring-2 ring-inset ring-violet-400/70'  : ''}
        ${className}
      `}
      style={style}
    >
      {/* Video — always mounted, always attached */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal}
        className={`w-full h-full object-cover transition-opacity duration-300 ${showVideo ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Avatar fallback */}
      <AnimatePresence>
        {!showVideo && (
          <motion.div
            key="avatar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900"
          >
            <div className="flex flex-col items-center gap-2">
              <div
                className="rounded-full flex items-center justify-center font-bold text-white shadow-lg"
                style={{
                  width:      isFloating ? 32 : 56,
                  height:     isFloating ? 32 : 56,
                  fontSize:   isFloating ? '0.85rem' : '1.4rem',
                  background: `hsl(${hue},45%,32%)`,
                  boxShadow:  `0 0 0 3px hsl(${hue},45%,22%)`,
                }}
              >
                {initial}
              </div>
              {!isFloating && <p className="text-slate-400 text-xs font-medium">{username}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tap-to-play */}
      <AnimatePresence>
        {needsPlay && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            onClick={() => tryPlay(videoRef.current)}
            className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10 cursor-pointer"
          >
            <div className="w-14 h-14 rounded-full bg-white/20 border-2 border-white/60 flex items-center justify-center">
              <Play className="w-6 h-6 text-white fill-white ml-1" />
            </div>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Active speaker border */}
      {isActive && !isFloating && (
        <motion.div
          className="absolute inset-0 border-2 border-emerald-400/50 pointer-events-none"
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: 'easeInOut' }}
        />
      )}

      {/* Bottom scrim */}
      {!isFloating && (
        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-black/75 to-transparent pointer-events-none" />
      )}

      {/* Name + mute/video status */}
      <div className={`absolute left-0 right-0 flex items-end justify-between pointer-events-none ${isFloating ? 'bottom-1 px-1' : 'bottom-2 px-2'}`}>
        <div className="flex items-center gap-1 min-w-0">
          {isActive && !isFloating && <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
          <span className={`text-white font-semibold drop-shadow-sm truncate ${isFloating ? 'text-[9px]' : 'text-[11px]'}`}>
            {isFloating ? initial : `${username}${isLocal ? ' (You)' : ''}`}
          </span>
        </div>
        {!isFloating && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {isMuted    && <div className="w-5 h-5 bg-red-600   rounded-full flex items-center justify-center"><MicOff   className="w-3 h-3 text-white" /></div>}
            {isVideoOff && <div className="w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center"><VideoOff className="w-3 h-3 text-white" /></div>}
          </div>
        )}
      </div>

      {/* Hover actions */}
      <AnimatePresence>
        {!isFloating && hover && (onPin || onMaximize) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute top-2 right-2 hidden sm:flex gap-1">
            {onPin && (
              <button onClick={e => { e.stopPropagation(); onPin(); }} title={isPinned ? 'Unpin' : 'Pin'}
                className={`w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-sm transition-all
                  ${isPinned ? 'bg-violet-500 text-white hover:bg-violet-600' : 'bg-black/50 text-slate-300 hover:bg-black/70'}`}>
                <Pin className="w-3.5 h-3.5" />
              </button>
            )}
            {onMaximize && (
              <button onClick={e => { e.stopPropagation(); onMaximize(); }} title="Expand"
                className="w-7 h-7 rounded-full bg-black/50 text-slate-300 hover:bg-black/70 flex items-center justify-center backdrop-blur-sm transition-all">
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {!isFloating && onMaximize && (
        <button onClick={e => { e.stopPropagation(); onMaximize(); }}
          className="absolute top-2 right-2 sm:hidden w-7 h-7 rounded-full bg-black/40 text-white flex items-center justify-center">
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
});

VideoTile.displayName = 'VideoTile';
export default VideoTile;