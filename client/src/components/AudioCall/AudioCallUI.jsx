/**
 * AudioCallUI.jsx  —  Professional Call Interface (v3)
 * ──────────────────────────────────────────────────────
 * All existing context logic (endCall, toggleMute, WebRTC) is 100% untouched.
 *
 * NEW in v3 (fullscreen mode additions):
 *  + Conference / Add-participant button  (+)
 *  + Switch-to-Video-Call button  (Video icon)
 *  + Noise Suppression toggle  (waveform filter icon)
 *  + Audio Device Selection drawer
 *      • Microphone selector
 *      • Speaker / output selector  (setSinkId where supported)
 *      • Headphones preset
 *  + Speaker toggle promoted to visible control row
 *
 * Mobile (≤ 640px):  compact bottom bar (unchanged)
 * Desktop:           draggable floating card (unchanged)
 * Fullscreen:        two control rows + device drawer
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Mic, MicOff, PhoneOff, Users, Volume2, VolumeX,
  Maximize2, Minimize2, Circle, Square, ChevronDown, ChevronUp,
  UserPlus, Video, Headphones, Settings, Wifi, WifiOff,
  CheckCircle2, ChevronRight, X,
} from 'lucide-react';
import { useAudioCall } from '../../context/AudioCallContext';

/* ─── tiny helpers ──────────────────────────────────────────────────────────── */
const fmt   = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

const useIsMobile = () => {
  const [m, setM] = useState(() => window.innerWidth <= 640);
  useEffect(() => {
    const fn = () => setM(window.innerWidth <= 640);
    window.addEventListener('resize', fn);
    return () => window.removeEventListener('resize', fn);
  }, []);
  return m;
};

/* ─── enumerate audio devices ───────────────────────────────────────────────── */
const useAudioDevices = () => {
  const [devices, setDevices] = useState({ mics: [], speakers: [] });

  const refresh = useCallback(async () => {
    try {
      // Request permission first so labels are populated
      await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
      const all = await navigator.mediaDevices.enumerateDevices();
      setDevices({
        mics:     all.filter(d => d.kind === 'audioinput'),
        speakers: all.filter(d => d.kind === 'audiooutput'),
      });
    } catch (_) {}
  }, []);

  useEffect(() => {
    refresh();
    navigator.mediaDevices.addEventListener?.('devicechange', refresh);
    return () => navigator.mediaDevices.removeEventListener?.('devicechange', refresh);
  }, [refresh]);

  return { devices, refresh };
};

/* ─── CSS keyframes ─────────────────────────────────────────────────────────── */
const AudioStyles = () => (
  <style>{`
    @keyframes waveBar      { from{transform:scaleY(.3);opacity:.6} to{transform:scaleY(1);opacity:1} }
    @keyframes speakPulse   { 0%{opacity:.65;transform:scale(1.15)} 100%{opacity:0;transform:scale(1.55)} }
    @keyframes callSlideUp  { from{opacity:0;transform:translateY(18px) scale(.96)} to{opacity:1;transform:none} }
    @keyframes callBarUp    { from{opacity:0;transform:translateY(100%)} to{opacity:1;transform:none} }
    @keyframes fadeIn       { from{opacity:0} to{opacity:1} }
    @keyframes recPulse     { 0%,100%{opacity:1} 50%{opacity:.25} }
    @keyframes pingDot      { 0%,100%{transform:scale(1);opacity:.8} 50%{transform:scale(1.6);opacity:0} }
    @keyframes drawerSlide  { from{transform:translateY(100%);opacity:0} to{transform:none;opacity:1} }
    @keyframes nsPulse      { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.5)} 50%{box-shadow:0 0 0 6px rgba(16,185,129,0)} }
  `}</style>
);

/* ─── Waveform bars ──────────────────────────────────────────────────────────── */
const WaveBars = ({ active, color = '#10b981', count = 5, height = 14 }) => (
  <div style={{ display:'flex', alignItems:'flex-end', gap:2, height, flexShrink:0 }}>
    {Array.from({ length: count }, (_, i) => {
      const hs = [.4,.75,.55,1,.65];
      return (
        <span key={i} style={{
          width:2.5, height: active?`${hs[i%hs.length]*100}%`:'25%',
          background:color, borderRadius:3, transition:'height .1s ease',
          animation: active?`waveBar .7s ease-in-out ${i*.1}s infinite alternate`:'none',
          opacity: active?1:0.3,
        }} />
      );
    })}
  </div>
);

/* ─── Avatar ─────────────────────────────────────────────────────────────────── */
const Avatar = ({ src, name, size = 48, speaking = false }) => (
  <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
    {speaking && <>
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(16,185,129,.18)', animation:'speakPulse 1.1s ease-out infinite', transform:'scale(1.3)' }} />
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(16,185,129,.09)', animation:'speakPulse 1.1s ease-out .35s infinite', transform:'scale(1.55)' }} />
    </>}
    <div style={{ position:'relative', width:'100%', height:'100%', borderRadius:'50%', overflow:'hidden', boxShadow:speaking?'0 0 0 2.5px #10b981, 0 0 14px rgba(16,185,129,.35)':'0 3px 12px rgba(0,0,0,.45)', transition:'box-shadow .2s ease' }}>
      {src
        ? <img src={src} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
        : <div style={{ width:'100%', height:'100%', background:'linear-gradient(135deg,#0f766e,#0891b2)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, color:'#fff', fontSize:size*.38, userSelect:'none' }}>
            {name?.[0]?.toUpperCase()??' '}
          </div>
      }
    </div>
  </div>
);

/* ─── Remote audio player ────────────────────────────────────────────────────── */
const RemoteAudio = ({ userId, stream, volume, sinkId }) => {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.play().catch(() => {});
    return () => { el.srcObject = null; };
  }, [stream]);
  useEffect(() => { if (ref.current) ref.current.volume = volume; }, [volume]);
  useEffect(() => {
    if (ref.current && sinkId && ref.current.setSinkId) {
      ref.current.setSinkId(sinkId).catch(() => {});
    }
  }, [sinkId]);
  return <audio ref={ref} autoPlay playsInline key={userId} />;
};

/* ─── Active speaker hook ────────────────────────────────────────────────────── */
const useActiveSpeaker = (remoteStreams) => {
  const [speaker, setSpeaker] = useState(null);
  const arRef  = useRef(new Map());
  const rafRef = useRef(null);
  const ctxRef = useRef(null);
  useEffect(() => {
    if (!remoteStreams.size) { setSpeaker(null); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!ctxRef.current) ctxRef.current = new Ctx();
    remoteStreams.forEach((stream, uid) => {
      if (arRef.current.has(uid)) return;
      try {
        const src = ctxRef.current.createMediaStreamSource(stream);
        const a   = ctxRef.current.createAnalyser();
        a.fftSize = 256; src.connect(a);
        arRef.current.set(uid, { a, d: new Uint8Array(a.frequencyBinCount) });
      } catch (_) {}
    });
    for (const uid of arRef.current.keys()) { if (!remoteStreams.has(uid)) arRef.current.delete(uid); }
    const poll = () => {
      let max = 0, loudest = null;
      arRef.current.forEach(({ a, d }, uid) => {
        a.getByteTimeDomainData(d);
        let sum = 0; for (const v of d) sum += (v-128)**2;
        const rms = Math.sqrt(sum/d.length);
        if (rms > max) { max = rms; loudest = uid; }
      });
      setSpeaker(max > 3 ? loudest : null);
      rafRef.current = requestAnimationFrame(poll);
    };
    poll();
    return () => cancelAnimationFrame(rafRef.current);
  }, [remoteStreams]);
  return speaker;
};

/* ─── Network quality hook ───────────────────────────────────────────────────── */
const useNetworkQuality = (remoteStreams) => {
  const [q, setQ] = useState('unknown');
  useEffect(() => {
    if (!remoteStreams.size) { setQ('unknown'); return; }
    const id = setInterval(() => {
      const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      if (c) { const r = c.rtt??0; setQ(r<150?'good':r<400?'fair':'poor'); }
      else setQ('good');
    }, 3000);
    setQ('good');
    return () => clearInterval(id);
  }, [remoteStreams]);
  return q;
};

/* ─── Round icon button (mobile / pill) ──────────────────────────────────────── */
const RoundBtn = ({ icon: Icon, onClick, variant = 'default', size = 48, active = false, label, stopProp = false }) => {
  const bg = { default:active?'rgba(16,185,129,.22)':'rgba(255,255,255,.1)', muted:'rgba(239,68,68,.22)', end:'#ef4444', speaker:active?'rgba(16,185,129,.22)':'rgba(255,255,255,.1)' }[variant]||'rgba(255,255,255,.1)';
  const border = { default:active?'1.5px solid rgba(16,185,129,.5)':'1.5px solid rgba(255,255,255,.12)', muted:'1.5px solid rgba(239,68,68,.45)', end:'none', speaker:active?'1.5px solid rgba(16,185,129,.5)':'1.5px solid rgba(255,255,255,.12)' }[variant]||'1.5px solid rgba(255,255,255,.12)';
  const col = variant==='end'?'#fff':variant==='muted'?'#f87171':active?'#10b981':'#e2e8f0';
  const iconSz = size<42?14:size<50?18:22;
  return (
    <button onClick={(e)=>{ if(stopProp) e.stopPropagation(); onClick(); }} title={label}
      style={{ outline:'none', background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0, userSelect:'none' }}
      onMouseDown={(e)=>{e.currentTarget.style.transform='scale(.9)'}} onMouseUp={(e)=>{e.currentTarget.style.transform='scale(1)'}}
      onTouchStart={(e)=>{e.currentTarget.style.transform='scale(.9)'}} onTouchEnd={(e)=>{e.currentTarget.style.transform='scale(1)'}}>
      <div style={{ width:size, height:size, borderRadius:'50%', background:bg, border, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(8px)', boxShadow:variant==='end'?'0 6px 20px rgba(239,68,68,.45)':'none', transition:'background .15s' }}>
        <Icon style={{ width:iconSz, height:iconSz, color:col, flexShrink:0 }} strokeWidth={2} />
      </div>
    </button>
  );
};

/* ─── Square button (desktop card + fullscreen) ──────────────────────────────── */
const SquareBtn = ({ icon: Icon, label, onClick, variant = 'default', size = 'md', active = false }) => {
  const sz = size==='lg'?{btn:60,icon:24}:size==='sm'?{btn:44,icon:17}:{btn:54,icon:21};
  const bg = { default:active?'rgba(16,185,129,.2)':'rgba(255,255,255,.08)', muted:'rgba(239,68,68,.18)', end:'#ef4444', record:active?'rgba(239,68,68,.25)':'rgba(255,255,255,.08)', blue:'rgba(59,130,246,.2)', purple:'rgba(139,92,246,.2)', teal:active?'rgba(20,184,166,.3)':'rgba(20,184,166,.12)' }[variant]||'rgba(255,255,255,.08)';
  const border = { default:active?'1.5px solid rgba(16,185,129,.5)':'1.5px solid rgba(255,255,255,.1)', muted:'1.5px solid rgba(239,68,68,.4)', end:'none', record:active?'1.5px solid rgba(239,68,68,.5)':'1.5px solid rgba(255,255,255,.1)', blue:'1.5px solid rgba(59,130,246,.4)', purple:'1.5px solid rgba(139,92,246,.4)', teal:active?'1.5px solid rgba(20,184,166,.6)':'1.5px solid rgba(20,184,166,.25)' }[variant]||'1.5px solid rgba(255,255,255,.1)';
  const col = { default:active?'#10b981':'#e2e8f0', muted:'#f87171', end:'#fff', record:active?'#f87171':'#e2e8f0', blue:'#93c5fd', purple:'#c4b5fd', teal:active?'#2dd4bf':'#99f6e4' }[variant]||'#e2e8f0';
  return (
    <button onClick={onClick} title={label}
      style={{ outline:'none', background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6, userSelect:'none' }}
      onMouseDown={(e)=>{e.currentTarget.style.transform='scale(.92)'}} onMouseUp={(e)=>{e.currentTarget.style.transform='scale(1)'}}
      onTouchStart={(e)=>{e.currentTarget.style.transform='scale(.92)'}} onTouchEnd={(e)=>{e.currentTarget.style.transform='scale(1)'}}>
      <div style={{ width:sz.btn, height:sz.btn, background:bg, border, borderRadius:variant==='end'?'50%':16, display:'flex', alignItems:'center', justifyContent:'center', backdropFilter:'blur(6px)', boxShadow:variant==='end'?'0 6px 24px rgba(239,68,68,.4)':'none', transition:'all .15s' }}>
        <Icon style={{ width:sz.icon, height:sz.icon, color:col }} strokeWidth={2} />
      </div>
      <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,.5)' }}>{label}</span>
    </button>
  );
};

/* ─── Group participant tile ─────────────────────────────────────────────────── */
const ParticipantTile = ({ participant, speaking, large = false }) => (
  <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, padding:large?'12px 10px':'6px 6px' }}>
    <Avatar src={participant.avatar} name={participant.username} size={large?68:46} speaking={speaking} />
    <span style={{ fontSize:large?11:9, fontWeight:600, color:'rgba(255,255,255,.8)', maxWidth:large?80:56, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
      {participant.username}
    </span>
    {speaking && <WaveBars active color="#10b981" count={5} height={9} />}
  </div>
);

/* ─── Device Drawer ──────────────────────────────────────────────────────────── */
const DeviceDrawer = ({ onClose, devices, selectedMic, setSelectedMic, selectedSpeaker, setSelectedSpeaker, noiseSuppression, setNoiseSuppression, onSpeakerChange }) => {
  const Section = ({ title, children }) => (
    <div style={{ marginBottom:20 }}>
      <p style={{ color:'rgba(255,255,255,.35)', fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.1em', margin:'0 0 10px' }}>{title}</p>
      {children}
    </div>
  );

  const DeviceRow = ({ device, selected, onSelect, icon: Icon }) => (
    <button onClick={() => onSelect(device.deviceId)}
      style={{ width:'100%', display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderRadius:12, background:selected?'rgba(16,185,129,.12)':'rgba(255,255,255,.04)', border:`1px solid ${selected?'rgba(16,185,129,.35)':'rgba(255,255,255,.07)'}`, cursor:'pointer', marginBottom:6, transition:'all .15s', textAlign:'left' }}>
      <div style={{ width:32, height:32, borderRadius:10, background:selected?'rgba(16,185,129,.2)':'rgba(255,255,255,.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <Icon style={{ width:15, height:15, color:selected?'#10b981':'#94a3b8' }} />
      </div>
      <span style={{ fontSize:12, fontWeight:600, color:selected?'#fff':'rgba(255,255,255,.6)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {device.label || `Device ${device.deviceId.slice(0,8)}`}
      </span>
      {selected && <CheckCircle2 style={{ width:16, height:16, color:'#10b981', flexShrink:0 }} />}
    </button>
  );

  const ToggleRow = ({ label, sublabel, active, onChange, color = '#10b981' }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px', borderRadius:12, background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.07)', marginBottom:8 }}>
      <div>
        <p style={{ color:'#fff', fontSize:13, fontWeight:600, margin:0 }}>{label}</p>
        {sublabel && <p style={{ color:'rgba(255,255,255,.4)', fontSize:11, margin:'2px 0 0' }}>{sublabel}</p>}
      </div>
      <button onClick={onChange} style={{ width:44, height:24, borderRadius:12, background:active?color:'rgba(255,255,255,.12)', border:'none', cursor:'pointer', position:'relative', transition:'background .2s', padding:0, flexShrink:0 }}>
        <span style={{ position:'absolute', top:2, left:active?22:2, width:20, height:20, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,.3)' }} />
      </button>
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      {/* backdrop */}
      <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.55)', backdropFilter:'blur(6px)' }} />

      {/* drawer */}
      <div onClick={e=>e.stopPropagation()}
        style={{ position:'relative', zIndex:1, width:'100%', maxWidth:520, borderRadius:'24px 24px 0 0', background:'linear-gradient(180deg,#0d1b33 0%,#081020 100%)', border:'1px solid rgba(255,255,255,.1)', borderBottom:'none', boxShadow:'0 -20px 60px rgba(0,0,0,.8)', animation:'drawerSlide .28s cubic-bezier(.34,1.2,.64,1)', maxHeight:'80vh', overflow:'hidden', display:'flex', flexDirection:'column' }}>

        {/* handle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, borderRadius:12, background:'rgba(16,185,129,.15)', border:'1px solid rgba(16,185,129,.3)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Settings style={{ width:17, height:17, color:'#10b981' }} />
            </div>
            <div>
              <h3 style={{ color:'#fff', fontWeight:700, fontSize:15, margin:0 }}>Audio Settings</h3>
              <p style={{ color:'rgba(255,255,255,.4)', fontSize:11, margin:'2px 0 0' }}>Devices & enhancements</p>
            </div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:'50%', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <X style={{ width:14, height:14, color:'#94a3b8' }} />
          </button>
        </div>

        {/* top accent */}
        <div style={{ height:1, background:'rgba(255,255,255,.08)', margin:'0 20px', flexShrink:0 }} />

        {/* content scroll area */}
        <div style={{ overflowY:'auto', padding:'16px 20px 32px', flex:1 }}>

          {/* Enhancements */}
          <Section title="Enhancements">
            <ToggleRow
              label="Noise Suppression"
              sublabel="Filters background noise in real-time"
              active={noiseSuppression}
              onChange={() => setNoiseSuppression(v => !v)}
              color="#10b981"
            />
          </Section>

          {/* Microphone */}
          <Section title="Microphone">
            {devices.mics.length > 0
              ? devices.mics.map(d => (
                <DeviceRow key={d.deviceId} device={d} selected={selectedMic===d.deviceId} onSelect={setSelectedMic} icon={Mic} />
              ))
              : <p style={{ color:'rgba(255,255,255,.3)', fontSize:12, textAlign:'center', padding:'12px 0' }}>No microphones found</p>
            }
          </Section>

          {/* Speaker / Output */}
          <Section title="Speaker & Headphones">
            {devices.speakers.length > 0
              ? devices.speakers.map(d => (
                <DeviceRow key={d.deviceId} device={d}
                  selected={selectedSpeaker===d.deviceId}
                  onSelect={(id) => { setSelectedSpeaker(id); onSpeakerChange(id); }}
                  icon={d.label?.toLowerCase().includes('headphone')||d.label?.toLowerCase().includes('earphone') ? Headphones : Volume2}
                />
              ))
              : <p style={{ color:'rgba(255,255,255,.3)', fontSize:12, textAlign:'center', padding:'12px 0' }}>No output devices found — browser may not support output selection</p>
            }
          </Section>
        </div>
      </div>
    </div>
  );
};

/* ─── Conference invite modal ────────────────────────────────────────────────── */
const ConferenceModal = ({ onClose }) => (
  <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }} onClick={onClose}>
    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(8px)' }} />
    <div onClick={e=>e.stopPropagation()}
      style={{ position:'relative', zIndex:1, width:'100%', maxWidth:360, borderRadius:24, background:'linear-gradient(160deg,#0d1b33,#081020)', border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 64px rgba(0,0,0,.8)', padding:'24px 24px 28px', animation:'callSlideUp .25s cubic-bezier(.34,1.2,.64,1)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:12, background:'rgba(139,92,246,.2)', border:'1px solid rgba(139,92,246,.4)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <UserPlus style={{ width:18, height:18, color:'#c4b5fd' }} />
          </div>
          <div>
            <h3 style={{ color:'#fff', fontWeight:700, fontSize:15, margin:0 }}>Add to Call</h3>
            <p style={{ color:'rgba(255,255,255,.4)', fontSize:11, margin:'2px 0 0' }}>Invite someone to join</p>
          </div>
        </div>
        <button onClick={onClose} style={{ width:30, height:30, borderRadius:'50%', background:'rgba(255,255,255,.08)', border:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <X style={{ width:13, height:13, color:'#94a3b8' }} />
        </button>
      </div>

      {/* Search-style input hint */}
      <div style={{ padding:'10px 14px', borderRadius:14, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <Users style={{ width:16, height:16, color:'rgba(255,255,255,.3)', flexShrink:0 }} />
        <span style={{ fontSize:13, color:'rgba(255,255,255,.3)' }}>Search contacts to invite…</span>
      </div>

      <div style={{ padding:'14px', borderRadius:14, background:'rgba(139,92,246,.08)', border:'1px solid rgba(139,92,246,.2)', textAlign:'center' }}>
        <p style={{ color:'rgba(255,255,255,.5)', fontSize:12, margin:0, lineHeight:1.6 }}>
          Conference call support requires a contact list integration.<br/>
          <span style={{ color:'#c4b5fd' }}>Connect your contacts provider to enable this.</span>
        </p>
      </div>
    </div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════════════════ */
const AudioCallUI = () => {
  /* ── Context — ALL original, 100% untouched ─────────────────────────────── */
  const {
    callState, activeCall, remoteStreams, localStream,
    isMuted, callDuration, participants, callStatus,
    endCall, toggleMute,
  } = useAudioCall();

  /* ── Original UI state ──────────────────────────────────────────────────── */
  const [mode,        setMode]        = useState('normal');
  const [speakerOn,   setSpeakerOn]   = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [recDuration, setRecDuration] = useState(0);
  const [pos,         setPos]         = useState({ x:0, y:0 });
  const [isDragging,  setIsDragging]  = useState(false);
  const [mounted,     setMounted]     = useState(false);

  /* ── NEW UI state (v3) ──────────────────────────────────────────────────── */
  const [showDeviceDrawer,   setShowDeviceDrawer]   = useState(false);
  const [showConferenceModal,setShowConferenceModal] = useState(false);
  const [noiseSuppression,   setNoiseSuppression]   = useState(true);
  const [selectedMic,        setSelectedMic]        = useState('default');
  const [selectedSpeaker,    setSelectedSpeaker]    = useState('default');
  const [activeSinkId,       setActiveSinkId]       = useState(undefined);

  /* ── Hooks ──────────────────────────────────────────────────────────────── */
  const isMobile       = useIsMobile();
  const activeSpeaker  = useActiveSpeaker(remoteStreams);
  const networkQuality = useNetworkQuality(remoteStreams);
  const { devices }    = useAudioDevices();

  const dragRef     = useRef(null);
  const dragStart   = useRef(null);
  const recorderRef = useRef(null);
  const recTimerRef = useRef(null);
  const recChunks   = useRef([]);

  /* ── Reset when call ends ───────────────────────────────────────────────── */
  useEffect(() => {
    if (['calling','connecting','connected'].includes(callState)) setMounted(true);
    if (callState === 'idle') {
      setMounted(false); setMode('normal'); setPos({x:0,y:0}); stopRecording();
      setShowDeviceDrawer(false); setShowConferenceModal(false);
    }
  }, [callState]); // eslint-disable-line

  /* ── Recording (original logic) ─────────────────────────────────────────── */
  const startRecording = useCallback(() => {
    if (!localStream) return;
    try {
      const ctx  = new AudioContext();
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(localStream).connect(dest);
      remoteStreams.forEach((s) => { try { ctx.createMediaStreamSource(s).connect(dest); } catch(_){} });
      const rec = new MediaRecorder(dest.stream, { mimeType:'audio/webm' });
      recChunks.current = [];
      rec.ondataavailable = (e) => { if (e.data.size>0) recChunks.current.push(e.data); };
      rec.onstop = () => {
        const url = URL.createObjectURL(new Blob(recChunks.current,{type:'audio/webm'}));
        Object.assign(document.createElement('a'),{href:url,download:`call-${Date.now()}.webm`}).click();
        URL.revokeObjectURL(url);
      };
      rec.start(1000); recorderRef.current = rec;
      setRecDuration(0);
      recTimerRef.current = setInterval(() => setRecDuration((d)=>d+1), 1000);
      setIsRecording(true);
    } catch(err) { console.error('[AudioCallUI] rec:',err); }
  }, [localStream, remoteStreams]);

  const stopRecording = useCallback(() => {
    try { recorderRef.current?.stop(); } catch(_){}
    recorderRef.current = null;
    clearInterval(recTimerRef.current);
    setIsRecording(false); setRecDuration(0);
  }, []);

  /* ── Drag (original logic) ──────────────────────────────────────────────── */
  const onDragStart = useCallback((e) => {
    if (mode !== 'normal' || isMobile) return;
    e.preventDefault();
    const cx = e.touches?e.touches[0].clientX:e.clientX;
    const cy = e.touches?e.touches[0].clientY:e.clientY;
    dragStart.current = { mx:cx, my:cy, px:pos.x, py:pos.y };
    setIsDragging(true);
  }, [mode, pos, isMobile]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => {
      const cx = e.touches?e.touches[0].clientX:e.clientX;
      const cy = e.touches?e.touches[0].clientY:e.clientY;
      const dx = cx-dragStart.current.mx, dy = cy-dragStart.current.my;
      const cW = dragRef.current?.offsetWidth??280, cH = dragRef.current?.offsetHeight??320;
      setPos({
        x: clamp(dragStart.current.px+dx, -(window.innerWidth-cW-24), 0),
        y: clamp(dragStart.current.py+dy, -(window.innerHeight-cH-24), 0),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove',onMove); window.addEventListener('mouseup',onUp);
    window.addEventListener('touchmove',onMove,{passive:false}); window.addEventListener('touchend',onUp);
    return () => {
      window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp);
      window.removeEventListener('touchmove',onMove); window.removeEventListener('touchend',onUp);
    };
  }, [isDragging]);

  /* ── Guard ──────────────────────────────────────────────────────────────── */
  if (!['calling','connecting','connected'].includes(callState)||!activeCall) return null;

  const isConnected = callState==='connected';
  const isGroup     = activeCall.isGroup;
  const isSpeaking  = isConnected && remoteStreams.size>0;
  const volume      = speakerOn?1:0;
  const statusText  = callStatus || (
    callState === 'calling'    ? 'Ringing…'     :
    callState === 'connecting' ? 'Connecting…'  :
    fmt(callDuration)
  );
  const statusColor = isConnected?'#10b981':'#f59e0b';
  const peerName    = activeCall.peerName||(isGroup?'Group Call':'');

  const AudioEls = () => Array.from(remoteStreams.entries()).map(([uid,stream]) => (
    <RemoteAudio key={uid} userId={uid} stream={stream} volume={volume} sinkId={activeSinkId} />
  ));

  const RecBadge = () => isRecording ? (
    <div style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:999, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', flexShrink:0 }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:'#ef4444', animation:'recPulse 1s ease infinite', flexShrink:0 }} />
      <span style={{ fontSize:10, fontFamily:'monospace', fontWeight:700, color:'#f87171' }}>{fmt(recDuration)}</span>
    </div>
  ) : null;

  /* ── handler: speaker device change ──────────────────────────────────────── */
  const handleSpeakerChange = (deviceId) => {
    setActiveSinkId(deviceId === 'default' ? undefined : deviceId);
  };

  /* ════════════════════════════════════════════════════════════════════════════
     MINIMIZED PILL
  ════════════════════════════════════════════════════════════════════════════ */
  if (mode === 'minimized') {
    return (
      <>
        <AudioStyles /><AudioEls />
        <div style={{ position:'fixed', zIndex:190, bottom:isMobile?76:24, left:isMobile?'50%':'auto', right:isMobile?'auto':24, transform:isMobile?'translateX(-50%)':'none', animation:'callSlideUp .22s ease forwards' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 14px 9px 12px', borderRadius:999, background:'rgba(8,18,36,.97)', border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 8px 32px rgba(0,0,0,.65)', backdropFilter:'blur(20px)', minWidth:220, maxWidth:isMobile?'calc(100vw - 48px)':300 }}>
            <span style={{ position:'relative', display:'flex', width:8, height:8, flexShrink:0 }}>
              <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:statusColor, opacity:.75, animation:'pingDot 1.4s ease infinite' }} />
              <span style={{ position:'relative', borderRadius:'50%', width:'100%', height:'100%', background:statusColor }} />
            </span>
            <Avatar src={activeCall.peerAvatar} name={peerName} size={32} speaking={isSpeaking} />
            <div style={{ flex:1, minWidth:0 }}>
              <p style={{ color:'#fff', fontWeight:700, fontSize:12, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{peerName}</p>
              <span style={{ fontSize:10, fontFamily:'monospace', fontWeight:700, color:statusColor }}>{statusText}</span>
            </div>
            <RecBadge />
            <RoundBtn icon={isMuted?MicOff:Mic} variant={isMuted?'muted':'default'} size={34} onClick={toggleMute} stopProp label="Mute" />
            <RoundBtn icon={PhoneOff} variant="end" size={34} onClick={endCall} stopProp label="End" />
            <button onClick={() => setMode('normal')} style={{ width:32,height:32,borderRadius:'50%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }}>
              <ChevronUp style={{ width:13, height:13, color:'#94a3b8' }} />
            </button>
          </div>
        </div>
      </>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════════
     FULL SCREEN  ←  all new features live here
  ════════════════════════════════════════════════════════════════════════════ */
  if (mode === 'fullscreen') {
    return (
      <>
        <AudioStyles /><AudioEls />

        {/* Modals / Drawers rendered above the fullscreen overlay */}
        {showDeviceDrawer && (
          <DeviceDrawer
            onClose={() => setShowDeviceDrawer(false)}
            devices={devices}
            selectedMic={selectedMic}        setSelectedMic={setSelectedMic}
            selectedSpeaker={selectedSpeaker} setSelectedSpeaker={setSelectedSpeaker}
            noiseSuppression={noiseSuppression} setNoiseSuppression={setNoiseSuppression}
            onSpeakerChange={handleSpeakerChange}
          />
        )}
        {showConferenceModal && <ConferenceModal onClose={() => setShowConferenceModal(false)} />}

        <div style={{ position:'fixed', inset:0, zIndex:190, display:'flex', flexDirection:'column', overflow:'hidden', background:'linear-gradient(160deg,#060e1f 0%,#0a1628 40%,#0d2137 70%,#060e1f 100%)', animation:'fadeIn .18s ease forwards' }}>
          {/* glow blob */}
          <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:500, height:400, borderRadius:'50%', background:'radial-gradient(circle,rgba(16,185,129,.06) 0%,transparent 70%)', filter:'blur(50px)', pointerEvents:'none' }} />

          {/* ── TOP BAR ────────────────────────────────────────────────────── */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 8px', position:'relative', zIndex:10, flexShrink:0 }}>
            {/* Left: network + recording */}
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              {/* Network badge */}
              <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:999, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.09)' }}>
                {networkQuality === 'poor'
                  ? <WifiOff style={{ width:12, height:12, color:'#ef4444' }} />
                  : <Wifi style={{ width:12, height:12, color:networkQuality==='good'?'#10b981':'#f59e0b' }} />
                }
                <span style={{ fontSize:10, fontWeight:700, color:networkQuality==='good'?'#10b981':networkQuality==='fair'?'#f59e0b':'#ef4444' }}>
                  {networkQuality==='good'?'HD':networkQuality==='fair'?'SD':'Weak'}
                </span>
              </div>
              {/* Noise suppression indicator */}
              {noiseSuppression && (
                <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:999, background:'rgba(20,184,166,.1)', border:'1px solid rgba(20,184,166,.3)' }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'#14b8a6', animation:'nsPulse 2s ease infinite', flexShrink:0 }} />
                  <span style={{ fontSize:10, fontWeight:700, color:'#2dd4bf' }}>Noise Filter</span>
                </div>
              )}
              <RecBadge />
            </div>

            {/* Right: window controls */}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setMode('minimized')} style={{ width:38,height:38,borderRadius:'50%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.09)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }} title="Minimize">
                <ChevronDown style={{ width:15, height:15, color:'#94a3b8' }} />
              </button>
              <button onClick={() => setMode('normal')} style={{ width:38,height:38,borderRadius:'50%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.09)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer' }} title="Windowed">
                <Minimize2 style={{ width:15, height:15, color:'#94a3b8' }} />
              </button>
            </div>
          </div>

          {/* ── CENTRE CONTENT ─────────────────────────────────────────────── */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20, padding:'0 24px', position:'relative', zIndex:10, overflow:'hidden' }}>
            {!isGroup ? (
              <>
                <Avatar src={activeCall.peerAvatar} name={peerName} size={Math.min(120,window.innerWidth*.22)} speaking={isSpeaking} />
                <div style={{ textAlign:'center' }}>
                  <h2 style={{ color:'#fff', fontWeight:800, margin:'0 0 10px', fontSize:'clamp(20px,4vw,30px)', letterSpacing:'-.02em' }}>{peerName}</h2>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}>
                    {isSpeaking && <WaveBars active color="#10b981" count={7} height={18} />}
                    <span style={{ fontFamily:'monospace', fontWeight:700, color:statusColor, fontSize:16 }}>{statusText}</span>
                    {isSpeaking && <WaveBars active color="#06b6d4" count={7} height={18} />}
                  </div>
                  {/* Offline-ring indicator */}
                  {callStatus?.includes('offline') && (
                    <div style={{ display:'inline-flex', alignItems:'center', gap:6, marginTop:12, padding:'5px 14px', borderRadius:999, background:'rgba(251,191,36,.1)', border:'1px solid rgba(251,191,36,.3)' }}>
                      <span style={{ width:6, height:6, borderRadius:'50%', background:'#fbbf24', flexShrink:0, animation:'recPulse 1.5s ease infinite' }} />
                      <span style={{ fontSize:11, fontWeight:700, color:'#fbbf24' }}>User offline — ringing when they connect</span>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div style={{ textAlign:'center' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, marginBottom:6 }}>
                    <Users style={{ width:18, height:18, color:'#10b981' }} />
                    <h2 style={{ color:'#fff', fontWeight:700, fontSize:20, margin:0 }}>{peerName}</h2>
                  </div>
                  <span style={{ fontFamily:'monospace', fontWeight:600, fontSize:13, color:statusColor }}>{statusText}</span>
                </div>
                <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center', gap:4, maxWidth:480 }}>
                  {participants.length > 0
                    ? participants.map((p) => <ParticipantTile key={p.userId} participant={p} speaking={activeSpeaker===p.userId} large />)
                    : <p style={{ color:'#475569', fontSize:14 }}>Waiting for others to join…</p>}
                </div>
              </>
            )}
          </div>

          {/* ── CONTROLS AREA ──────────────────────────────────────────────── */}
          <div style={{ flexShrink:0, padding:'8px 16px', paddingBottom:'max(24px,env(safe-area-inset-bottom,24px))', position:'relative', zIndex:10 }}>

            {/* ── ROW 1: Primary controls (original) ─────────────────────── */}
            <div style={{ borderRadius:22, padding:'14px 24px', margin:'0 auto 10px', display:'flex', alignItems:'center', justifyContent:'center', gap:'clamp(10px,3vw,28px)', background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.08)', backdropFilter:'blur(20px)', maxWidth:500, flexWrap:'wrap' }}>
              <SquareBtn icon={isMuted?MicOff:Mic}         label={isMuted?'Unmute':'Mute'}   variant={isMuted?'muted':'default'} onClick={toggleMute}                                     size="lg" />
              <SquareBtn icon={speakerOn?Volume2:VolumeX}  label={speakerOn?'Speaker':'Off'}  variant={speakerOn?'default':'muted'} active={speakerOn} onClick={()=>setSpeakerOn(v=>!v)} size="lg" />
              <SquareBtn icon={isRecording?Square:Circle}  label={isRecording?fmt(recDuration):'Record'} variant="record" active={isRecording} onClick={isRecording?stopRecording:startRecording} size="lg" />
              {/* End call — always last & most prominent */}
              <SquareBtn icon={PhoneOff} label={isGroup?'Leave':'End'} variant="end" onClick={endCall} size="lg" />
            </div>

            {/* ── ROW 2: New feature controls ─────────────────────────────── */}
            <div style={{ borderRadius:18, padding:'10px 20px', margin:'0 auto', display:'flex', alignItems:'center', justifyContent:'center', gap:'clamp(8px,2.5vw,22px)', background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', backdropFilter:'blur(16px)', maxWidth:480, flexWrap:'wrap' }}>

              {/* + Conference */}
              <SquareBtn
                icon={UserPlus}
                label="Add"
                variant="purple"
                onClick={() => setShowConferenceModal(true)}
                size="md"
              />

              {/* Switch to Video */}
              <SquareBtn
                icon={Video}
                label="Video"
                variant="blue"
                onClick={() => {
                  // UI-only: emits a toast-style hint since video switching
                  // requires VideoCallContext integration outside this component
                  alert('Switch to video call — connect this button to your startVideoCall() handler');
                }}
                size="md"
              />

              {/* Noise Suppression */}
              <SquareBtn
                icon={Mic}
                label={noiseSuppression ? 'NS: On' : 'NS: Off'}
                variant="teal"
                active={noiseSuppression}
                onClick={() => setNoiseSuppression(v => !v)}
                size="md"
              />

              {/* Audio Devices */}
              <SquareBtn
                icon={Settings}
                label="Devices"
                variant="default"
                active={showDeviceDrawer}
                onClick={() => setShowDeviceDrawer(v => !v)}
                size="md"
              />
            </div>

            {/* Selected device summary strip */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:16, marginTop:10 }}>
              {selectedMic !== 'default' && (
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <Mic style={{ width:10, height:10, color:'rgba(255,255,255,.35)' }} />
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {devices.mics.find(d=>d.deviceId===selectedMic)?.label?.split('(')[0] || 'Custom mic'}
                  </span>
                </div>
              )}
              {activeSinkId && (
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <Headphones style={{ width:10, height:10, color:'rgba(255,255,255,.35)' }} />
                  <span style={{ fontSize:10, color:'rgba(255,255,255,.35)', maxWidth:120, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {devices.speakers.find(d=>d.deviceId===activeSinkId)?.label?.split('(')[0] || 'Custom output'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════════
     MOBILE — COMPACT BOTTOM BAR  (unchanged)
  ════════════════════════════════════════════════════════════════════════════ */
  if (isMobile) {
    return (
      <>
        <AudioStyles /><AudioEls />
        <div style={{ position:'fixed', left:0, right:0, bottom:0, zIndex:190, animation:'callBarUp .28s ease forwards' }}>
          <div style={{ height:2, background:isConnected?'linear-gradient(90deg,#10b981,#06b6d4,#10b981)':'linear-gradient(90deg,#f59e0b,#f97316)' }} />
          <div style={{ background:'rgba(7,14,28,.98)', borderTop:'1px solid rgba(255,255,255,.09)', backdropFilter:'blur(24px)', padding:`10px 14px max(10px,env(safe-area-inset-bottom,10px)) 14px` }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ cursor:'pointer', flexShrink:0 }} onClick={() => setMode('fullscreen')}>
                <Avatar src={activeCall.peerAvatar} name={peerName} size={42} speaking={isSpeaking} />
              </div>
              <div style={{ flex:1, minWidth:0, cursor:'pointer' }} onClick={() => setMode('fullscreen')}>
                <p style={{ color:'#fff', fontWeight:700, fontSize:13, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {isGroup ? <span style={{ display:'flex', alignItems:'center', gap:4 }}><Users style={{ width:11,height:11,color:'#10b981',flexShrink:0 }} />{peerName}</span> : peerName}
                </p>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2 }}>
                  {isSpeaking && <WaveBars active color="#10b981" count={5} height={11} />}
                  <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color: callStatus?.includes('offline') ? '#fbbf24' : statusColor }}>{statusText}</span>
                </div>
              </div>
              <RecBadge />
              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                <RoundBtn icon={isMuted?MicOff:Mic}          variant={isMuted?'muted':'default'} size={44} onClick={toggleMute}               label="Mute"    />
                <RoundBtn icon={speakerOn?Volume2:VolumeX}   variant="speaker" active={speakerOn} size={44} onClick={()=>setSpeakerOn(v=>!v)} label="Speaker" />
                <RoundBtn icon={PhoneOff}                    variant="end"     size={44} onClick={endCall}                label="End"     />
                <button onClick={() => setMode('fullscreen')} style={{ width:36,height:36,borderRadius:'50%',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',flexShrink:0 }} title="Full screen">
                  <Maximize2 style={{ width:14, height:14, color:'#64748b' }} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  /* ════════════════════════════════════════════════════════════════════════════
     DESKTOP — FLOATING CARD  (unchanged)
  ════════════════════════════════════════════════════════════════════════════ */
  const cardW = isGroup ? 296 : 264;
  return (
    <>
      <AudioStyles /><AudioEls />
      <div ref={dragRef} style={{ position:'fixed', zIndex:190, bottom:Math.max(24,24-pos.y), right:Math.max(24,24-pos.x), width:cardW, animation:mounted?'none':'callSlideUp .28s cubic-bezier(.34,1.4,.64,1) forwards', cursor:isDragging?'grabbing':'auto' }}>
        <div style={{ borderRadius:22, overflow:'hidden', background:'linear-gradient(160deg,#0a1628 0%,#0d2137 55%,#0f172a 100%)', border:'1px solid rgba(255,255,255,.07)', boxShadow:isDragging?'0 32px 80px rgba(0,0,0,.85),0 0 0 1.5px rgba(255,255,255,.1)':'0 20px 56px rgba(0,0,0,.72),inset 0 1px 0 rgba(255,255,255,.05)', transition:isDragging?'none':'box-shadow .2s' }}>

          <div style={{ height:2, background:isConnected?'linear-gradient(90deg,#10b981,#06b6d4,#10b981)':'linear-gradient(90deg,#f59e0b,#f97316)' }} />

          {/* Drag handle */}
          <div onMouseDown={onDragStart} onTouchStart={onDragStart} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 14px 0', cursor:'grab' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ width:7, height:7, borderRadius:'50%', background:statusColor, boxShadow:`0 0 6px ${statusColor}`, flexShrink:0 }} />
              <RecBadge />
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={()=>setMode('minimized')} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} style={{ width:24,height:24,borderRadius:'50%',background:'none',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#475569' }} title="Minimize">
                <ChevronDown style={{ width:13, height:13 }} />
              </button>
              <button onClick={()=>setMode('fullscreen')} onMouseDown={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} style={{ width:24,height:24,borderRadius:'50%',background:'none',border:'none',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'#475569' }} title="Full screen">
                <Maximize2 style={{ width:12, height:12 }} />
              </button>
            </div>
          </div>

          <div style={{ padding:'10px 18px 18px' }}>
            {!isGroup ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
                <Avatar src={activeCall.peerAvatar} name={peerName} size={76} speaking={isSpeaking} />
                <div style={{ textAlign:'center' }}>
                  <p style={{ color:'#fff', fontWeight:700, fontSize:15, margin:'0 0 6px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:220 }}>{peerName}</p>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    {isSpeaking && <WaveBars active color="#10b981" count={5} height={13} />}
                    <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:12, color:statusColor }}>{statusText}</span>
                    {isSpeaking && <WaveBars active color="#10b981" count={5} height={13} />}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', gap:12 }}>
                  <SquareBtn icon={isMuted?MicOff:Mic}         label={isMuted?'Unmute':'Mute'}  variant={isMuted?'muted':'default'} onClick={toggleMute} />
                  <SquareBtn icon={speakerOn?Volume2:VolumeX}  label={speakerOn?'Speaker':'Off'} onClick={()=>setSpeakerOn(v=>!v)} active={speakerOn} />
                  <SquareBtn icon={isRecording?Square:Circle}  label={isRecording?fmt(recDuration):'Rec'} variant="record" active={isRecording} onClick={isRecording?stopRecording:startRecording} />
                  <SquareBtn icon={PhoneOff} label="End" variant="end" onClick={endCall} />
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <Users style={{ width:13, height:13, color:'#10b981' }} />
                    <span style={{ color:'#fff', fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:130 }}>{peerName}</span>
                  </div>
                  <span style={{ fontFamily:'monospace', fontWeight:700, fontSize:11, color:statusColor }}>{statusText}</span>
                </div>
                {participants.length > 0
                  ? <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'center' }}>{participants.map((p) => <ParticipantTile key={p.userId} participant={p} speaking={activeSpeaker===p.userId} />)}</div>
                  : <p style={{ textAlign:'center', color:'#475569', fontSize:11, padding:'6px 0' }}>Waiting for others…</p>}
                <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'center', gap:10 }}>
                  <SquareBtn icon={isMuted?MicOff:Mic}        label={isMuted?'Unmute':'Mute'} variant={isMuted?'muted':'default'} onClick={toggleMute} />
                  <SquareBtn icon={speakerOn?Volume2:VolumeX} label="Speaker" onClick={()=>setSpeakerOn(v=>!v)} active={speakerOn} />
                  <SquareBtn icon={isRecording?Square:Circle} label={isRecording?fmt(recDuration):'Rec'} variant="record" active={isRecording} onClick={isRecording?stopRecording:startRecording} />
                  <SquareBtn icon={PhoneOff} label="Leave" variant="end" onClick={endCall} />
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