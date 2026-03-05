import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Circle, StopCircle, Video, Mic, MicOff, Users,
  Download, Trash2, X, Settings, ChevronDown,
  HardDrive, Wifi, AlertCircle, CheckCircle2, Loader2,
} from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
};

const fmtSize = (bytes) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

// Estimated file size: 3 Mbps video + 128 kbps audio ≈ ~388 KB/s
const estimateSize = (seconds) => fmtSize(seconds * 388 * 1024);

// ─── Pulsing REC dot ──────────────────────────────────────────────────────────
const RecDot = () => (
  <span className="relative flex h-2.5 w-2.5">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
  </span>
);

// ─── Quality badge ─────────────────────────────────────────────────────────────
const QUALITY_OPTIONS = [
  { id: 'hd',  label: '720p HD',  desc: '1280×720 · 3 Mbps',  w: 1280, h: 720,  bps: 3_000_000 },
  { id: 'fhd', label: '1080p FHD',desc: '1920×1080 · 5 Mbps', w: 1920, h: 1080, bps: 5_000_000 },
  { id: 'sd',  label: '480p SD',  desc: '854×480 · 1 Mbps',   w: 854,  h: 480,  bps: 1_000_000 },
];

// ─── Main modal ───────────────────────────────────────────────────────────────
/**
 * Props:
 *  isOpen          boolean
 *  onClose         () => void
 *  isRecording     boolean
 *  onStartRecording  ({ quality }) => void
 *  onStopRecording   () => void
 *  participantCount  number
 *  recordings        Array<{ id, name, size, duration, url, createdAt }>
 *  onDeleteRecording (id) => void
 *  onDownloadRecording (id) => void
 */
const RecordingModal = memo(({
  isOpen,
  onClose,
  isRecording,
  onStartRecording,
  onStopRecording,
  participantCount = 1,
  recordings = [],
  onDeleteRecording,
  onDownloadRecording,
  recordingDuration = 0,
  recordingSize = 0,
}) => {
  const [tab,           setTab]          = useState('record');   // 'record' | 'library'
  const [quality,       setQuality]      = useState('hd');
  const [qualityOpen,   setQualityOpen]  = useState(false);
  const [includeAudio,  setIncludeAudio] = useState(true);
  const [starting,      setStarting]     = useState(false);
  const [stopping,      setStopping]     = useState(false);

  const selectedQ = QUALITY_OPTIONS.find(q => q.id === quality);

  const handleStart = useCallback(async () => {
    setStarting(true);
    try {
      await onStartRecording?.({ quality: selectedQ, includeAudio });
    } finally {
      setStarting(false);
    }
  }, [onStartRecording, selectedQ, includeAudio]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await onStopRecording?.();
    } finally {
      setStopping(false);
    }
  }, [onStopRecording]);

  // Reset to record tab when opened
  useEffect(() => {
    if (isOpen) setTab(recordings.length > 0 ? 'record' : 'record');
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0,  scale: 0.92,   y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4"
          >
            <div className="pointer-events-auto w-full max-w-md bg-[#0f1117] border border-white/10
                            rounded-2xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col">

              {/* ── Header ─────────────────────────────────────────────── */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
                <div className="flex items-center gap-3">
                  {isRecording
                    ? <RecDot />
                    : <div className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                  }
                  <span className="text-white font-semibold text-sm tracking-wide">
                    {isRecording ? 'Recording in progress' : 'Meeting Recorder'}
                  </span>
                  {isRecording && (
                    <span className="font-mono text-red-400 text-sm font-bold tabular-nums">
                      {fmt(recordingDuration)}
                    </span>
                  )}
                </div>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full flex items-center justify-center
                             bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white
                             transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* ── Tabs ──────────────────────────────────────────────── */}
              <div className="flex border-b border-white/8 px-5">
                {['record', 'library'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`relative py-2.5 mr-6 text-xs font-semibold tracking-widest uppercase
                                transition-colors
                      ${tab === t ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
                  >
                    {t === 'library' && recordings.length > 0 && (
                      <span className="absolute -top-0.5 -right-3 bg-blue-500 text-white
                                       text-[9px] font-bold w-4 h-4 rounded-full
                                       flex items-center justify-center">
                        {recordings.length}
                      </span>
                    )}
                    {t}
                    {tab === t && (
                      <motion.div
                        layoutId="tab-line"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-t-full"
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* ── Tab content ───────────────────────────────────────── */}
              <div className="flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {tab === 'record' && (
                    <motion.div
                      key="record"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.15 }}
                      className="p-5 space-y-4"
                    >
                      {/* Active recording status card */}
                      {isRecording ? (
                        <div className="rounded-xl bg-red-950/30 border border-red-500/20 p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <RecDot />
                              <span className="text-red-300 text-xs font-semibold uppercase tracking-widest">
                                Live Recording
                              </span>
                            </div>
                            <span className="font-mono text-white text-lg font-bold tabular-nums">
                              {fmt(recordingDuration)}
                            </span>
                          </div>

                          {/* Stats row */}
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            <StatCard icon={<Users className="w-3.5 h-3.5" />}
                              label="Participants" value={participantCount} />
                            <StatCard icon={<HardDrive className="w-3.5 h-3.5" />}
                              label="Est. Size" value={estimateSize(recordingDuration)} />
                            <StatCard icon={<Wifi className="w-3.5 h-3.5" />}
                              label="Quality" value={selectedQ.label.split(' ')[0]} />
                          </div>

                          {/* Progress bar */}
                          <div className="h-1 bg-white/5 rounded-full overflow-hidden mb-4">
                            <motion.div
                              className="h-full bg-gradient-to-r from-red-500 to-red-400 rounded-full"
                              initial={{ width: '0%' }}
                              animate={{ width: `${Math.min((recordingDuration / 3600) * 100, 100)}%` }}
                              transition={{ duration: 0.5 }}
                            />
                          </div>

                          {/* Stop button */}
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={handleStop}
                            disabled={stopping}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl
                                       bg-red-600 hover:bg-red-700 disabled:opacity-60
                                       text-white font-semibold text-sm transition-colors
                                       shadow-lg shadow-red-900/40"
                          >
                            {stopping
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <StopCircle className="w-4 h-4" />
                            }
                            {stopping ? 'Saving recording…' : 'Stop & Save Recording'}
                          </motion.button>
                        </div>
                      ) : (
                        /* Pre-recording setup */
                        <div className="space-y-3">

                          {/* Info banner */}
                          <div className="flex items-start gap-3 bg-blue-950/30 border border-blue-500/20
                                          rounded-xl p-3">
                            <CheckCircle2 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                            <p className="text-blue-200/80 text-xs leading-relaxed">
                              Records all {participantCount} participant{participantCount !== 1 ? 's' : ''} in a
                              professional grid layout. Video + mixed audio saved as a .webm file.
                            </p>
                          </div>

                          {/* Quality selector */}
                          <div className="space-y-1.5">
                            <label className="text-slate-400 text-xs font-medium uppercase tracking-widest">
                              Video Quality
                            </label>
                            <div className="relative">
                              <button
                                onClick={() => setQualityOpen(o => !o)}
                                className="w-full flex items-center justify-between px-4 py-3 rounded-xl
                                           bg-white/5 hover:bg-white/8 border border-white/8
                                           text-white text-sm transition-colors"
                              >
                                <div className="flex items-center gap-3">
                                  <Video className="w-4 h-4 text-slate-400" />
                                  <div className="text-left">
                                    <div className="font-semibold">{selectedQ.label}</div>
                                    <div className="text-slate-500 text-xs">{selectedQ.desc}</div>
                                  </div>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform
                                  ${qualityOpen ? 'rotate-180' : ''}`} />
                              </button>

                              <AnimatePresence>
                                {qualityOpen && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                                    exit={{ opacity: 0,   y: -4, scale: 0.98 }}
                                    className="absolute top-full mt-1 left-0 right-0 z-10
                                               bg-[#1a1d27] border border-white/10 rounded-xl
                                               overflow-hidden shadow-2xl"
                                  >
                                    {QUALITY_OPTIONS.map(opt => (
                                      <button
                                        key={opt.id}
                                        onClick={() => { setQuality(opt.id); setQualityOpen(false); }}
                                        className={`w-full flex items-center gap-3 px-4 py-3
                                                    text-sm transition-colors text-left
                                          ${quality === opt.id
                                            ? 'bg-blue-600/20 text-blue-300'
                                            : 'hover:bg-white/5 text-slate-300'}`}
                                      >
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0
                                          ${quality === opt.id ? 'bg-blue-400' : 'bg-slate-600'}`} />
                                        <div>
                                          <div className="font-semibold">{opt.label}</div>
                                          <div className="text-slate-500 text-xs">{opt.desc}</div>
                                        </div>
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>

                          {/* Audio toggle */}
                          <button
                            onClick={() => setIncludeAudio(a => !a)}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-xl
                                       bg-white/5 hover:bg-white/8 border border-white/8 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {includeAudio
                                ? <Mic className="w-4 h-4 text-green-400" />
                                : <MicOff className="w-4 h-4 text-slate-500" />
                              }
                              <div className="text-left">
                                <div className="text-white text-sm font-semibold">
                                  {includeAudio ? 'Audio enabled' : 'Audio disabled'}
                                </div>
                                <div className="text-slate-500 text-xs">
                                  {includeAudio
                                    ? 'All participant audio will be mixed'
                                    : 'Video only, no audio track'}
                                </div>
                              </div>
                            </div>
                            <div className={`w-10 h-5.5 rounded-full p-0.5 transition-colors flex items-center
                              ${includeAudio ? 'bg-green-600' : 'bg-slate-700'}`}
                              style={{ height: '22px' }}
                            >
                              <motion.div
                                layout
                                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                                className="w-4 h-4 rounded-full bg-white shadow-sm"
                                style={{ marginLeft: includeAudio ? 'auto' : '0' }}
                              />
                            </div>
                          </button>

                          {/* Estimated info */}
                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
                              <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                                Est. 1hr size
                              </p>
                              <p className="text-white text-sm font-bold">~1.4 GB</p>
                            </div>
                            <div className="bg-white/3 border border-white/6 rounded-xl p-3 text-center">
                              <p className="text-slate-500 text-[10px] uppercase tracking-widest mb-1">
                                Format
                              </p>
                              <p className="text-white text-sm font-bold">WebM / VP9</p>
                            </div>
                          </div>

                          {/* Start button */}
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={handleStart}
                            disabled={starting}
                            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl
                                       bg-gradient-to-r from-red-600 to-red-500
                                       hover:from-red-700 hover:to-red-600
                                       disabled:opacity-60 disabled:cursor-not-allowed
                                       text-white font-bold text-sm tracking-wide
                                       shadow-lg shadow-red-900/40 transition-all"
                          >
                            {starting
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Circle className="w-4 h-4 fill-current" />
                            }
                            {starting ? 'Starting…' : 'Start Recording'}
                          </motion.button>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {tab === 'library' && (
                    <motion.div
                      key="library"
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.15 }}
                      className="p-5"
                    >
                      {recordings.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center">
                          <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-4">
                            <Video className="w-6 h-6 text-slate-500" />
                          </div>
                          <p className="text-slate-400 text-sm font-medium">No recordings yet</p>
                          <p className="text-slate-600 text-xs mt-1">
                            Recordings will appear here after you stop them.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {recordings.map((rec, i) => (
                            <motion.div
                              key={rec.id}
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: i * 0.04 }}
                              className="flex items-center gap-3 p-3 rounded-xl
                                         bg-white/4 border border-white/6
                                         hover:bg-white/6 transition-colors group"
                            >
                              <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/20
                                              flex items-center justify-center flex-shrink-0">
                                <Video className="w-4 h-4 text-red-400" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-xs font-semibold truncate">{rec.name}</p>
                                <p className="text-slate-500 text-[10px] mt-0.5">
                                  {fmt(rec.duration)} · {fmtSize(rec.size)}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100
                                              transition-opacity">
                                <button
                                  onClick={() => onDownloadRecording?.(rec.id)}
                                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-blue-600/30
                                             flex items-center justify-center transition-colors"
                                  title="Download"
                                >
                                  <Download className="w-3.5 h-3.5 text-slate-300" />
                                </button>
                                <button
                                  onClick={() => onDeleteRecording?.(rec.id)}
                                  className="w-7 h-7 rounded-lg bg-white/8 hover:bg-red-600/30
                                             flex items-center justify-center transition-colors"
                                  title="Delete"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-slate-300" />
                                </button>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ─────────────────────────────────────────────── */}
              <div className="px-5 py-3 border-t border-white/6
                              flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-600 text-[10px]">
                  <AlertCircle className="w-3 h-3" />
                  Saved locally to your device
                </div>
                {recordings.length > 0 && (
                  <button
                    onClick={() => setTab('library')}
                    className="text-blue-400 text-[10px] hover:text-blue-300 font-semibold
                               transition-colors"
                  >
                    View {recordings.length} recording{recordings.length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});
RecordingModal.displayName = 'RecordingModal';

// ─── Stat card ────────────────────────────────────────────────────────────────
const StatCard = ({ icon, label, value }) => (
  <div className="bg-white/5 border border-white/6 rounded-xl p-2.5 text-center">
    <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
      {icon}
      <span className="text-[9px] uppercase tracking-widest">{label}</span>
    </div>
    <p className="text-white text-xs font-bold tabular-nums">{value}</p>
  </div>
);

export default RecordingModal;