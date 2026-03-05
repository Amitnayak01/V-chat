/**
 * MessageInput.jsx — Production voice recording, mobile-first
 *
 * MOBILE FIXES vs previous version:
 *  1. ONLY Pointer Events on mic button (no Touch Events) — eliminates double-fire
 *     on mobile where both pointer + touch events fired simultaneously
 *  2. Removed attachMicRef / non-passive touchmove hack entirely — not needed
 *  3. recModeRef mirrors recMode state — pointer handlers never get stale closure
 *  4. onPointerCancel handles system interruptions (incoming call, home swipe, etc.)
 *  5. onPointerLeave removed — setPointerCapture routes events to button globally
 *  6. iOS Safari mime type: audio/mp4 added before ogg fallback
 *  7. Correct file extension: .m4a for mp4, .webm for webm, .ogg for ogg
 *  8. getUserMedia simplified constraints — no sampleRate that breaks iOS
 *  9. AudioContext created BEFORE async getUserMedia — prevents iOS suspended state
 * 10. recordingActiveRef — hard guard against concurrent startRecording calls
 * 11. Container non-passive touchmove blocks iOS page bounce during swipe
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Paperclip, Smile, Mic, X,
  Reply, Edit2, Image as ImageIcon, Trash2, Lock,
} from 'lucide-react';
import toast from 'react-hot-toast';

/* ─── Emoji picker ───────────────────────────────────────────────────────── */
const EMOJI_GROUPS = {
  '😊': ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😜','😝','🤑','🤗','🤩','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','🥱','😴'],
  '👍': ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','🤲','🤝','🙏'],
  '❤️': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖','💘','💝'],
};

const EmojiPicker = ({ onSelect, onClose }) => {
  const [tab, setTab] = useState('😊');
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute bottom-full mb-2 right-0 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50" style={{ animation: 'miPopUp 0.15s ease' }}>
      <div className="flex border-b border-slate-100">
        {Object.keys(EMOJI_GROUPS).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`flex-1 py-2 text-lg ${tab === k ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>{k}</button>
        ))}
      </div>
      <div className="p-2 max-h-48 overflow-y-auto">
        <div className="grid grid-cols-8 gap-0.5">
          {EMOJI_GROUPS[tab].map((e) => (
            <button key={e} onClick={() => onSelect(e)} className="text-xl p-1 hover:bg-slate-50 rounded-lg">{e}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ─── File chip ──────────────────────────────────────────────────────────── */
const FileChip = ({ file, onRemove }) => {
  const isImage    = file.type.startsWith('image/');
  const previewUrl = isImage ? URL.createObjectURL(file) : null;
  return (
    <div className="relative inline-flex items-center gap-1.5 bg-slate-100 rounded-xl px-2.5 py-1.5 text-xs max-w-[140px]">
      {isImage ? <img src={previewUrl} alt="" className="w-8 h-8 rounded-lg object-cover" /> : <span>📎</span>}
      <span className="truncate text-slate-700">{file.name}</span>
      <button onClick={onRemove} className="ml-0.5 text-slate-400 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
    </div>
  );
};

/* ─── Live mic waveform ──────────────────────────────────────────────────── */
const BAR_COUNT = 28;
const LiveWave = ({ bars }) => (
  <div className="flex items-center gap-px overflow-hidden" style={{ height: '28px' }}>
    {bars.map((level, i) => (
      <div key={i} className="rounded-full bg-red-400" style={{
        width: '2px',
        height: `${Math.max(3, Math.round(level * 24))}px`,
        opacity: 0.55 + level * 0.45,
      }} />
    ))}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════
   MessageInput
═══════════════════════════════════════════════════════════════════════════ */
const MessageInput = ({
  onSendMessage, onTyping, disabled,
  replyTo, onCancelReply,
  editingMessage, onCancelEdit,
}) => {

  const [message,    setMessage]    = useState('');
  const [files,      setFiles]      = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showEmoji,  setShowEmoji]  = useState(false);

  const [recMode,   setRecMode]   = useState('idle');
  const [recSecs,   setRecSecs]   = useState(0);
  const [slideX,    setSlideX]    = useState(0);
  const [cancelled, setCancelled] = useState(false);
  const [waveBars,  setWaveBars]  = useState(() => Array(BAR_COUNT).fill(0.15));

  const textareaRef        = useRef(null);
  const fileInputRef       = useRef(null);
  const containerRef       = useRef(null);
  const mediaRecRef        = useRef(null);
  const chunksRef          = useRef([]);
  const timerRef           = useRef(null);
  const holdTimerRef       = useRef(null);
  const startXRef          = useRef(0);
  const startTRef          = useRef(0);
  const recStartRef        = useRef(0);
  const cancelledRef       = useRef(false);
  const audioCtxRef        = useRef(null);
  const analyserRef        = useRef(null);
  const rafRef             = useRef(null);
  const recModeRef         = useRef('idle');       // FIX 3: never stale in event handlers
  const recordingActiveRef = useRef(false);        // FIX 10: double-start guard

  const CANCEL_AT = 80;
  const MIN_SECS  = 1;

  // FIX 3: always update ref alongside state
  const setRecModeSync = useCallback((m) => {
    recModeRef.current = m;
    setRecMode(m);
  }, []);

  /* FIX 11: block iOS bounce scroll while recording ─────────────────────── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const block = (e) => { if (recModeRef.current === 'recording') e.preventDefault(); };
    el.addEventListener('touchmove', block, { passive: false });
    return () => el.removeEventListener('touchmove', block, { passive: false });
  }, []);

  useEffect(() => {
    if (editingMessage) { setMessage(editingMessage.content || ''); textareaRef.current?.focus(); }
    else setMessage('');
  }, [editingMessage]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);
  useEffect(() => { autoResize(); }, [message, autoResize]);

  const fmt = (s) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  /* ── RAF waveform ─────────────────────────────────────────────────────── */
  const startWaveLoop = useCallback(() => {
    const tick = () => {
      const analyser = analyserRef.current;
      if (!analyser) return;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(buf);
      const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
        const lo = Math.floor((i / BAR_COUNT) * buf.length);
        const hi = Math.min(Math.floor(((i + 1) / BAR_COUNT) * buf.length), buf.length);
        let sum = 0;
        for (let j = lo; j < hi; j++) sum += buf[j];
        return (sum / Math.max(1, hi - lo)) / 255;
      });
      setWaveBars(bars);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopWaveLoop = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    setWaveBars(Array(BAR_COUNT).fill(0.15));
  }, []);

  /* ══ VOICE CORE ══════════════════════════════════════════════════════════ */
  const startRecording = useCallback(async (initialMode = 'recording') => {
    if (recordingActiveRef.current) return;   // FIX 10: hard guard
    recordingActiveRef.current = true;
    cancelledRef.current = false;

    // FIX 9: create AudioContext synchronously — still inside user gesture
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    let ctx = null;
    try { ctx = new AudioCtx(); audioCtxRef.current = ctx; } catch (_) {}

    try {
      // FIX 8: no sampleRate / channelCount — causes OverconstrainedError on iOS
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // FIX 9 cont: connect stream to analyser now
      if (ctx) {
        try {
          if (ctx.state === 'suspended') await ctx.resume();
          const src = ctx.createMediaStreamSource(stream);
          const an  = ctx.createAnalyser();
          an.fftSize = 64; an.smoothingTimeConstant = 0.7;
          src.connect(an);
          analyserRef.current = an;
        } catch (_) { /* waveform is cosmetic — don't fail */ }
      }

      try { navigator.vibrate?.(30); } catch (_) {}

      // FIX 6 & 7: iOS only supports audio/mp4; use correct extension per mime
      let mime = '';
      if      (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) mime = 'audio/webm;codecs=opus';
      else if (MediaRecorder.isTypeSupported('audio/webm'))             mime = 'audio/webm';
      else if (MediaRecorder.isTypeSupported('audio/mp4'))              mime = 'audio/mp4';
      else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus'))  mime = 'audio/ogg;codecs=opus';
      // empty = let browser choose (safe last resort)

      const opts = { audioBitsPerSecond: 64_000 };
      if (mime) opts.mimeType = mime;

      const mr = new MediaRecorder(stream, opts);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };

      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        audioCtxRef.current?.close().catch(() => {});
        audioCtxRef.current = null;
        analyserRef.current = null;
        recordingActiveRef.current = false;

        if (cancelledRef.current) return;

        const elapsed = Math.max(1, Math.round((Date.now() - recStartRef.current) / 1000));
        if (elapsed < MIN_SECS) {
          toast('Hold longer to record', { icon: '🎤', duration: 2000 });
          return;
        }

        // FIX 7: correct extension
        const actualMime = mr.mimeType || mime || 'audio/webm';
        const ext = actualMime.includes('mp4') || actualMime.includes('m4a') ? '.m4a'
                  : actualMime.includes('ogg')                               ? '.ogg'
                  :                                                             '.webm';
        const blob = new Blob(chunksRef.current, { type: actualMime });
        const file = new File([blob], `voice-${Date.now()}${ext}`, { type: actualMime });
        onSendMessage('', 'audio', [file], { duration: elapsed });
      };

      mr.start(100);
      mediaRecRef.current = mr;
      recStartRef.current = Date.now();
      setRecModeSync(initialMode);
      setRecSecs(0);
      setSlideX(0);
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
      startWaveLoop();

    } catch (err) {
      recordingActiveRef.current = false;
      audioCtxRef.current?.close().catch(() => {});
      audioCtxRef.current = null;
      const msg = err.name === 'NotAllowedError'   ? 'Microphone blocked — allow access in settings'
                : err.name === 'NotFoundError'     ? 'No microphone found on this device'
                : err.name === 'AbortError'        ? 'Microphone in use by another app'
                : err.name === 'NotSupportedError' ? 'Voice messages not supported on this browser'
                :                                    'Could not access microphone';
      toast.error(msg);
      setRecModeSync('idle');
    }
  }, [onSendMessage, startWaveLoop, setRecModeSync]);

  const stopRecording = useCallback((cancel = false) => {
    cancelledRef.current = cancel;
    clearInterval(timerRef.current);
    clearTimeout(holdTimerRef.current);
    stopWaveLoop();
    if (mediaRecRef.current) {
      try { mediaRecRef.current.stop(); } catch (_) {}
      mediaRecRef.current = null;
    } else {
      recordingActiveRef.current = false;
    }
    if (cancel) { setCancelled(true); setTimeout(() => setCancelled(false), 700); }
    setRecModeSync('idle');
    setRecSecs(0);
    setSlideX(0);
  }, [stopWaveLoop, setRecModeSync]);

  useEffect(() => () => {
    stopRecording(true);
    audioCtxRef.current?.close().catch(() => {});
  }, [stopRecording]);

  /* ══ MIC POINTER EVENTS ══════════════════════════════════════════════════
     FIX 1: Pure Pointer Events only — no Touch Events in JSX.
     On mobile with style.touchAction='none', browser delivers pointer events
     for touch without firing duplicate touch events.

     FIX 2: No manual DOM event registration (attachMicRef removed entirely).

     FIX 5: setPointerCapture in onPointerDown routes all subsequent move/up
     events to the button element, even if the finger drifts outside —
     making onPointerLeave irrelevant and removing it prevents false cancels.

     FIX 3: All handlers read recModeRef.current — never a stale closure.
  ════════════════════════════════════════════════════════════════════════*/
  const onMicPointerDown = useCallback((e) => {
    if (disabled) return;
    // Capture so all subsequent events come here even outside element bounds
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    startXRef.current = e.clientX;
    startTRef.current = Date.now();
    setSlideX(0);
    holdTimerRef.current = setTimeout(() => {
      if (!recordingActiveRef.current) startRecording('recording');
    }, 200);
  }, [disabled, startRecording]);

  const onMicPointerMove = useCallback((e) => {
    if (recModeRef.current !== 'recording') return; // FIX 3
    const dx = Math.max(0, startXRef.current - e.clientX);
    setSlideX(dx);
    if (dx >= CANCEL_AT) { clearTimeout(holdTimerRef.current); stopRecording(true); }
  }, [stopRecording]);

  const onMicPointerUp = useCallback(() => {
    clearTimeout(holdTimerRef.current);
    const held = Date.now() - startTRef.current;
    const mode = recModeRef.current; // FIX 3

    if (mode === 'recording') { stopRecording(false); return; }
    // Quick tap → lock mode
    if (mode === 'idle' && held < 200 && !recordingActiveRef.current) {
      startRecording('locked');
    }
  }, [stopRecording, startRecording]);

  // FIX 4: system interruption (call, home swipe) — cancel gracefully
  const onMicPointerCancel = useCallback(() => {
    clearTimeout(holdTimerRef.current);
    if (recModeRef.current !== 'idle') stopRecording(true);
  }, [stopRecording]);

  /* ── Standard handlers ────────────────────────────────────────────────── */
  const handleSubmit = (e) => {
    e?.preventDefault();
    const trimmed = message.trim();
    if (!trimmed && files.length === 0) return;
    if (disabled) return;
    onSendMessage(trimmed, files.length > 0 ? 'file' : 'text', files);
    setMessage('');
    setFiles([]);
    if (textareaRef.current) { textareaRef.current.style.height = 'auto'; textareaRef.current.focus(); }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
    if (e.key === 'Escape') { onCancelReply?.(); onCancelEdit?.(); }
  };

  const handleChange = (e) => {
    setMessage(e.target.value);
    if (onTyping && e.target.value) onTyping();
  };

  const handleEmojiSelect = (emoji) => {
    const el = textareaRef.current;
    if (!el) { setMessage((m) => m + emoji); return; }
    const start = el.selectionStart, end = el.selectionEnd;
    setMessage(message.slice(0, start) + emoji + message.slice(end));
    setTimeout(() => { el.selectionStart = el.selectionEnd = start + emoji.length; el.focus(); }, 0);
  };

  const handleDragOver  = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop      = (e) => {
    e.preventDefault(); setIsDragging(false);
    const valid = Array.from(e.dataTransfer.files).filter((f) => f.size < 25 * 1024 * 1024);
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
  };
  const handleFileInput = (e) => {
    const valid = Array.from(e.target.files || []).filter((f) => f.size < 25 * 1024 * 1024);
    setFiles((prev) => [...prev, ...valid].slice(0, 5));
    e.target.value = '';
  };

  const canSend     = (message.trim().length > 0 || files.length > 0) && !disabled;
  const isRecording = recMode === 'recording' || recMode === 'locked';
  const isLocked    = recMode === 'locked';
  const cancelPct   = Math.min(slideX / CANCEL_AT, 1);

  return (
    <div
      ref={containerRef}
      className={`bg-white border-t border-slate-200 shrink-0 relative overflow-hidden
        ${isDragging ? 'ring-2 ring-inset ring-primary-400 bg-primary-50' : ''}
        ${cancelled  ? 'bg-red-50' : ''}`}
      style={{ transition: 'background 0.3s' }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-primary-600">
            <ImageIcon className="w-10 h-10" />
            <p className="font-semibold">Drop files to attach</p>
          </div>
        </div>
      )}

      {(replyTo || editingMessage) && !isRecording && (
        <div className={`flex items-start gap-2 px-4 py-2 border-b border-slate-100 text-xs ${editingMessage ? 'bg-amber-50' : 'bg-slate-50'}`}>
          <div className={`flex-shrink-0 mt-0.5 ${editingMessage ? 'text-amber-500' : 'text-primary-500'}`}>
            {editingMessage ? <Edit2 className="w-4 h-4" /> : <Reply className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-semibold ${editingMessage ? 'text-amber-700' : 'text-primary-700'}`}>
              {editingMessage ? 'Editing message' : `Replying to ${replyTo?.sender?.username || 'message'}`}
            </p>
            <p className="text-slate-500 truncate">{(editingMessage || replyTo)?.content || '[attachment]'}</p>
          </div>
          <button onClick={() => { onCancelReply?.(); onCancelEdit?.(); }} className="text-slate-400 hover:text-slate-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {files.length > 0 && !isRecording && (
        <div className="flex flex-wrap gap-2 px-4 pt-3 pb-1">
          {files.map((file, i) => (
            <FileChip key={i} file={file} onRemove={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} />
          ))}
        </div>
      )}

      {/* ════ RECORDING UI ════════════════════════════════════════════════ */}
      {isRecording && (
        <div className="px-3 py-2.5 flex items-center gap-3"
          style={{ animation: 'miRecBarIn 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}>

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => stopRecording(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0
              bg-slate-100 active:bg-red-100 text-slate-400 active:text-red-500"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="flex-1 flex items-center gap-2 min-w-0 overflow-hidden">
            <div className="relative w-3 h-3 shrink-0">
              <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
              <span className="relative block w-3 h-3 rounded-full bg-red-500" />
            </div>
            <span className="font-mono font-bold text-sm text-red-600 tabular-nums shrink-0">{fmt(recSecs)}</span>
            <div className="flex-1 min-w-0 overflow-hidden"><LiveWave bars={waveBars} /></div>

            {!isLocked && (
              <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0 pointer-events-none select-none"
                style={{ opacity: Math.max(0.08, 1 - cancelPct * 1.8), transform: `translateX(${-slideX * 0.3}px)`, transition: 'transform 0.04s linear' }}>
                <span className="text-[10px]">◀◀</span>
                <span className="whitespace-nowrap">Slide to cancel</span>
              </div>
            )}
            {isLocked && (
              <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <Lock className="w-3.5 h-3.5" /><span>Recording</span>
              </div>
            )}
          </div>

          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => stopRecording(false)}
            className="w-10 h-10 rounded-full bg-primary-600 active:bg-primary-700 flex items-center justify-center text-white shrink-0 shadow-md shadow-primary-200"
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}

      {isRecording && !isLocked && cancelPct > 0 && (
        <div className="absolute inset-0 bg-red-500 pointer-events-none" style={{ opacity: cancelPct * 0.08 }} />
      )}
      {cancelled && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
          style={{ animation: 'miCancelFlash 0.6s ease forwards' }}>
          <span className="text-sm font-semibold text-red-500 flex items-center gap-1.5">
            <Trash2 className="w-4 h-4" /> Recording cancelled
          </span>
        </div>
      )}

      {/* ════ NORMAL INPUT ROW ════════════════════════════════════════════ */}
      {!isRecording && (
        <div className="px-3 py-2.5 flex items-end gap-2">
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={disabled}
            className="w-9 h-9 rounded-full hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0"
            style={{ WebkitTapHighlightColor: 'transparent' }}>
            <Paperclip className="w-5 h-5" />
          </button>
          <input ref={fileInputRef} type="file" multiple
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
            className="hidden" onChange={handleFileInput} />

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={editingMessage ? 'Edit message...' : 'Type a message...'}
              disabled={disabled}
              rows={1}
              className={`w-full resize-none py-2 px-3.5 pr-9 rounded-2xl text-sm border outline-none transition-all
                ${editingMessage
                  ? 'border-amber-300 focus:ring-2 focus:ring-amber-200 bg-amber-50'
                  : 'border-slate-200 focus:ring-2 focus:ring-primary-200 bg-slate-50 focus:bg-white'}`}
              style={{ minHeight: '40px', maxHeight: '128px' }}
            />
            <div className="absolute right-2.5 bottom-2">
              <button type="button" onClick={() => setShowEmoji((s) => !s)} disabled={disabled}
                className="text-slate-400 hover:text-slate-600"
                style={{ WebkitTapHighlightColor: 'transparent' }}>
                <Smile style={{ width: '18px', height: '18px' }} />
              </button>
              {showEmoji && (
                <EmojiPicker onSelect={(e) => { handleEmojiSelect(e); setShowEmoji(false); }} onClose={() => setShowEmoji(false)} />
              )}
            </div>
          </div>

          {canSend ? (
            <button type="button" onClick={handleSubmit} disabled={disabled}
              className="w-10 h-10 rounded-full bg-primary-600 active:bg-primary-700 disabled:opacity-50 flex items-center justify-center text-white flex-shrink-0 shadow-md shadow-primary-200"
              style={{ WebkitTapHighlightColor: 'transparent' }}>
              <Send style={{ width: '18px', height: '18px' }} />
            </button>
          ) : (
            /* ── MIC BUTTON ─────────────────────────────────────────────────
               FIX 1: NO onTouchStart/End — Pointer Events only
               FIX 2: NO ref-based DOM listener registration
               FIX 5: NO onPointerLeave — capture handles gesture globally
               style.touchAction='none' owns the touch gesture for this element
            ──────────────────────────────────────────────────────────────── */
            <button
              type="button"
              disabled={disabled}
              onPointerDown={onMicPointerDown}
              onPointerMove={onMicPointerMove}
              onPointerUp={onMicPointerUp}
              onPointerCancel={onMicPointerCancel}
              className="w-10 h-10 rounded-full hover:bg-slate-100 active:bg-slate-200 flex items-center justify-center text-slate-500 flex-shrink-0 select-none hover:text-primary-600"
              style={{
                touchAction: 'none',
                WebkitTapHighlightColor: 'transparent',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes miPopUp     { from{opacity:0;transform:scale(.95) translateY(4px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes miRecBarIn  { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }
        @keyframes miCancelFlash {
          0%  {opacity:0;transform:scale(.8)}
          20% {opacity:1;transform:scale(1.05)}
          80% {opacity:1}
          100%{opacity:0}
        }
      `}</style>
    </div>
  );
};

export default MessageInput;