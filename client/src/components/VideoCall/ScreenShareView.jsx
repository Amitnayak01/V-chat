import {
  useRef, useEffect, useState, useCallback, memo,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  MonitorUp, Maximize, Minimize,
  RotateCw, RotateCcw, StopCircle, Wifi, Activity,
} from "lucide-react";

const Tip = ({ label, children }) => (
  <div className="relative group/tip flex-shrink-0">
    {children}
    <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2
                    mb-2 px-3 py-1.5 bg-black/95 text-white text-[11px] font-medium
                    rounded-lg whitespace-nowrap opacity-0 group-hover/tip:opacity-100
                    transition-all duration-200 z-[60] shadow-2xl border border-white/20">
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black/95
                      rotate-45 border-r border-b border-white/20" />
      {label}
    </div>
  </div>
);

const TBtn = memo(({ onClick, active, danger, title, children }) => (
  <Tip label={title}>
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className={`
        relative w-10 h-10 rounded-xl flex items-center justify-center
        transition-all duration-200 select-none focus:outline-none
        focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black/50
        ${danger
          ? "bg-gradient-to-br from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white shadow-lg shadow-red-900/50"
          : active
          ? "bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white shadow-lg shadow-blue-900/50"
          : "bg-white/10 hover:bg-white/20 backdrop-blur-sm text-slate-100"}
      `}
    >
      {children}
    </motion.button>
  </Tip>
));
TBtn.displayName = "TBtn";

const Sep = () => <div className="w-px h-6 bg-gradient-to-b from-transparent via-white/20 to-transparent mx-1 flex-shrink-0" />;

const StatsBadge = memo(({ videoRef }) => {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let raf;
    const tick = () => {
      const v = videoRef.current;
      if (!v) { raf = requestAnimationFrame(tick); return; }
      const w = v.videoWidth; const h = v.videoHeight;
      setStats(w && h ? `${w}×${h}` : null);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);
  if (!stats) return null;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex items-center gap-1.5 bg-black/70 backdrop-blur-md border border-emerald-500/30
                 rounded-full px-3 py-1.5 text-[10px] text-slate-200 font-mono flex-shrink-0
                 shadow-lg shadow-emerald-900/20">
      <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />{stats}
    </motion.div>
  );
});
StatsBadge.displayName = "StatsBadge";

/* ─────────────────────────────────────────────────────────────────────────── */

const ScreenShareView = memo(({
  screenStream,
  isLocalSharing = false,
  presenterName  = "Someone",
  onStopSharing,
  onControlsReveal,
}) => {
  const videoRef     = useRef(null);
  const containerRef = useRef(null);
  const hideTimer    = useRef(null);

  const [isFullscreen,  setIsFullscreen]  = useState(false);
  const [rotation,      setRotation]      = useState(0);
  const [fitContain,    setFitContain]    = useState(true);
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [quality,       setQuality]       = useState("HD");

  /* ── Attach stream ─────────────────────────────────────────────── */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const s = screenStream ?? null;
    if (v.srcObject !== s) {
      v.srcObject = s;
      if (s) v.play().catch(() => {});
    }
  }, [screenStream]);

  /* ── Quality detection ─────────────────────────────────────────── */
  useEffect(() => {
    if (!screenStream) return;
    const v = videoRef.current;
    if (!v) return;
    const onResize = () => {
      const w = v.videoWidth;
      if (!w) return;
      setQuality(w >= 1920 ? "FHD" : w >= 1280 ? "HD" : w >= 854 ? "SD" : "LD");
    };
    v.addEventListener("resize", onResize);
    return () => v.removeEventListener("resize", onResize);
  }, [screenStream]);

  /* ── Fullscreen ────────────────────────────────────────────────── */
  const toggleFullscreen = useCallback(async () => {
    const el = containerRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) {
        await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      } else {
        await (document.exitFullscreen?.() ?? document.webkitExitFullscreen?.());
      }
    } catch {}
  }, []);

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    document.addEventListener("webkitfullscreenchange", fn);
    return () => {
      document.removeEventListener("fullscreenchange", fn);
      document.removeEventListener("webkitfullscreenchange", fn);
    };
  }, []);

  /* ── Rotation ──────────────────────────────────────────────────── */
  const rotateCW  = useCallback(() => setRotation(r => (r + 90) % 360), []);
  const rotateCCW = useCallback(() => setRotation(r => (r - 90 + 360) % 360), []);
  const resetRot  = useCallback(() => setRotation(0), []);

  /* ── Auto-hide toolbar ─────────────────────────────────────────── */
  const revealToolbar = useCallback(() => {
    setToolbarHidden(false);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setToolbarHidden(true), 4000);
  }, []);

  const handleActivity = useCallback(() => {
    revealToolbar();
    onControlsReveal?.();
  }, [revealToolbar, onControlsReveal]);

  useEffect(() => {
    revealToolbar();
    return () => clearTimeout(hideTimer.current);
  }, []); // eslint-disable-line

  /* ── Keyboard shortcuts ────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName)) return;
      handleActivity();
      if      (e.key === "f" || e.key === "F")                        toggleFullscreen();
      else if (e.shiftKey && (e.key === "R" || e.key === "r"))        rotateCCW();
      else if (e.key === "r" || e.key === "R")                        rotateCW();
      else if (e.key === "c" || e.key === "C")                        setFitContain(v => !v);
      else if (e.key === "Escape" && !isFullscreen && isLocalSharing) onStopSharing?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleFullscreen, rotateCW, rotateCCW, handleActivity, isFullscreen, isLocalSharing, onStopSharing]);

  /* ── Quality colours ───────────────────────────────────────────── */
  const qDot = {
    FHD: "bg-emerald-400 shadow-emerald-400/50",
    HD:  "bg-blue-400 shadow-blue-400/50",
    SD:  "bg-yellow-400 shadow-yellow-400/50",
    LD:  "bg-red-400 shadow-red-400/50"
  }[quality];
  const qTxt = {
    FHD: "bg-gradient-to-r from-emerald-500/40 to-emerald-600/40 text-emerald-200 border-emerald-500/30",
    HD:  "bg-gradient-to-r from-blue-500/40 to-blue-600/40 text-blue-200 border-blue-500/30",
    SD:  "bg-gradient-to-r from-yellow-500/40 to-yellow-600/40 text-yellow-200 border-yellow-500/30",
    LD:  "bg-gradient-to-r from-red-500/40 to-red-600/40 text-red-200 border-red-500/30"
  }[quality];

  /* ── Video style ───────────────────────────────────────────────── */
  // For local sharing: video must fill the ENTIRE fixed container (= CSS viewport).
  // Use inset:0 + width/height 100% so it occupies exactly the same rectangle
  // that the browser's screen-capture sees. object-position keeps content centred.
  // For remote viewing: same approach works fine inside the layout slot.
  const videoStyle = isLocalSharing ? {
    position:        "absolute",
    inset:           0,
    width:           "100%",
    height:          "100%",
    objectFit:       fitContain ? "contain" : "cover",
    objectPosition:  "center center",
    transform:       rotation ? `rotate(${rotation}deg)` : "none",
    transformOrigin: "center center",
    transition:      "transform 0.4s cubic-bezier(0.34,1.56,0.64,1), object-fit 0.3s ease",
    background:      "#000",
  } : {
    position:        "absolute",
    top:             "50%",
    left:            "50%",
    width:           "100%",
    height:          "100%",
    objectFit:       fitContain ? "contain" : "cover",
    objectPosition:  "center center",
    transform:       `translate(-50%, -50%)${rotation ? ` rotate(${rotation}deg)` : ""}`,
    transformOrigin: "center center",
    transition:      "transform 0.4s cubic-bezier(0.34,1.56,0.64,1), object-fit 0.3s ease",
    background:      "#000",
  };

  /* ─────────────────────────────────────────────────────────────── */
  const content = (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      onMouseMove={handleActivity} onTouchStart={handleActivity} onMouseEnter={handleActivity}
      className="bg-black overflow-hidden select-none"
      style={{
        cursor: toolbarHidden ? "none" : "default",
        // Portal mode (local sharing): fixed inset-0 so it covers exactly
        // what the screen capture sees — same rectangle, same center point.
        // Normal mode (remote viewer): fills the layout slot.
        ...(isLocalSharing
          ? { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999 }
          : { position: 'relative', width: '100%', height: '100%' }
        ),
      }}
    >
      {/* ── Video — always rendered, always centered ── */}
      <video
        ref={videoRef}
        autoPlay playsInline
        muted={isLocalSharing}
        style={videoStyle}
      />

      {/* ── Waiting placeholder ── */}
      {!screenStream && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-6 z-10"
        >
          <motion.div
            animate={{ boxShadow: ["0 0 20px rgba(59,130,246,0.3)","0 0 40px rgba(59,130,246,0.5)","0 0 20px rgba(59,130,246,0.3)"] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-800/90 to-slate-900/90
                       flex items-center justify-center border border-white/10 backdrop-blur-sm"
          >
            <MonitorUp className="w-10 h-10 text-blue-400" />
          </motion.div>
          <div className="text-center space-y-2">
            <p className="text-slate-200 text-base font-semibold">Waiting for screen share</p>
            <p className="text-slate-400 text-sm">The presenter's screen will appear here</p>
          </div>
        </motion.div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TOP TOOLBAR — only shown to remote viewers, never to
          the local presenter (prevents it appearing in the mirror)
      ══════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {!toolbarHidden && !isLocalSharing && (
          <motion.div
            key="toolbar"
            initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }} transition={{ duration: 0.25, ease: "easeOut" }}
            className="absolute top-0 left-0 right-0 z-40
                       bg-gradient-to-b from-black/90 via-black/60 to-transparent
                       px-6 pt-4 pb-12"
          >
            <div className="flex items-center justify-between gap-4">

              {/* Presenter badge */}
              <div className="flex items-center gap-3 min-w-0">
                <motion.div
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-2.5 bg-black/80 backdrop-blur-xl
                             rounded-full pl-3 pr-4 py-2 border border-white/15 shadow-2xl"
                >
                  <span className={`w-2.5 h-2.5 rounded-full animate-pulse shadow-lg ${qDot}`} />
                  <MonitorUp className="w-4 h-4 text-slate-300 flex-shrink-0" />
                  <span className="text-white text-sm font-semibold truncate max-w-[200px]">
                    {presenterName} is presenting
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 border ${qTxt}`}>
                    {quality}
                  </span>
                </motion.div>
                <StatsBadge videoRef={videoRef} />
              </div>

              {/* Controls pill */}
              <motion.div
                initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-1.5 bg-black/80 backdrop-blur-xl
                           rounded-2xl px-2.5 py-2 border border-white/15
                           shadow-2xl shadow-black/60 flex-shrink-0"
              >
                <TBtn onClick={toggleFullscreen} active={isFullscreen}
                  title={isFullscreen ? "Exit fullscreen (F)" : "Fullscreen (F)"}>
                  {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                </TBtn>
                <Sep />
                <TBtn onClick={rotateCCW} title="Rotate left (Shift+R)">
                  <RotateCcw className="w-4 h-4" />
                </TBtn>
                <AnimatePresence mode="wait">
                  {rotation !== 0 && (
                    <motion.button key="rot"
                      initial={{ opacity:0, scale:0.7, width:0 }}
                      animate={{ opacity:1, scale:1, width:"auto" }}
                      exit={{ opacity:0, scale:0.7, width:0 }}
                      transition={{ duration: 0.2 }}
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={resetRot}
                      className="overflow-hidden px-3 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600
                                 hover:from-blue-400 hover:to-blue-500 text-white text-xs font-bold
                                 transition-all whitespace-nowrap focus:outline-none shadow-lg shadow-blue-900/50">
                      {rotation}°
                    </motion.button>
                  )}
                </AnimatePresence>
                <TBtn onClick={rotateCW} title="Rotate right (R)">
                  <RotateCw className="w-4 h-4" />
                </TBtn>
                <Sep />
                <TBtn onClick={() => setFitContain(v => !v)} active={fitContain}
                  title={fitContain ? "Fill screen (C)" : "Fit screen (C)"}>
                  <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none"
                       stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    {fitContain ? (<>
                      <rect x="2" y="2" width="12" height="12" rx="2" strokeOpacity=".4"/>
                      <rect x="4" y="4" width="8" height="8" rx="1"/>
                    </>) : (<>
                      <rect x="2" y="2" width="12" height="12" rx="2"/>
                      <path d="M5 2v12M11 2v12M2 5h12M2 11h12" strokeOpacity=".4" strokeWidth="1"/>
                    </>)}
                  </svg>
                </TBtn>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stop sharing button — only for local presenter
           Rendered OUTSIDE the video area so it doesn't appear
           in the captured stream / mirror loop              ── */}
      {isLocalSharing && onStopSharing && !toolbarHidden && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="absolute top-4 right-4 z-50"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onStopSharing}
            className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-red-600
                       hover:from-red-400 hover:to-red-500
                       text-white text-sm font-semibold px-5 py-2.5 rounded-full
                       border border-red-400/40 shadow-2xl shadow-red-900/60 transition-all"
          >
            <StopCircle className="w-4 h-4" />
            Stop sharing
          </motion.button>
        </motion.div>
      )}

      {/* ── Viewer badge — remote only ── */}
      {!isLocalSharing && screenStream && (
        <AnimatePresence>
          {!toolbarHidden && (
            <motion.div key="viewbadge"
              initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }}
              transition={{ duration: 0.25 }}
              className="absolute bottom-5 left-5 z-40 flex items-center gap-2
                         bg-black/80 backdrop-blur-xl rounded-full
                         px-4 py-2 border border-emerald-500/30 pointer-events-none
                         shadow-lg shadow-emerald-900/30"
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span className="text-white/80 text-xs font-medium">
                Viewing {presenterName}'s screen
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* ── Keyboard shortcuts — remote viewers, desktop only ── */}
      {isFullscreen && !isLocalSharing && (
        <AnimatePresence>
          {!toolbarHidden && (
            <motion.div key="kbd"
              initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:10 }}
              transition={{ duration: 0.25 }}
              className="absolute bottom-5 right-5 z-40 hidden sm:flex flex-col gap-1.5
                         bg-black/80 backdrop-blur-xl rounded-xl p-3
                         border border-white/15 pointer-events-none shadow-2xl"
            >
              {[["F","Fullscreen"],["R","Rotate right"],["Shift+R","Rotate left"],
                ["C","Fit / Fill"],["Esc","Stop sharing"]].map(([k,d]) => (
                <div key={k} className="flex items-center gap-2.5">
                  <kbd className="bg-white/15 text-white text-[10px] font-mono font-medium px-2 py-1
                                  rounded border border-white/20 min-w-[50px] text-center shadow-sm">{k}</kbd>
                  <span className="text-white/50 text-[10px] font-medium">{d}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );

  // When presenting locally: portal to document.body so the component
  // covers the FULL browser viewport (fixed inset-0), matching exactly
  // what the OS screen capture captures. This makes the mirror tunnel
  // converge to the true center of the screen.
  if (isLocalSharing) {
    return createPortal(content, document.body);
  }
  return content;
});

ScreenShareView.displayName = "ScreenShareView";
export default ScreenShareView;