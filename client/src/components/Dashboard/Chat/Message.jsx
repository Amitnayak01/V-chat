import { useState, useRef, memo, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Check, CheckCheck, Star, Reply, MoreHorizontal,
  Edit2, AlertCircle, X, Download, ZoomIn, ZoomOut,
  RotateCw, FileText, Music, Film, Play, Pause, Mic,
  File, Volume2, VolumeX,
} from 'lucide-react';
import { format } from 'date-fns';
import ForwardModal from './ForwardModal';

/* ─── Reaction bar ──────────────────────────────────────────────────────── */
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const ReactionPicker = ({ onSelect, onClose }) => {
  const ref = useRef(null);
  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-1 left-0 bg-white rounded-full shadow-xl border border-slate-100 px-2 py-1.5 flex items-center gap-1 z-30 animate-in"
      style={{ animation: 'reactionPop 0.15s ease' }}
    >
      {QUICK_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => { onSelect(emoji); onClose(); }}
          className="text-xl hover:scale-125 transition-transform p-1 rounded-full hover:bg-slate-50"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};

/* ─── Reply preview — WhatsApp style ────────────────────────────────────── */
const ReplyPreview = ({ replyTo, isOwn, onReplyBubbleClick }) => {
  if (!replyTo) return null;

  const atts     = replyTo.attachments || [];
  const firstAtt = atts[0];
  const mime     = firstAtt?.mimeType || '';
  const url      = firstAtt?.url || '';
  const t        = replyTo.type || '';

  const isImage = t === 'image' || mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url);
  const isVideo = t === 'video' || mime.startsWith('video/') || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
  const isAudio = t === 'audio' || mime.startsWith('audio/') || /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(url)
                  || firstAtt?.name?.startsWith('voice-');
  const isPdf   = mime === 'application/pdf' || /\.pdf(\?|$)/i.test(url);
  const hasAtt  = atts.length > 0 || ['image', 'video', 'audio', 'file'].includes(t);

  const attLabel = isAudio ? '🎤 Voice message'
                 : isVideo ? '📹 Video'
                 : isImage ? '📷 Photo'
                 : isPdf   ? '📄 Document'
                 : hasAtt  ? '📎 File'
                 : null;

  const thumb = (() => {
    if (isImage && firstAtt?.url) {
      return (
        <img src={firstAtt.url} alt="" style={{
          width: 46, height: 46, objectFit: 'cover',
          borderRadius: 4, flexShrink: 0, display: 'block',
        }} />
      );
    }
    if (isVideo && firstAtt?.url) {
      return (
        <div style={{
          width: 46, height: 46, borderRadius: 4, background: '#111',
          flexShrink: 0, display: 'flex', alignItems: 'center',
          justifyContent: 'center', position: 'relative', overflow: 'hidden',
        }}>
          <video src={firstAtt.url} style={{
            width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7,
          }} preload="metadata" muted />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <polygon points="5,3 19,12 5,21" />
            </svg>
          </div>
        </div>
      );
    }
    if (isAudio || isVideo || isImage || hasAtt) {
      const Icon = isAudio ? Mic : isVideo ? Film : isImage ? Film : File;
      return (
        <div style={{
          width: 46, height: 46, borderRadius: 4, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isOwn ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)',
        }}>
          <Icon style={{ width: 20, height: 20, color: isOwn ? 'rgba(255,255,255,0.85)' : '#54656f' }} />
        </div>
      );
    }
    return null;
  })();

  const displayText = replyTo.content || attLabel || '';

  const handleClick = (e) => {
    if (!onReplyBubbleClick || !replyTo.messageId) return;
    e.stopPropagation();
    onReplyBubbleClick(replyTo.messageId);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        display: 'flex', alignItems: 'stretch',
        borderRadius: 8, overflow: 'hidden', marginBottom: 6,
        background:  isOwn ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.06)',
        borderLeft: `4px solid ${isOwn ? '#128c7e' : '#25d366'}`,
        minHeight: 46,
        cursor: onReplyBubbleClick ? 'pointer' : 'default',
        transition: 'filter 0.15s ease',
      }}
      className="reply-preview-bubble"
    >
      <div style={{
        flex: 1, padding: '6px 8px', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
      }}>
        <span style={{
          fontSize: 12, fontWeight: 700, lineHeight: 1.3,
          color: isOwn ? '#7ee3b8' : '#25d366',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
        }}>
          {replyTo.senderUsername || 'Unknown'}
        </span>
        <span style={{
          fontSize: 12, lineHeight: 1.3,
          color: isOwn ? 'rgba(255,255,255,0.8)' : '#667781',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
        }}>
          {displayText}
        </span>
      </div>
      {thumb && <div style={{ flexShrink: 0 }}>{thumb}</div>}
    </div>
  );
};

/* ─── Status tick ─────────────────────────────────────────────────────────── */
const StatusTick = ({ status, isRead, isDelivered }) => {
  const resolved =
      (status === 'failed')                     ? 'failed'
    : (status === 'sending')                    ? 'sending'
    : (isRead  || status === 'read')            ? 'read'
    : (isDelivered || status === 'delivered')   ? 'delivered'
    :                                             'sent';

  if (resolved === 'sending') return <span className="text-white/50 text-xs">⏳</span>;
  if (resolved === 'failed')  return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
  if (resolved === 'read')    return <CheckCheck  className="w-3.5 h-3.5" style={{ color: '#53bdeb' }} />;
  if (resolved === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-white/70" />;
  return <Check className="w-3.5 h-3.5 text-white/70" />;
};

/* ─── WhatsApp-style Voice Player ─────────────────────────────────────────── */
const VoicePlayer = ({ url, isOwn, sender, createdAt, status, isRead, isDelivered }) => {
  const [playing,  setPlaying]  = useState(false);
  const [current,  setCurrent]  = useState(0);
  const [duration, setDuration] = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(false);
  const [dragging, setDragging] = useState(false);
  const [speed,    setSpeed]    = useState(1);
  const [played,   setPlayed]   = useState(false);

  const audioRef    = useRef(null);
  const trackRef    = useRef(null);
  const thumbRef    = useRef(null);
  const barsRef     = useRef([]);
  const draggingRef = useRef(false);
  const rafRef      = useRef(null);
  const durationRef = useRef(0);
  const currentRef  = useRef(0);
  const lastTickRef = useRef(0);

  const TD      = 13;
  const TD_DRAG = 16;

  const OWN         = isOwn;
  const BG          = OWN ? '#005c4b'                : '#ffffff';
  const BAR_EMPTY   = OWN ? 'rgba(255,255,255,0.28)' : '#c8d0d8';
  const BAR_PLAYED  = OWN ? 'rgba(255,255,255,0.45)' : '#a8b3bc';
  const BAR_FILL    = OWN ? 'rgba(255,255,255,0.92)' : '#25d366';
  const THUMB_C     = OWN ? '#ffffff'                : '#25d366';
  const TIME_C      = OWN ? 'rgba(255,255,255,0.58)' : '#8a9ab0';
  const ICON_C      = OWN ? '#ffffff'                : '#3b4a54';
  const TICK_C      = OWN ? 'rgba(255,255,255,0.60)' : '#8a9ab0';
  const TICK_READ_C = '#53bdeb';
  const BARS        = [2,4,7,5,9,6,8,4,10,7,5,9,6,8,3,7,10,5,6,9,4,8,6,10,5,7,4,9,6,8,5,7,3,9,6,4];

  const fmtDur = (s) => {
    if (!s || !isFinite(s) || s <= 0) return '0:00';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };
  const fmtClock = (ts) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }); }
    catch { return ''; }
  };

  const updateDOM = useCallback((t) => {
    const track = trackRef.current;
    const thumb = thumbRef.current;
    const audio = audioRef.current;
    if (!track || !thumb) return;
    const liveDur = audio?.duration;
    const dur = (liveDur > 0 && isFinite(liveDur)) ? liveDur : (durationRef.current > 0 ? durationRef.current : 0);
    const pct = dur > 0 ? Math.max(0, Math.min(1, t / dur)) : 0;
    const w   = track.offsetWidth;
    const r   = TD / 2;
    const x   = Math.max(r, Math.min(w - r, pct * w));
    thumb.style.left = `${x}px`;
    const filledUpTo = pct * BARS.length;
    barsRef.current.forEach((bar, i) => {
      if (!bar) return;
      const filled = (i + 0.5) <= filledUpTo;
      bar.style.background = filled ? BAR_FILL : (played ? BAR_PLAYED : BAR_EMPTY);
    });
  }, [OWN, played]);

  const startRAF = useCallback(() => {
    const tick = (ts) => {
      const audio = audioRef.current;
      if (!audio) return;
      const liveDur = audio.duration;
      if (liveDur > 0 && isFinite(liveDur) && durationRef.current !== liveDur) {
        durationRef.current = liveDur;
        setDuration(liveDur);
      }
      if (!draggingRef.current) {
        const t = audio.currentTime;
        currentRef.current = t;
        updateDOM(t);
        if (ts - lastTickRef.current > 250) {
          lastTickRef.current = ts;
          setCurrent(t);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [updateDOM]);

  const stopRAF = useCallback(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onMeta    = () => {
      const d = audio.duration;
      if (d > 0 && isFinite(d)) { durationRef.current = d; setDuration(d); }
      setLoading(false);
    };
    const onPlay    = () => { setPlaying(true);  if (!rafRef.current) startRAF(); };
    const onPause   = () => { setPlaying(false); stopRAF(); };
    const onEnded   = () => {
      setPlaying(false); setPlayed(true); stopRAF();
      currentRef.current = 0; audio.currentTime = 0;
      setCurrent(0); updateDOM(0);
    };
    const onError   = () => { setError(true); setLoading(false); stopRAF(); };
    const onCanPlay = () => setLoading(false);

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play',           onPlay);
    audio.addEventListener('pause',          onPause);
    audio.addEventListener('ended',          onEnded);
    audio.addEventListener('error',          onError);
    audio.addEventListener('canplay',        onCanPlay);

    if (audio.readyState >= 1) {
      const d = audio.duration;
      if (d > 0 && isFinite(d)) { durationRef.current = d; setDuration(d); }
      setLoading(false);
    }
    return () => {
      stopRAF();
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play',           onPlay);
      audio.removeEventListener('pause',          onPause);
      audio.removeEventListener('ended',          onEnded);
      audio.removeEventListener('error',          onError);
      audio.removeEventListener('canplay',        onCanPlay);
    };
  }, [url, startRAF, stopRAF, updateDOM]);

  useEffect(() => { durationRef.current = duration; }, [duration]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
    } else {
      audio.playbackRate = speed;
      if (!rafRef.current) startRAF();
      setPlaying(true);
      audio.play().catch(() => { setError(true); stopRAF(); setPlaying(false); });
    }
  }, [playing, speed, startRAF, stopRAF]);

  const cycleSpeed = useCallback((e) => {
    e.stopPropagation();
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }, [speed]);

  const getPct = (e) => {
    const t = trackRef.current;
    if (!t || !durationRef.current) return null;
    const r = t.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  };
  const applySeek = (pct) => {
    if (pct === null || !audioRef.current) return;
    const t = pct * durationRef.current;
    audioRef.current.currentTime = t;
    currentRef.current = t;
    setCurrent(t);
    updateDOM(t);
  };

  const onTrackPointerDown = (e) => {
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
    draggingRef.current = true;
    setDragging(true);
    applySeek(getPct(e));
  };
  const onTrackPointerMove = (e) => {
    if (!draggingRef.current) return;
    const p = getPct(e);
    if (p !== null) {
      const t = p * durationRef.current;
      currentRef.current = t;
      setCurrent(t);
      updateDOM(t);
    }
  };
  const onTrackPointerUp     = (e) => { applySeek(getPct(e)); draggingRef.current = false; setDragging(false); };
  const onTrackPointerCancel = ()  => { draggingRef.current = false; setDragging(false); };

  const avatarUrl    = sender?.avatar;
  const avatarLetter = sender?.username?.[0]?.toUpperCase() || '🎤';
  const resolved     = status || (isRead ? 'read' : isDelivered ? 'delivered' : 'sent');
  const TickIcon     = (resolved === 'read' || resolved === 'delivered') ? CheckCheck : Check;
  const tickColor    = resolved === 'read' ? TICK_READ_C : TICK_C;

  return (
    <div style={{
      background: BG, borderRadius: '10px',
      padding: '8px 10px 6px 8px',
      minWidth: '240px', maxWidth: '300px', width: '100%',
      boxSizing: 'border-box',
      boxShadow: OWN ? 'none' : '0 1px 2px rgba(0,0,0,0.10)',
      userSelect: 'none',
    }}>
      <audio ref={audioRef} src={url} preload="metadata" />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Avatar */}
        <div style={{ position: 'relative', flexShrink: 0, width: '42px', height: '42px' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '50%', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: OWN ? 'rgba(255,255,255,0.18)' : '#e9edef',
            color: OWN ? '#fff' : '#54656f', fontSize: '15px', fontWeight: 700,
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : avatarLetter
            }
          </div>
          {!playing && (
            <div style={{
              position: 'absolute', bottom: '-1px', right: '-1px',
              width: '18px', height: '18px', borderRadius: '50%',
              background: '#25d366', border: `2px solid ${BG}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="8" height="10" viewBox="0 0 8 10" fill="none">
                <rect x="2.5" y="0.5" width="3" height="5.5" rx="1.5" fill="white"/>
                <path d="M1 4.5C1 6.43 2.343 8 4 8C5.657 8 7 6.43 7 4.5" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
                <line x1="4" y1="8" x2="4" y2="9.5" stroke="white" strokeWidth="1.1" strokeLinecap="round"/>
              </svg>
            </div>
          )}
          {playing && (
            <button onClick={cycleSpeed} style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(0,0,0,0.52)', border: 'none', outline: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '11px', fontWeight: 800,
              fontFamily: 'sans-serif', color: '#fff', width: '100%', height: '100%',
            }}>
              {speed === 1 ? '1×' : speed === 1.5 ? '1.5×' : '2×'}
            </button>
          )}
        </div>

        {/* Play/Pause */}
        <button onClick={togglePlay} disabled={loading || error} style={{
          flexShrink: 0, background: 'none', border: 'none', outline: 'none', padding: 0,
          cursor: loading || error ? 'default' : 'pointer',
          color: ICON_C, opacity: loading || error ? 0.4 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '24px', height: '24px',
        }}>
          {loading
            ? <span style={{ width: '15px', height: '15px', border: `2px solid ${ICON_C}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'block', animation: 'vpSpin 0.7s linear infinite' }} />
            : error
              ? <span style={{ fontSize: '13px', fontWeight: 700 }}>!</span>
              : playing
                ? <Pause style={{ width: '20px', height: '20px' }} />
                : <Play  style={{ width: '20px', height: '20px', marginLeft: '2px' }} />
          }
        </button>

        {/* Waveform track */}
        <div
          ref={trackRef}
          style={{ flex: 1, minWidth: 0, position: 'relative', height: '34px', cursor: 'pointer', overflow: 'visible', touchAction: 'none' }}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerCancel}
        >
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: '2px', pointerEvents: 'none' }}>
            {BARS.map((h, i) => (
              <div
                key={i}
                ref={(el) => { barsRef.current[i] = el; }}
                style={{ flex: 1, borderRadius: '2px', height: `${h * 2 + 1}px`, background: BAR_EMPTY, transition: 'background 0.05s' }}
              />
            ))}
          </div>
          <div
            ref={thumbRef}
            style={{
              position: 'absolute', top: '50%', left: `${TD / 2}px`,
              transform: 'translateY(-50%)', pointerEvents: 'none', zIndex: 3,
              transition: dragging ? 'left 0.0s' : 'none',
            }}
          >
            <div style={{
              width:  `${dragging ? TD_DRAG : TD}px`,
              height: `${dragging ? TD_DRAG : TD}px`,
              borderRadius: '50%', background: THUMB_C,
              boxShadow: '0 1px 5px rgba(0,0,0,0.35)',
              transform: 'translateX(-50%)',
              transition: 'width 0.1s, height 0.1s',
            }} />
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: '4px', paddingLeft: '52px',
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: '11px', color: TIME_C, letterSpacing: '0.01em' }}>
          {playing || dragging ? fmtDur(current) : fmtDur(duration)}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <span style={{ fontSize: '11px', fontFamily: 'sans-serif', color: TIME_C }}>
            {fmtClock(createdAt)}
          </span>
          {OWN && (
            <TickIcon style={{ width: '14px', height: '14px', color: tickColor, flexShrink: 0 }} />
          )}
        </div>
      </div>

      <style>{`@keyframes vpSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

/* ─── WhatsApp-style Video Thumbnail ─────────────────────────────────────────*/
const VideoThumbnail = ({ url, name, onClick, borderRadius, style }) => {
  const [duration,    setDuration]    = useState(0);
  const [thumbLoaded, setThumbLoaded] = useState(false);
  const vidRef = useRef(null);

  const fmtDur = (s) => {
    if (!s || !isFinite(s) || s <= 0) return '';
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  useEffect(() => {
    const v = vidRef.current;
    if (!v) return;
    const onMeta = () => {
      if (v.duration > 0 && isFinite(v.duration)) setDuration(v.duration);
      setThumbLoaded(true);
    };
    v.addEventListener('loadedmetadata', onMeta);
    v.addEventListener('loadeddata', () => setThumbLoaded(true));
    if (v.readyState >= 1) {
      if (v.duration > 0 && isFinite(v.duration)) setDuration(v.duration);
      setThumbLoaded(true);
    }
    return () => v.removeEventListener('loadedmetadata', onMeta);
  }, [url]);

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer group overflow-hidden bg-black"
      style={{ borderRadius: borderRadius || 16, width: '100%', height: '100%', ...style }}
    >
      <video
        ref={vidRef}
        src={url}
        preload="metadata"
        muted
        playsInline
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: thumbLoaded ? 0.85 : 0, transition: 'opacity 0.2s' }}
      />
      {!thumbLoaded && (
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a2a1a 0%, #0d1a0d 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Film style={{ width: 28, height: 28, color: 'rgba(255,255,255,0.3)' }} />
        </div>
      )}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0)' }} className="group-hover:bg-black/10 transition-colors">
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.4)', transition: 'transform 0.15s ease, background 0.15s ease' }} className="group-hover:scale-110 group-hover:bg-black/70">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginLeft: 2 }}>
            <polygon points="5,3 19,12 5,21" />
          </svg>
        </div>
      </div>
      {duration > 0 && (
        <div style={{ position: 'absolute', bottom: 6, left: 7, background: 'rgba(0,0,0,0.52)', color: '#fff', fontSize: 11, fontWeight: 600, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 5, backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', gap: 3, userSelect: 'none', letterSpacing: '0.02em' }}>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="white" style={{ opacity: 0.85 }}>
            <polygon points="2,1 9,5 2,9" />
          </svg>
          {fmtDur(duration)}
        </div>
      )}
    </div>
  );
};

/* ─── Fullscreen Video Player Modal ──────────────────────────────────────────*/
const VideoModal = ({ src, name, onClose }) => {
  const vidRef  = useRef(null);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [onClose]);

  const toggleMute = () => {
    if (vidRef.current) { vidRef.current.muted = !muted; setMuted(!muted); }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#000' }}>
      <video src={src} muted style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px) brightness(0.25) saturate(1.4)', transform: 'scale(1.1)', pointerEvents: 'none' }} preload="metadata" />
      <div className="relative flex items-center justify-between px-4 py-3 shrink-0" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)', zIndex: 1 }}>
        <div className="flex items-center gap-3 min-w-0">
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Film style={{ width: 16, height: 16, color: 'rgba(255,255,255,0.7)' }} />
          </div>
          <span className="text-white/90 text-sm font-medium truncate max-w-[50vw]">{name || 'Video'}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggleMute} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors" title={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <a href={src} download={name} target="_blank" rel="noreferrer" className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Download">
            <Download className="w-5 h-5" />
          </a>
          <button onClick={onClose} className="p-2 text-white/60 hover:text-white hover:bg-white/10 rounded-full transition-colors ml-1" title="Close (Esc)">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative flex items-center justify-center p-4 overflow-hidden" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ zIndex: 1 }}>
        <video ref={vidRef} src={src} controls autoPlay playsInline muted={muted} style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, boxShadow: '0 8px 40px rgba(0,0,0,0.6)', outline: 'none' }} />
      </div>
      <style>{`video::-webkit-media-controls-panel { background: linear-gradient(transparent, rgba(0,0,0,0.7)); }`}</style>
    </div>
  );
};

/* ─── Gallery lightbox ────────────────────────────────────────────────────── */
const Gallery = ({ items, index: initialIndex, onClose }) => {
  const [idx,    setIdx]    = useState(initialIndex);
  const [zoom,   setZoom]   = useState(1);
  const [rotate, setRotate] = useState(0);
  const thumbsRef = useRef(null);
  const thumbRefs = useRef([]);

  const total = items.length;
  const cur   = items[idx] || items[0];
  const isVid = cur?.type === 'video';

  useEffect(() => { setZoom(1); setRotate(0); }, [idx]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape')     onClose();
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % total);
      if (e.key === 'ArrowLeft')  setIdx((i) => (i - 1 + total) % total);
    };
    window.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = ''; };
  }, [onClose, total]);

  useEffect(() => {
    const el = thumbRefs.current[idx];
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [idx]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#0a0a0a' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        {!isVid
          ? <img src={cur.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.18) saturate(1.3)', transform: 'scale(1.08)' }} />
          : <video src={cur.src} muted style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(28px) brightness(0.18) saturate(1.3)', transform: 'scale(1.08)' }} preload="metadata" />
        }
      </div>

      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-2.5 shrink-0" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', zIndex: 1 }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.10)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {isVid
              ? <Film style={{ width: 15, height: 15, color: 'rgba(255,255,255,0.65)' }} />
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21,15 16,10 5,21"/></svg>
            }
          </div>
          <div className="min-w-0">
            <p className="text-white/90 text-sm font-medium truncate max-w-[38vw] leading-tight">{cur.name || (isVid ? 'Video' : 'Image')}</p>
            {total > 1 && <p className="text-white/38 text-xs leading-tight">{idx + 1} of {total}</p>}
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {!isVid && (
            <>
              <button onClick={() => setZoom((z) => Math.min(z + 0.25, 5))} className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Zoom in"><ZoomIn style={{ width: 18, height: 18 }} /></button>
              <button onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))} className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Zoom out"><ZoomOut style={{ width: 18, height: 18 }} /></button>
              <button onClick={() => setRotate((r) => (r + 90) % 360)} className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Rotate"><RotateCw style={{ width: 18, height: 18 }} /></button>
            </>
          )}
          <a href={cur.src} download={cur.name} target="_blank" rel="noreferrer" className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Download"><Download style={{ width: 18, height: 18 }} /></a>
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-full transition-colors ml-1" title="Close (Esc)"><X style={{ width: 18, height: 18 }} /></button>
        </div>
      </div>

      {/* Main view */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden" style={{ zIndex: 1 }}>
        {total > 1 && (
          <button onClick={() => setIdx((i) => (i - 1 + total) % total)} className="absolute left-3 z-10 flex items-center justify-center transition-all hover:scale-105 active:scale-95" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M12.5 15L7.5 10L12.5 5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
        <div className="w-full h-full flex items-center justify-center" style={{ padding: total > 1 ? '16px 60px' : '16px 24px' }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          {isVid
            ? <video key={cur.src} src={cur.src} controls autoPlay playsInline style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, boxShadow: '0 8px 48px rgba(0,0,0,0.55)', outline: 'none', background: '#000' }} />
            : <img key={cur.src} src={cur.src} alt={cur.name || 'Image'} draggable={false} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', transform: `scale(${zoom}) rotate(${rotate}deg)`, transition: 'transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)', userSelect: 'none', borderRadius: zoom > 1 ? 0 : 8, boxShadow: '0 8px 48px rgba(0,0,0,0.5)' }} />
          }
        </div>
        {!isVid && zoom !== 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs text-white/80" style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', userSelect: 'none' }}>
            {Math.round(zoom * 100)}%
          </div>
        )}
        {total > 1 && (
          <button onClick={() => setIdx((i) => (i + 1) % total)} className="absolute right-3 z-10 flex items-center justify-center transition-all hover:scale-105 active:scale-95" style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M7.5 5L12.5 10L7.5 15" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {total > 1 && (
        <div className="relative shrink-0 py-3 px-4" style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(16px)', zIndex: 1 }}>
          <div ref={thumbsRef} className="flex gap-2 overflow-x-auto items-center justify-center" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {items.map((item, i) => (
              <button key={i} ref={(el) => { thumbRefs.current[i] = el; }} onClick={() => setIdx(i)} style={{ flexShrink: 0, width: 54, height: 54, borderRadius: 8, overflow: 'hidden', border: i === idx ? '2.5px solid #25d366' : '2.5px solid transparent', opacity: i === idx ? 1 : 0.45, transform: i === idx ? 'scale(1.05)' : 'scale(1)', transition: 'all 0.18s ease', padding: 0, background: '#1a1a1a', cursor: 'pointer', position: 'relative' }}>
                {item.type === 'video'
                  ? <>
                      <video src={item.src} muted preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: 0.8 }} />
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="7" height="7" viewBox="0 0 10 10" fill="white"><polygon points="2,1 9,5 2,9"/></svg>
                        </div>
                      </div>
                    </>
                  : <img src={item.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} draggable={false} />
                }
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── Attachment renderer ─────────────────────────────────────────────────── */
const AttachmentRenderer = ({ attachments, isOwn, sender, message }) => {
  const [lightbox,   setLightbox]   = useState(null);
  const [videoModal, setVideoModal] = useState(null);

  if (!attachments?.length) return null;

  const fmtSize = (n) => !n || n === 0 ? ''
    : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB`
    : `${(n / 1024).toFixed(0)} KB`;

  const getType = (att) => {
    const mime = att.mimeType || '';
    const url  = att.url      || '';
    if (mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url)) return 'image';
    if (mime.startsWith('video/') || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url))               return 'video';
    if (mime.startsWith('audio/') || /\.(mp3|ogg|wav|m4a)(\?|$)/i.test(url))               return 'audio';
    if (mime === 'application/pdf' || /\.pdf(\?|$)/i.test(url))                              return 'pdf';
    return 'file';
  };

  const media  = attachments.filter((a) => ['image', 'video'].includes(getType(a)));
  const others = attachments.filter((a) => !['image', 'video'].includes(getType(a)));
  const SHOW   = Math.min(media.length, 4);
  const extra  = media.length - 4;

  const galleryItems = media.map((a) => ({
    src:  a.url,
    name: a.name || (getType(a) === 'video' ? 'Video' : 'Image'),
    type: getType(a),
  }));

  const R          = '16px';
  const cellRadius = (i, total) => {
    if (total === 1) return R;
    if (total === 2) return i === 0 ? `${R} 0 0 ${R}` : `0 ${R} ${R} 0`;
    if (total === 3) {
      if (i === 0) return `${R} ${R} 0 0`;
      if (i === 1) return `0 0 0 ${R}`;
      return `0 0 ${R} 0`;
    }
    if (i === 0) return `${R} 0 0 0`;
    if (i === 1) return `0 ${R} 0 0`;
    if (i === 2) return `0 0 0 ${R}`;
    return `0 0 ${R} 0`;
  };
  const cellHeight = (total) => total === 1 ? '220px' : total === 2 ? '190px' : '145px';

  const mediaGrid = media.length > 0 && (
    <div style={{
      display: 'grid', gap: '2px', borderRadius: R, overflow: 'hidden',
      marginTop: message?.replyTo ? 6 : 0,
      gridTemplateColumns: media.length === 1 ? '1fr' : '1fr 1fr',
      gridTemplateRows: media.length === 3 ? `${cellHeight(3)} ${cellHeight(3)}` : undefined,
    }}>
      {media.slice(0, SHOW).map((att, i) => {
        const type    = getType(att);
        const isLast  = i === SHOW - 1 && extra > 0;
        const isThird = media.length === 3 && i === 0;
        const br      = cellRadius(i, SHOW);
        const openGallery = () => setLightbox({ items: galleryItems, index: i });

        return (
          <div key={i} className="relative overflow-hidden bg-black" style={{ height: cellHeight(SHOW), borderRadius: br, gridColumn: isThird ? '1 / -1' : undefined, cursor: 'pointer' }}>
            {type === 'video'
              ? <VideoThumbnail url={att.url} name={att.name} onClick={openGallery} borderRadius={br} style={{ height: cellHeight(SHOW) }} />
              : (
                <div className="group relative w-full h-full" onClick={openGallery}>
                  <img src={att.url} alt={att.name || 'Image'} className="w-full h-full object-cover" style={{ transition: 'transform 0.2s ease', display: 'block' }} loading="lazy" onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.03)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} onError={(e) => { e.target.style.display = 'none'; }} />
                  {!isLast && (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                      <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                    </div>
                  )}
                </div>
              )
            }
            {isLast && (
              <div onClick={openGallery} className="absolute inset-0 flex items-center justify-center cursor-pointer" style={{ background: 'rgba(0,0,0,0.52)', zIndex: 2 }}>
                <span style={{ color: '#fff', fontSize: '28px', fontWeight: 700, letterSpacing: '-0.5px', textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>+{extra + 1}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const otherFiles = others.length > 0 && (
    <div className="mt-1 space-y-1">
      {others.map((att, i) => {
        const type = getType(att);
        if (type === 'audio') return (
          <VoicePlayer key={i} url={att.url} isOwn={isOwn} sender={sender} createdAt={message?.createdAt} status={message?.status} isRead={message?.isRead} isDelivered={message?.isDelivered} />
        );
        const Icon     = type === 'pdf' ? FileText : File;
        const iconClr  = isOwn ? 'text-white/80' : 'text-primary-600';
        const bgColor  = isOwn
          ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100';
        return (
          <a key={i} href={att.url} target="_blank" rel="noreferrer" download={att.name} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-medium transition-colors ${bgColor}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isOwn ? 'bg-white/20' : 'bg-primary-50'}`}>
              <Icon className={`w-4 h-4 ${iconClr}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium">{att.name || 'File'}</p>
              {att.size > 0 && <p className="opacity-50 text-[10px] mt-0.5">{fmtSize(att.size)}</p>}
            </div>
            <Download className="w-3.5 h-3.5 shrink-0 opacity-50" />
          </a>
        );
      })}
    </div>
  );

  return (
    <>
      {mediaGrid}
      {otherFiles}
      {lightbox && createPortal(
        <Gallery items={lightbox.items} index={lightbox.index} onClose={() => setLightbox(null)} />,
        document.body
      )}
      {videoModal && createPortal(
        <VideoModal src={videoModal.src} name={videoModal.name} onClose={() => setVideoModal(null)} />,
        document.body
      )}
    </>
  );
};

/* ─── Reactions display ──────────────────────────────────────────────────── */
const ReactionsDisplay = ({ reactions, currentUserId, onReact }) => {
  if (!reactions?.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => {
        const count   = r.userIds?.length || 0;
        const reacted = r.userIds?.some((id) => id === currentUserId || id?._id === currentUserId);
        return (
          <button
            key={r.emoji}
            onClick={() => onReact(r.emoji)}
            className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-all
              ${reacted
                ? 'bg-primary-50 border-primary-300 text-primary-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
          >
            <span>{r.emoji}</span>
            {count > 1 && <span className="font-semibold">{count}</span>}
          </button>
        );
      })}
    </div>
  );
};

/* ─── Forward icon SVG (reused in action bar) ────────────────────────────── */
const ForwardIcon = ({ size = 13, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 10 20 15 15 20"/>
    <path d="M4 4v7a4 4 0 004 4h12"/>
  </svg>
);

/* ─── Main Message component ─────────────────────────────────────────────── */
const Message = memo(({
  message,
  isOwnMessage,
  currentUserId,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onStar,
  onForward,          // ← NEW: called with (message) when forward is triggered
  prevMessage,
  onReplyBubbleClick,
  onlineUsers,        // ← passed through to ForwardModal
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showPicker,  setShowPicker]  = useState(false);
  // Forward modal state lives here (for action-bar forward button)
  const [showForward, setShowForward] = useState(false);

  const [swipeX,     setSwipeX]     = useState(0);
  const [isSnapping, setIsSnapping] = useState(false);
  const swipeTouchX  = useRef(0);
  const swipeTouchY  = useRef(0);
  const swipeDir     = useRef(null);
  const swipeFired   = useRef(false);
  const SWIPE_THRESHOLD = 65;

  const isStarred = message.starredBy?.some?.((id) => id === currentUserId || id?._id === currentUserId);

  const prevSenderId = prevMessage?.sender?._id || prevMessage?.sender;
  const thisSenderId = message.sender?._id || message.sender;
  const isGrouped    = prevSenderId === thisSenderId &&
    Math.abs(new Date(message.createdAt) - new Date(prevMessage?.createdAt)) < 60_000 * 3;

  const formatTime = (ts) => {
    try { return format(new Date(ts), 'h:mm a'); } catch { return ''; }
  };

  /* ── Swipe to reply (mobile) ─────────────────────────────────────────── */
  const onSwipeTouchStart = useCallback((e) => {
    if (message._optimistic || message.deletedForEveryone) return;
    swipeTouchX.current = e.touches[0].clientX;
    swipeTouchY.current = e.touches[0].clientY;
    swipeDir.current    = null;
    swipeFired.current  = false;
    setIsSnapping(false);
  }, [message._optimistic, message.deletedForEveryone]);

  const onSwipeTouchMove = useCallback((e) => {
    const dx = e.touches[0].clientX - swipeTouchX.current;
    const dy = e.touches[0].clientY - swipeTouchY.current;
    if (!swipeDir.current) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      swipeDir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (swipeDir.current !== 'h') return;
    if (dx <= 0) return;
    const capped = Math.min(dx * 0.55, SWIPE_THRESHOLD * 0.95);
    setSwipeX(capped);
    if (!swipeFired.current && dx >= SWIPE_THRESHOLD / 0.55) {
      swipeFired.current = true;
      try { navigator.vibrate?.(30); } catch (_) {}
      onReply(message);
    }
  }, [message, onReply, SWIPE_THRESHOLD]);

  const onSwipeTouchEnd = useCallback(() => {
    if (swipeX === 0) return;
    setIsSnapping(true);
    setSwipeX(0);
    setTimeout(() => setIsSnapping(false), 320);
    swipeDir.current = null;
  }, [swipeX]);

  /* ── Deleted message placeholder ────────────────────────────────────── */
  if (message.deletedForEveryone) {
    return (
      <div className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-0.5 px-1`}>
        <div className="text-xs text-slate-400 italic px-3 py-1.5 bg-slate-100 rounded-2xl">
          🚫 This message was deleted
        </div>
      </div>
    );
  }

  const replyIconOpacity = Math.min(swipeX / 40, 1);
  const replyIconScale   = 0.5 + Math.min(swipeX / SWIPE_THRESHOLD, 1) * 0.5;
  const bubbleTranslate  = swipeX;

  /* ── Handle forward: prefer parent's onForward callback, fallback to local modal ── */
  const handleForwardClick = () => {
    if (typeof onForward === 'function') {
      onForward(message);
    } else {
      setShowForward(true);
    }
  };

  return (
    <>
      <div
        className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} mb-0.5 group relative`}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => { setShowActions(false); setShowPicker(false); }}
        onTouchStart={onSwipeTouchStart}
        onTouchMove={onSwipeTouchMove}
        onTouchEnd={onSwipeTouchEnd}
        style={{ touchAction: 'pan-y' }}
      >
        {/* Swipe reply icon */}
        {swipeX > 0 && (
          <div style={{
            position: 'absolute',
            left:  isOwnMessage ? 'auto' : `${Math.max(swipeX - 38, 0)}px`,
            right: isOwnMessage ? `${Math.max(swipeX - 38, 0)}px` : 'auto',
            top: '50%',
            transform: `translateY(-50%) scale(${replyIconScale})`,
            opacity: replyIconOpacity,
            transition: isSnapping ? 'all 0.28s cubic-bezier(0.25,1.4,0.5,1)' : 'none',
            zIndex: 0,
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(0,0,0,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 17 4 12 9 7" />
              <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
            </svg>
          </div>
        )}

        {/* Sender avatar */}
        {!isOwnMessage && (
          <div
            className="w-8 mr-2 mt-auto shrink-0"
            style={{
              transform: `translateX(${bubbleTranslate}px)`,
              transition: isSnapping ? 'transform 0.28s cubic-bezier(0.25,1.4,0.5,1)' : 'none',
              willChange: 'transform',
            }}
          >
            {!isGrouped ? (
              message.sender?.avatar
                ? <img src={message.sender.avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
                : <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white text-xs font-bold">
                    {message.sender?.username?.[0]?.toUpperCase() || '?'}
                  </div>
            ) : null}
          </div>
        )}

        <div
          className="relative max-w-[72%] flex flex-col"
          style={{
            transform: `translateX(${bubbleTranslate}px)`,
            transition: isSnapping ? 'transform 0.28s cubic-bezier(0.25,1.4,0.5,1)' : 'none',
            willChange: 'transform',
            zIndex: 1,
          }}
        >
          {!isOwnMessage && !isGrouped && (
            <span className="text-xs text-slate-500 mb-0.5 pl-1 font-medium">
              {message.sender?.username}
            </span>
          )}

          {(() => {
            const _atts      = message.attachments || [];
            const _hasImages = _atts.some((a) => {
              const mime = a.mimeType || ''; const url = a.url || '';
              return mime.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|avif|svg)(\?|$)/i.test(url);
            });
            const _hasVideos = _atts.some((a) => {
              const mime = a.mimeType || ''; const url = a.url || '';
              return mime.startsWith('video/') || /\.(mp4|webm|ogg|mov)(\?|$)/i.test(url);
            });
            const _hasReply   = !!message.replyTo;
            const _isMediaOnly = (_hasImages || _hasVideos) && !message.content && !_hasReply && _atts.every((a) => {
              const mime = a.mimeType || ''; const url = a.url || '';
              return mime.startsWith('image/') || mime.startsWith('video/') ||
                /\.(jpg|jpeg|png|gif|webp|avif|svg|mp4|webm|ogg|mov)(\?|$)/i.test(url);
            });

            return (
              <div
                className={`relative rounded-2xl transition-all
                  ${_isMediaOnly ? '' : 'px-3.5 py-2'}
                  ${isOwnMessage
                    ? 'bg-[#005c4b] text-white rounded-br-md'
                    : 'bg-white text-slate-800 rounded-bl-md'
                  }
                  ${message._optimistic ? 'opacity-80' : ''}
                  ${message.status === 'failed' ? 'bg-red-500' : ''}
                `}
                style={{
                  animation: message._optimistic ? undefined : 'msgSlideIn 0.18s ease',
                  overflow: _isMediaOnly ? 'hidden' : 'visible',
                }}
              >
                {/* ── Forwarded label ──────────────────────────────────────── */}
                {message.forwarded && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    marginBottom: 4,
                    fontSize: 11, fontStyle: 'italic',
                    color: isOwnMessage ? 'rgba(255,255,255,0.52)' : '#94a3b8',
                    userSelect: 'none',
                    // Add left padding when inside a padded bubble
                    paddingLeft: _isMediaOnly ? 10 : 0,
                    paddingTop:  _isMediaOnly ? 8  : 0,
                  }}>
                    <ForwardIcon size={11} color={isOwnMessage ? 'rgba(255,255,255,0.52)' : '#94a3b8'} />
                    {/*
                     * "Forwarded many times" — matches WhatsApp's threshold of 5.
                     * forwardCount on the MESSAGE is the count of times this
                     * specific clone (or its ancestor) has been forwarded.
                     */}
                    {(message.forwardCount || 0) > 5
                      ? 'Forwarded many times'
                      : 'Forwarded'
                    }
                  </div>
                )}

                <ReplyPreview
                  replyTo={message.replyTo}
                  isOwn={isOwnMessage}
                  onReplyBubbleClick={onReplyBubbleClick}
                />

                {/* Legacy forwardedFrom label (backward compat with old schema) */}
                {message.forwardedFrom && !message.forwarded && (
                  <div className={`text-xs flex items-center gap-1 mb-1 opacity-70 ${isOwnMessage ? 'text-white/70' : 'text-slate-500'}`}>
                    ↪️ Forwarded
                  </div>
                )}

                {(() => {
                  const isVoiceOnly = message.attachments?.length === 1 && !message.content &&
                    (message.attachments[0]?.mimeType?.startsWith('audio/') ||
                     /voice-message|\.webm|\.ogg|\.mp3|\.m4a/i.test(message.attachments[0]?.url || '') ||
                     message.attachments[0]?.name?.startsWith('voice-'));

                  const spacerW = 52 + (isStarred ? 14 : 0) + (message.edited ? 28 : 0) + (isOwnMessage ? 16 : 0);

                  const timestamp = !isVoiceOnly && (
                    <span
                      className={`inline-flex items-center gap-0.5 select-none ${isOwnMessage ? 'text-white/60' : 'text-slate-400'}`}
                      style={{ fontSize: '11px', lineHeight: 1, whiteSpace: 'nowrap' }}
                    >
                      {isStarred && <Star className="w-2.5 h-2.5 fill-current text-amber-400" />}
                      {message.edited && <span style={{ opacity: 0.7, marginRight: 2 }}>edited</span>}
                      {formatTime(message.createdAt)}
                      {isOwnMessage && (
                        <StatusTick status={message.status} isRead={message.isRead} isDelivered={message.isDelivered} />
                      )}
                    </span>
                  );

                  return (
                    <>
                      <AttachmentRenderer attachments={message.attachments} isOwn={isOwnMessage} sender={message.sender} message={message} />

                      {message.content ? (
                        <div style={{ position: 'relative' }}>
                          <p className="text-sm whitespace-pre-wrap break-words" style={{ lineHeight: '1.45', margin: 0 }}>
                            {message.content}
                            {!isVoiceOnly && (
                              <span style={{ display: 'inline-block', width: `${spacerW}px`, height: '1px' }} aria-hidden="true" />
                            )}
                          </p>
                          {!isVoiceOnly && (
                            <span style={{ position: 'absolute', bottom: 0, right: 0, lineHeight: 1 }}>
                              {timestamp}
                            </span>
                          )}
                        </div>
                      ) : (
                        !isVoiceOnly && (() => {
                          const _atts2    = message.attachments || [];
                          const _allMedia = _atts2.every((a) => {
                            const mime = a.mimeType || ''; const url = a.url || '';
                            return mime.startsWith('image/') || mime.startsWith('video/') ||
                              /\.(jpg|jpeg|png|gif|webp|avif|svg|mp4|webm|ogg|mov)(\?|$)/i.test(url);
                          });
                          if (_allMedia) {
                            return (
                              <span style={{
                                position: 'absolute', bottom: '7px', right: '8px',
                                background: 'rgba(0,0,0,0.42)', borderRadius: '10px',
                                padding: '2px 6px',
                                display: 'inline-flex', alignItems: 'center', gap: '3px',
                                fontSize: '11px', lineHeight: 1,
                                color: 'rgba(255,255,255,0.92)', userSelect: 'none',
                                backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
                                pointerEvents: 'none', zIndex: 2,
                              }}>
                                {isStarred && <Star className="w-2.5 h-2.5 fill-current text-amber-400" />}
                                {message.edited && <span style={{ opacity: 0.8, marginRight: 1 }}>edited</span>}
                                {formatTime(message.createdAt)}
                                {isOwnMessage && (
                                  <StatusTick status={message.status} isRead={message.isRead} isDelivered={message.isDelivered} />
                                )}
                              </span>
                            );
                          }
                          return (
                            <div className={`flex items-center justify-end gap-1 mt-1 px-3 pb-1 ${isOwnMessage ? 'text-white/60' : 'text-slate-400'}`}>
                              {timestamp}
                            </div>
                          );
                        })()
                      )}
                    </>
                  );
                })()}
              </div>
            );
          })()}

          <ReactionsDisplay
            reactions={message.reactions}
            currentUserId={currentUserId}
            onReact={(emoji) => onReact(message._id, emoji)}
          />

          {showPicker && (
            <div className={`absolute ${isOwnMessage ? 'right-0' : 'left-0'} bottom-full mb-1 z-30`}>
              <ReactionPicker
                onSelect={(emoji) => onReact(message._id, emoji)}
                onClose={() => setShowPicker(false)}
              />
            </div>
          )}
        </div>

        {/* ── Action bar (hover) ───────────────────────────────────────── */}
        {showActions && !message._optimistic && (
          <div className={`absolute top-0 ${isOwnMessage ? 'right-full mr-1' : 'left-full ml-1'} flex items-center gap-0.5 z-20`}>
            {/* React */}
            <button
              onClick={() => setShowPicker((s) => !s)}
              className="w-7 h-7 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center text-sm hover:bg-slate-50"
              title="React"
            >
              😊
            </button>

            {/* Reply */}
            <button
              onClick={() => onReply(message)}
              className="w-7 h-7 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:bg-slate-50 text-slate-600"
              title="Reply"
            >
              <Reply className="w-3.5 h-3.5" />
            </button>

            {/* Edit (own text-only messages) */}
            {isOwnMessage && message.content && !message.attachments?.length && (
              <button
                onClick={() => onEdit(message)}
                className="w-7 h-7 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:bg-slate-50 text-slate-600"
                title="Edit"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Star */}
            <button
              onClick={() => onStar(message._id)}
              className={`w-7 h-7 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:bg-slate-50
                ${isStarred ? 'text-amber-400' : 'text-slate-400'}`}
              title="Star"
            >
              <Star className="w-3.5 h-3.5" fill={isStarred ? 'currentColor' : 'none'} />
            </button>

            {/* Forward ── triggers parent callback OR local modal */}
            <button
              onClick={handleForwardClick}
              className="w-7 h-7 rounded-full bg-white shadow-md border border-slate-100 flex items-center justify-center hover:bg-slate-50 text-slate-600"
              title="Forward"
            >
              <ForwardIcon size={13} />
            </button>
          </div>
        )}
      </div>

      {/* ── ForwardModal (fallback: only shown when onForward prop not provided) ── */}
      {showForward && (
        <ForwardModal
          message={message}
          onClose={() => setShowForward(false)}
          onlineUsers={onlineUsers || new Set()}
          currentUserId={currentUserId}
        />
      )}

      <style>{`
        @keyframes msgSlideIn {
          from { opacity: 0; transform: translateY(4px) }
          to   { opacity: 1; transform: translateY(0) }
        }
        @keyframes reactionPop {
          from { opacity: 0; transform: scale(0.85) }
          to   { opacity: 1; transform: scale(1) }
        }
        .reply-preview-bubble:hover {
          filter: brightness(0.93);
        }
      `}</style>
    </>
  );
});

Message.displayName = 'Message';
export default Message;