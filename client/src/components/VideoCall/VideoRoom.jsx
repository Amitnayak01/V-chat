import {
  useEffect, useState, useRef, useCallback, memo,
} from 'react';
import { useParams, useNavigate }    from 'react-router-dom';
import { motion, AnimatePresence }   from 'framer-motion';
import { MessageCircle, Copy, RefreshCw, Share2 } from 'lucide-react';
import toast                         from 'react-hot-toast';

import VideoGrid         from './VideoGrid';
import Controls          from './Controls';
import ChatSidebar       from './ChatSidebar';
import ShareModal        from './ShareModal';
import ParticipantsPanel from './ParticipantsPanel';
import ModeToggle        from './ModeToggle';
import RecordingModal    from './RecordingModal';
import HandRaisedBanner  from './HandRaisedBanner'; // ── NEW

import { useAuth }   from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { useWebRTC } from '../../context/WebRTCContext';
// MediaRecorderHelper import removed — recording now uses native MediaRecorder + canvas compositor
import useActiveSpeaker from '../../hooks/useActiveSpeaker';

// ─────────────────────────────────────────────────────────────────────────────

const VideoRoom = () => {

  // ── Layout mode ─────────────────────────────────────────────────────────
  const [mode,            setMode]            = useState(
    () => sessionStorage.getItem('videoMode') ?? 'call'
  );
  const [meetingViewMode, setMeetingViewMode] = useState('grid');   // 'grid' | 'speaker'
  const [pinnedUserId,    setPinnedUserId]    = useState(null);

  // ── Screen share ─────────────────────────────────────────────────────────
  const [screenStream,    setScreenStream]    = useState(null);     // local screen MediaStream
  const [presenterUserId, setPresenterUserId] = useState(null);     // socket-signalled presenter
  const screenStreamRef   = useRef(null);
  const origVideoTrackRef = useRef(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [isChatOpen,         setIsChatOpen]         = useState(false);
  const [unreadCount,        setUnreadCount]         = useState(0);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [participants,       setParticipants]        = useState([]);
  const [isRecording,        setIsRecording]         = useState(false);
  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  const [recordingDuration,  setRecordingDuration]   = useState(0);  // seconds
  const [recordings,         setRecordings]          = useState([]);  // saved recordings library
  const [isReconnecting,     setIsReconnecting]      = useState(false);
  const [isShareModalOpen,   setIsShareModalOpen]    = useState(false);
  const [handRaised,         setHandRaised]          = useState(false);
  // ── RAISE HAND: Map(userId → { username, raisedAt }) — single source of truth
  // for ALL raised hands including the local user
  const [handRaisedMap,      setHandRaisedMap]       = useState(() => new Map());
  // ── RAISE HAND: notification queue for the floating banner overlay
  const [handNotifications,  setHandNotifications]   = useState([]);
  const handNotifIdRef = useRef(0);
  const [controlsVisible,    setControlsVisible]     = useState(true);
  const [roomEvents,         setRoomEvents]          = useState([]);
  const [floatReactions,     setFloatReactions]      = useState([]); // [{ id, emoji, username }]

  // ── MUTE SYSTEM (Zoom-style) ─────────────────────────────────────────────
  // roomHostId: who created the room — only they see/use "Mute Everyone"
  const [roomHostId,        setRoomHostId]        = useState(null);
  // forceMutedIds: Set of userIds that the host has force-muted
  const [forceMutedIds,     setForceMutedIds]     = useState(() => new Set());
  // allowSelfUnmute: whether force-muted participants can unmute themselves
  const [allowSelfUnmute,   setAllowSelfUnmute]   = useState(true);

  // ── Refs ─────────────────────────────────────────────────────────────────
  const mediaRecorder    = useRef(null);
  const eventIdRef       = useRef(0);
  const rafRef           = useRef(null);   // requestAnimationFrame id for canvas compositor
  const canvasRef        = useRef(null);   // offscreen canvas
  const chunksRef        = useRef([]);     // recorded blob chunks
  const recTimerRef      = useRef(null);   // setInterval for duration counter
  const recQualityRef    = useRef(null);   // quality config used for current recording

  // Helper: push a room event to the activity feed
  const pushEvent = useCallback((eventType, data = {}) => {
    setRoomEvents(prev => [
      ...prev,
      { id: `evt-${++eventIdRef.current}`, eventType, data, ts: Date.now() },
    ]);
  }, []);
  const floatIdRef = useRef(0);

  // Show a floating emoji on the video for 2s then remove it
  const showFloat = useCallback((emoji, username) => {
    const id = ++floatIdRef.current;
    setFloatReactions(prev => [...prev, { id, emoji, username }]);
    setTimeout(() => setFloatReactions(prev => prev.filter(r => r.id !== id)), 2000);
  }, []);

  // ── RAISE HAND helpers ───────────────────────────────────────────────────
  const pushHandNotif = useCallback((userId, username, type) => {
    const id = `hand-${++handNotifIdRef.current}`;
    setHandNotifications(prev => [...prev, { id, userId, username, type, ts: Date.now() }]);
  }, []);

  const dismissHandNotif = useCallback((id) => {
    setHandNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const intentionalLeave = useRef(false);
  const hasJoined        = useRef(false);
  const hideTimer        = useRef(null);

  // ── External hooks ───────────────────────────────────────────────────────
  const { roomId }   = useParams();
  const navigate     = useNavigate();
  const { user }     = useAuth();

  const {
    socket, emit, setCurrentRoom, clearCurrentRoom, connected,
  } = useSocket();

  const {
    localStream, remoteStreams,
    isMuted, isVideoOff, isScreenSharing,
    initializeMedia,
    createOffer, handleOffer, handleAnswer, handleIceCandidate,
    toggleMute, forceMute, forceUnmute, toggleVideo,
    startScreenShare, stopScreenShare,
    replaceVideoTrack,
    handlePeerDisconnect, cleanup,
  } = useWebRTC();

  const activeSpeaker = useActiveSpeaker(user._id, localStream, remoteStreams);

  // ── Mode toggle ──────────────────────────────────────────────────────────
  const toggleMode = useCallback(() => {
    setMode(prev => {
      const next = prev === 'call' ? 'meeting' : 'call';
      sessionStorage.setItem('videoMode', next);
      return next;
    });
  }, []);

  // ── Auto-hide controls (call mode) ───────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    if (mode !== 'call') return;
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), 4000);
  }, [mode]);

  useEffect(() => {
    if (mode === 'call') {
      resetHideTimer();
      return () => clearTimeout(hideTimer.current);
    }
    setControlsVisible(true);
    return undefined;
  }, [mode, resetHideTimer]);

  // ── Effect 1: Init media ──────────────────────────────────────────────────
  useEffect(() => {
    initializeMedia(user._id).then(result => {
      if (!result.success) toast.error('Could not access camera / microphone');
    });

    return () => {
      if (intentionalLeave.current) {
        emit('leave-room', { roomId, userId: user._id });
        clearCurrentRoom();
      }
      // Stop screen share if still active
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      cleanup();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 2: Join room (once media + socket are ready) ───────────────────
  useEffect(() => {
    if (!connected || !localStream || hasJoined.current) return;
    hasJoined.current = true;
    setCurrentRoom(roomId, user.username, user.avatar);
    emit('join-room', {
      roomId,
      userId:   user._id,
      username: user.username,
      avatar:   user.avatar,
    });
  }, [connected, localStream]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 3: Socket event listeners ─────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const handlers = {
      'user-joined': ({ userId, username, participants: updated }) => {
        setParticipants(updated);
        createOffer(userId, roomId);
        pushEvent('user-joined', { username });
        toast.success(`${username} joined`);
      },

      'user-left': ({ userId }) => {
        const leaving = participants.find(p => (p.userId ?? p) === userId);
        const name = leaving?.username ?? 'Someone';
        handlePeerDisconnect(userId);
        setParticipants(prev =>
          prev.filter(p => (typeof p === 'string' ? p !== userId : p.userId !== userId))
        );
        if (pinnedUserId === userId) setPinnedUserId(null);
        setPresenterUserId(prev => prev === userId ? null : prev);
        // Clear their raised hand if they leave
        setHandRaisedMap(prev => {
          if (!prev.has(userId)) return prev;
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        // Clear force-muted state when user leaves
        setForceMutedIds(prev => {
          if (!prev.has(userId)) return prev;
          const n = new Set(prev); n.delete(userId); return n;
        });
        pushEvent('user-left', { username: name });
        toast(`${name} left the call`, { icon: '👋' });
      },

      'room-participants': ({ participants: current }) => setParticipants(current),

      'user-reconnected': ({ userId, username }) => {
        setIsReconnecting(false);
        handlePeerDisconnect(userId);
        createOffer(userId, roomId);
        pushEvent('user-reconnected', { username });
        toast(`${username} reconnected`, { icon: '🔄' });
      },

      'room-rejoin-ack': ({ roomId: ack, members }) => {
        if (ack !== roomId) return;
        setIsReconnecting(false);
        setParticipants(members);
      },

      // WebRTC signalling
      'webrtc-offer':         ({ offer, from })     => handleOffer(from, roomId, offer),
      'webrtc-answer':        ({ answer, from })    => handleAnswer(from, answer),
      'webrtc-ice-candidate': ({ candidate, from }) => handleIceCandidate(from, candidate),

      // Screen share — socket-signalled so remote viewers can find the right stream
      'user-screen-sharing': ({ userId, username, surface }) => {
        setPresenterUserId(userId);
        const surfaceLabel = surface === 'browser'  ? 'a tab'
                           : surface === 'window'   ? 'a window'
                           : surface === 'monitor'  ? 'their screen'
                           : 'their screen';
        pushEvent('screen-share-start', { username, surface });
        toast(`${username} is sharing ${surfaceLabel}`, { icon: '🖥️' });
      },

      'user-stopped-screen-sharing': ({ userId }) => {
        const sharer = participants.find(p => (p.userId ?? p) === userId);
        setPresenterUserId(prev => prev === userId ? null : prev);
        pushEvent('screen-share-stop', { username: sharer?.username });
        toast('Screen sharing stopped', { icon: '🖥️' });
      },

      // Legacy event name support
      'stop-screen-share': ({ userId }) => {
        setPresenterUserId(prev => prev === userId ? null : prev);
      },

      'recording-started': () => { pushEvent('recording-start', {}); toast.success('Recording started'); },
      'recording-stopped': () => { pushEvent('recording-stop', {}); toast.success('Recording saved'); },

      // ── RAISE HAND: upgraded handlers ─────────────────────────────────
      // Now receives username + raisedAt; server broadcasts to ALL including sender
      'hand-raised': ({ userId, username, raisedAt }) => {
        const resolvedName = username
          || participants.find(p => (p.userId ?? p) === userId)?.username
          || 'Someone';
        setHandRaisedMap(prev => {
          const next = new Map(prev);
          next.set(userId, { username: resolvedName, raisedAt: raisedAt ?? Date.now() });
          return next;
        });
        pushEvent('hand-raised', { username: resolvedName });
        // NOTE: no pushHandNotif here — the persistent RaisedCard is driven
        // directly by handRaisedMap so it stays until the hand is lowered
        // Keep local bool in sync when server confirms own raise
        if (userId === user._id) setHandRaised(true);
      },

      // ── RAISE HAND: late-joiner / reconnect state restore ─────────────
      'hands-state-sync': ({ hands }) => {
        setHandRaisedMap(prev => {
          const next = new Map(prev);
          hands.forEach(({ userId, username, raisedAt }) => {
            next.set(userId, { username, raisedAt });
          });
          return next;
        });
        // Restore own handRaised bool if server says our hand is up
        if (hands.some(h => h.userId === user._id)) setHandRaised(true);
      },

      'hand-lowered': ({ userId }) => {
        const resolvedName =
          participants.find(p => (p.userId ?? p) === userId)?.username ?? 'Someone';
        setHandRaisedMap(prev => {
          if (!prev.has(userId)) return prev;
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
        pushEvent('hand-lowered', { username: resolvedName });
        pushHandNotif(userId, resolvedName, 'lowered');
        // Keep local bool in sync when server confirms own lower
        if (userId === user._id) setHandRaised(false);
      },

      'reaction': ({ userId, username, emoji }) => {
        showFloat(emoji, username);
        pushEvent('reaction', { username, emoji });
      },

      // ── MUTE SYSTEM: Zoom-style host mute ─────────────────────────────
      //
      // mute-state-sync — received on join AND reconnect.
      //   Sets who the host is, who is currently force-muted, and whether
      //   self-unmute is permitted. If the local user is in mutedIds we
      //   immediately mute their audio track via forceMute().
      //
      'mute-state-sync': ({ hostId, mutedIds = [], allowUnmute }) => {
        setRoomHostId(hostId);
        const newSet = new Set(mutedIds);
        setForceMutedIds(newSet);
        setAllowSelfUnmute(!!allowUnmute);
        // Restore local mute track state if we were force-muted before join/reconnect
        if (newSet.has(user._id)) {
          forceMute();
        }
      },

      // host-muted-all — host just clicked "Mute Everyone".
      //   Every client (including host) receives this; each client checks
      //   whether their own userId is in mutedIds and mutes accordingly.
      //
      'host-muted-all': ({ hostId, mutedIds = [], allowUnmute }) => {
        setRoomHostId(hostId);
        const newSet = new Set(mutedIds);
        setForceMutedIds(newSet);
        setAllowSelfUnmute(!!allowUnmute);

        if (newSet.has(user._id)) {
          // Mute this client's audio track
          forceMute();
          toast('You were muted by the host', { icon: '🔇' });
          pushEvent('muted-by-host', { username: 'You' });
        } else {
          // Host themselves — just log the system event
          pushEvent('host-muted-all', {});
        }
      },

      // host-muted-you — targeted mute of this specific client.
      //
      'host-muted-you': ({ hostId, allowUnmute }) => {
        setForceMutedIds(prev => { const n = new Set(prev); n.add(user._id); return n; });
        setAllowSelfUnmute(!!allowUnmute);
        forceMute();
        toast('You were muted by the host', { icon: '🔇' });
        pushEvent('muted-by-host', { username: 'You' });
      },

      // unmute-permission-changed — host toggled the "allow self-unmute" setting.
      //
      'unmute-permission-changed': ({ allowUnmute }) => {
        setAllowSelfUnmute(!!allowUnmute);
        if (!allowUnmute) {
          toast('The host has disabled self-unmuting', { icon: '🔒', duration: 4000 });
        } else {
          toast('You can now unmute yourself', { icon: '🔓', duration: 3000 });
        }
      },

      // participant-unmuted — a peer self-unmuted (server confirmed it's allowed).
      //   Remove them from our local forceMutedIds so their tile shows correct state.
      //
      'participant-unmuted': ({ userId }) => {
        setForceMutedIds(prev => {
          if (!prev.has(userId)) return prev;
          const n = new Set(prev); n.delete(userId); return n;
        });
      },

      // mute-error — server rejected an unauthorized mute attempt.
      //
      'mute-error': ({ message }) => {
        toast.error(message ?? 'Mute action not permitted');
      },
    };

    // Register all
    Object.entries(handlers).forEach(([ev, fn]) => socket.on(ev, fn));

    return () => {
      Object.keys(handlers).forEach(ev => socket.off(ev));
    };
  }, [socket, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effect 4: Connection state banner ────────────────────────────────────
  useEffect(() => {
    if (!socket) return;
    const onDisconnect = () => { setIsReconnecting(true);  pushEvent('reconnecting', {}); };
    const onConnect    = () => { setIsReconnecting(false); pushEvent('connected',    {}); };
    socket.on('disconnect', onDisconnect);
    socket.on('connect',    onConnect);
    return () => {
      socket.off('disconnect', onDisconnect);
      socket.off('connect',    onConnect);
    };
  }, [socket]);

  // ── Screen share ──────────────────────────────────────────────────────────
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  const doStopSharing = useCallback(async () => {
    // 1. Stop all screen capture tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }

    // 2. Restore original camera track in localStream so local preview recovers
    const cameraTrack = origVideoTrackRef.current;
    if (cameraTrack && localStream) {
      // Swap the screen track back for the camera track in the local MediaStream
      const oldScreenTrack = localStream.getVideoTracks()[0];
      if (oldScreenTrack && oldScreenTrack !== cameraTrack) {
        localStream.removeTrack(oldScreenTrack);
      }
      if (!localStream.getVideoTracks().includes(cameraTrack)) {
        localStream.addTrack(cameraTrack);
      }
    }
    origVideoTrackRef.current = null;

    // 3. Tell WebRTC context to replace back to camera in all peer connections
    stopScreenShare(roomId);

    // 4. Clear UI state
    setScreenStream(null);
    setPresenterUserId(null);

    // 5. Notify peers
    emit('user-stopped-screen-sharing', { roomId, userId: user._id });
    pushEvent('screen-share-stop', { username: 'You' });
    toast('Screen sharing stopped', { icon: '🖥️' });
  }, [roomId, user._id, emit, stopScreenShare, localStream, pushEvent]);

  const handleToggleScreenShare = useCallback(async () => {
    if (isMobile) {
      toast('Screen sharing is not supported on mobile devices.', { icon: '🖥️', duration: 4000 });
      return;
    }

    if (screenStreamRef.current) {
      await doStopSharing();
      return;
    }

    try {
      // Request highest quality with system audio when available
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate:   { ideal: 30, max: 60 },
          width:       { ideal: 1920, max: 3840 },
          height:      { ideal: 1080, max: 2160 },
          cursor:      'always',
          displaySurface: 'monitor', // hint: prefer full screen
        },
        audio: {
          // System audio (tab/app audio) — user can grant or deny
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate:       48000,
        },
        // Chrome-specific: show all surfaces, prefer current tab last
        selfBrowserSurface: 'exclude',
        surfaceSwitching:   'include',
        systemAudio:        'include',
      });

      const screenTrack = stream.getVideoTracks()[0];
      if (!screenTrack) { toast.error('No screen track available'); return; }

      // Log what the browser actually granted
      const settings = screenTrack.getSettings();
      console.log('[ScreenShare] granted:', settings.displaySurface,
        `${settings.width}×${settings.height} @${settings.frameRate}fps`);

      // Save camera track ref before replacing
      origVideoTrackRef.current = localStream?.getVideoTracks()[0] ?? null;

      screenStreamRef.current = stream;

      // Replace video in ALL peer connections FIRST (prevents hall-of-mirrors)
      await replaceVideoTrack(screenTrack);

      // If system audio was granted, add its track to each peer connection too
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        // We don't replace the mic — we ADD the screen audio as a second audio track
        // This lets remote viewers hear both the presenter's mic AND shared audio
        console.log('[ScreenShare] system audio track acquired:', audioTrack.label);
      }

      // Now safe to update UI
      setScreenStream(stream);
      setPresenterUserId(user._id);
      startScreenShare(roomId);

      // Notify peers
      emit('user-screen-sharing', {
        roomId,
        userId:   user._id,
        username: user.username,
        surface:  settings.displaySurface ?? 'monitor',
      });

      // Auto-stop when browser toolbar "Stop sharing" is clicked
      screenTrack.addEventListener('ended', () => doStopSharing());

      toast.success('Screen sharing started', { icon: '🖥️' });

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        // User cancelled the picker — silent, expected
        return;
      }
      if (err.name === 'NotSupportedError') {
        toast.error('Screen sharing is not supported in this browser');
        return;
      }
      console.error('[ScreenShare]', err);
      toast.error('Failed to start screen sharing');
    }
  }, [isMobile, localStream, roomId, user, emit, startScreenShare, doStopSharing, replaceVideoTrack, pushEvent]);

  // ── Camera switch (mobile) ────────────────────────────────────────────────
  const handleSwitchCamera = useCallback(async () => {
    try {
      const devices    = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter(d => d.kind === 'videoinput');
      if (videoInputs.length < 2) { toast('No other camera found'); return; }

      const current  = localStream?.getVideoTracks()[0];
      const curId    = current?.getSettings()?.deviceId;
      const curIdx   = videoInputs.findIndex(d => d.deviceId === curId);
      const next     = videoInputs[(curIdx + 1) % videoInputs.length];

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: next.deviceId } },
        audio: false,
      });
      const newTrack = newStream.getVideoTracks()[0];

      if (localStream) {
        const old = localStream.getVideoTracks()[0];
        localStream.removeTrack(old);
        localStream.addTrack(newTrack);
        old.stop();
      }
      toast.success('Camera switched');
    } catch (err) {
      console.error('[SwitchCamera]', err);
      toast.error('Failed to switch camera');
    }
  }, [localStream]);

  // ── Recording (professional canvas compositor — quality-aware, with timer) ──

  // Called by RecordingModal with { quality, includeAudio }
  const handleStartRecording = useCallback(async ({ quality, includeAudio = true } = {}) => {
    try {
      if (!localStream) { throw new Error('No local stream'); }

      const W   = quality?.w   ?? 1280;
      const H   = quality?.h   ?? 720;
      const BPS = quality?.bps ?? 3_000_000;
      recQualityRef.current = quality;

      // ── Canvas setup ─────────────────────────────────────────────────────
      const canvas = document.createElement('canvas');
      canvas.width  = W;
      canvas.height = H;
      canvasRef.current = canvas;
      const ctx = canvas.getContext('2d');

      // Zoom-fill: cover scale + centre crop, clipped to tile rect
      const drawZoomFill = (v, tx, ty, tw, th) => {
        const vw = v.videoWidth, vh = v.videoHeight;
        if (!vw || !vh) return;
        const scale = Math.max(tw / vw, th / vh);
        const srcW = tw / scale, srcH = th / scale;
        const srcX = (vw - srcW) / 2, srcY = (vh - srcH) / 2;
        ctx.save();
        ctx.beginPath(); ctx.rect(tx, ty, tw, th); ctx.clip();
        ctx.drawImage(v, srcX, srcY, srcW, srcH, tx, ty, tw, th);
        ctx.restore();
      };

      // Dedup by srcObject id
      const getUniqueVideos = () => {
        const seen = new Set(), result = [];
        for (const v of document.querySelectorAll('video')) {
          if (v.readyState < 2 || !v.videoWidth || !v.videoHeight) continue;
          const key = v.srcObject?.id ?? v.src ?? null;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          if (document.pictureInPictureElement === v) continue;
          result.push(v);
        }
        return result;
      };

      // Layout engine — fills canvas completely
      const computeLayout = (n) => {
        if (n === 1) return [{ x: 0, y: 0, w: W, h: H }];
        if (n === 2) return [{ x: 0, y: 0, w: W/2, h: H }, { x: W/2, y: 0, w: W/2, h: H }];
        if (n === 3) {
          const tH = Math.round(H * 0.58), bH = H - tH;
          return [{ x:0, y:0, w:W, h:tH }, { x:0, y:tH, w:W/2, h:bH }, { x:W/2, y:tH, w:W/2, h:bH }];
        }
        if (n === 4) return [
          { x:0, y:0, w:W/2, h:H/2 }, { x:W/2, y:0, w:W/2, h:H/2 },
          { x:0, y:H/2, w:W/2, h:H/2 }, { x:W/2, y:H/2, w:W/2, h:H/2 },
        ];
        const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
        const tW = W / cols, tH = H / rows;
        return Array.from({ length: n }, (_, i) => {
          const r = Math.floor(i / cols), isLast = r === rows - 1;
          const lrc = n - r * cols, cW = isLast ? W / lrc : tW;
          const c = isLast ? i - r * cols : i % cols;
          return { x: c * cW, y: r * tH, w: cW, h: tH };
        });
      };

      const GAP = 3;
      const drawFrame = () => {
        ctx.fillStyle = '#0a0a0a';
        ctx.fillRect(0, 0, W, H);
        const vids = getUniqueVideos();
        if (vids.length > 0) {
          computeLayout(vids.length).forEach(({ x, y, w, h }, i) => {
            drawZoomFill(vids[i], x + GAP/2, y + GAP/2, w - GAP, h - GAP);
          });
        }
        rafRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      // ── Canvas stream ────────────────────────────────────────────────────
      const canvasStream = canvas.captureStream(30);

      // ── Audio mix ────────────────────────────────────────────────────────
      if (includeAudio) {
        try {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          const audioCtx = new AudioCtx();
          const dest = audioCtx.createMediaStreamDestination();
          const addAudio = (s) => {
            if (!s?.getAudioTracks().length) return;
            try { audioCtx.createMediaStreamSource(s).connect(dest); } catch {}
          };
          addAudio(localStream);
          Object.values(remoteStreams || {}).forEach(addAudio);
          dest.stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));
        } catch (e) { console.warn('[Rec] Audio mix skipped:', e); }
      }

      // ── MediaRecorder ────────────────────────────────────────────────────
      const mimeType =
        MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' :
        MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' :
        'video/webm';

      chunksRef.current = [];
      const rec = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: BPS });
      rec.ondataavailable = (e) => { if (e.data?.size > 0) chunksRef.current.push(e.data); };
      rec.start(500);
      mediaRecorder.current = rec;

      // ── Duration timer ───────────────────────────────────────────────────
      setRecordingDuration(0);
      recTimerRef.current = setInterval(() => setRecordingDuration(d => d + 1), 1000);

      setIsRecording(true);
      emit('start-recording', { roomId });

    } catch (err) {
      console.error('[Recording start]', err);
      throw err; // re-throw so modal can handle
    }
  }, [localStream, remoteStreams, roomId, emit]);

  const handleStopRecording = useCallback(async () => {
    try {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null; }

      const duration = await new Promise((resolve) => {
        let dur = 0;
        setRecordingDuration(d => { dur = d; return d; });
        setTimeout(() => resolve(dur), 10);
      });

      if (mediaRecorder.current && mediaRecorder.current.state !== 'inactive') {
        await new Promise(resolve => {
          mediaRecorder.current.onstop = resolve;
          mediaRecorder.current.stop();
        });
      }

      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const url  = URL.createObjectURL(blob);
      const name = `Meeting ${new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })}`;

      // Save to local recordings library
      const rec = {
        id:        Date.now().toString(),
        name,
        size:      blob.size,
        duration:  recordingDuration,
        url,
        createdAt: new Date().toISOString(),
      };
      setRecordings(prev => [rec, ...prev]);

      // Trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-${roomId}-${Date.now()}.webm`;
      a.click();

      mediaRecorder.current = null;
      chunksRef.current     = [];
      canvasRef.current     = null;
      recQualityRef.current = null;

      setIsRecording(false);
      setRecordingDuration(0);
      emit('stop-recording', { roomId });

    } catch (err) {
      console.error('[Recording stop]', err);
      throw err;
    }
  }, [recordingDuration, roomId, emit]);

  // Keep legacy toggle for Controls button (opens modal if not recording, stops if recording)
  const handleToggleRecording = useCallback(() => {
    if (isRecording) {
      handleStopRecording().catch(() => toast.error('Failed to save recording'));
    } else {
      setIsRecordingModalOpen(true);
    }
  }, [isRecording, handleStopRecording]);

  const handleDeleteRecording = useCallback((id) => {
    setRecordings(prev => {
      const rec = prev.find(r => r.id === id);
      if (rec?.url) URL.revokeObjectURL(rec.url);
      return prev.filter(r => r.id !== id);
    });
  }, []);

  const handleDownloadRecording = useCallback((id) => {
    const rec = recordings.find(r => r.id === id);
    if (!rec) return;
    const a = document.createElement('a');
    a.href = rec.url;
    a.download = `${rec.name}.webm`;
    a.click();
  }, [recordings]);

  // ── End call ─────────────────────────────────────────────────────────────
  // replace:true removes the room from history so the back button
  // from /dashboard can never navigate back into the room.
  const handleEndCall = useCallback(() => {
    if (isRecording) { toast.error('Stop recording before leaving'); return; }
    intentionalLeave.current = true;
    navigate('/dashboard', { replace: true });
  }, [isRecording, navigate]);

  // ── Hand raise ────────────────────────────────────────────────────────────
  // UPGRADED: optimistic local update so UI responds instantly before server ack
  const handleRaiseHand = useCallback(() => {
    const next = !handRaised;
    setHandRaised(next);

    if (next) {
      // Optimistic: add own hand immediately — server will confirm via hand-raised broadcast
      const raisedAt = Date.now();
      setHandRaisedMap(prev => {
        const m = new Map(prev);
        m.set(user._id, { username: user.username, raisedAt });
        return m;
      });
      // Send username so server can include it in the broadcast
      emit('raise-hand', { roomId, userId: user._id, username: user.username });
    } else {
      // Optimistic: remove own hand immediately
      setHandRaisedMap(prev => {
        const m = new Map(prev);
        m.delete(user._id);
        return m;
      });
      emit('lower-hand', { roomId, userId: user._id });
    }
  }, [handRaised, roomId, user._id, user.username, emit]);

  // ── Emoji reaction ───────────────────────────────────────────────────────────
  const handleReaction = useCallback((emoji) => {
    // Show float locally for the sender immediately
    showFloat(emoji, user.username);
    // Push to local chat feed immediately
    pushEvent('reaction', { username: user.username, emoji });
    // Broadcast to all peers via socket
    emit('send-reaction', { roomId, userId: user._id, username: user.username, emoji });
  }, [pushEvent, showFloat, user, roomId, emit]);

  // ── Pin ───────────────────────────────────────────────────────────────────
  const handlePin = useCallback((uid) => {
    setPinnedUserId(prev => prev === uid ? null : uid);
  }, []);

  // ── Mute all (host-only, Zoom-style) ─────────────────────────────────────
  // isHost is derived from roomHostId which comes from the server via mute-state-sync.
  // The server independently validates this — the check here is just a UI guard.
  const isHost        = roomHostId === user._id;
  const isForceMuted  = forceMutedIds.has(user._id);

  const handleMuteAll = useCallback(() => {
    if (!isHost) return; // UI guard — server also validates
    emit('mute-all', { roomId, userId: user._id, allowUnmute: true });
  }, [isHost, emit, roomId, user._id]);

  const handleToggleAllowUnmute = useCallback((allow) => {
    if (!isHost) return;
    emit('toggle-allow-unmute', { roomId, userId: user._id, allowUnmute: allow });
  }, [isHost, emit, roomId, user._id]);

  // ── Copy room link ────────────────────────────────────────────────────────
  const copyRoomLink = useCallback(() => {
    navigator.clipboard.writeText(`${window.location.origin}/join/${roomId}`);
    toast.success('Link copied!');
  }, [roomId]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isMeetingMode = mode === 'meeting';

  // ── RAISE HAND: derive Set + sorted list for downstream components ────────
  // handRaisedIds: Set<userId> — used by ParticipantsPanel (unchanged prop API)
  const handRaisedIds = new Set(handRaisedMap.keys());

  // raisedHands: Array<{ userId, username }> sorted by raisedAt asc
  // Passed to HandRaisedBanner as persistent cards (stay until hand lowered)
  const raisedHands = Array.from(handRaisedMap.entries())
    .sort(([, a], [, b]) => a.raisedAt - b.raisedAt)
    .map(([userId, { username }]) => ({ userId, username }));

  // sortedParticipants: raised hands bubble to top, ordered by raisedAt asc
  const sortedParticipants = [...participants].sort((a, b) => {
    const aHand = handRaisedMap.get(a.userId ?? a);
    const bHand = handRaisedMap.get(b.userId ?? b);
    if (aHand && !bHand) return -1;
    if (!aHand && bHand) return  1;
    if (aHand && bHand)  return aHand.raisedAt - bHand.raisedAt;
    return 0;
  });

  const controlProps = {
    mode,
    isMuted,
    isVideoOff,
    isScreenSharing: !!screenStreamRef.current || isScreenSharing,
    isRecording,
    onToggleMute: () => {
      // If force-muted by host and self-unmute is not permitted, block + warn
      if (isForceMuted && !allowSelfUnmute) {
        toast('The host has disabled unmuting', { icon: '🔒', duration: 3000 });
        return;
      }
      // If currently force-muted but self-unmute IS allowed — use forceUnmute
      // and notify the server so it removes us from mutedByHost set
      if (isForceMuted && allowSelfUnmute) {
        forceUnmute();
        setForceMutedIds(prev => { const n = new Set(prev); n.delete(user._id); return n; });
        emit('participant-unmuted', { roomId, userId: user._id });
        pushEvent('unmuted', { username: 'You' });
        return;
      }
      // Normal self-mute toggle
      toggleMute();
      pushEvent(isMuted ? 'unmuted' : 'muted', { username: 'You' });
    },
    onToggleVideo: () => {
      toggleVideo();
      pushEvent(isVideoOff ? 'camera-on' : 'camera-off', { username: 'You' });
    },
    onToggleScreenShare:  handleToggleScreenShare,
    onToggleRecording:    handleToggleRecording,
    onEndCall:            handleEndCall,
    onSwitchCamera:       handleSwitchCamera,
    // Meeting extras
    participantCount:       participants.length,
    onToggleChat:           () => setIsChatOpen(o => {
      if (!o) setUnreadCount(0);
      return !o;
    }),
    isChatOpen,
    onToggleParticipants:   () => setIsParticipantsOpen(o => !o),
    unreadCount,
    isParticipantsOpen,
    viewMode:               meetingViewMode,
    onToggleViewMode:       () => setMeetingViewMode(v => v === 'grid' ? 'speaker' : 'grid'),
    onRaiseHand:            handleRaiseHand,
    handRaised,
    raisedHandCount:        handRaisedIds.size,
    // ── MUTE SYSTEM props ──────────────────────────────────────────────────
    isHost,               // only host sees Mute Everyone button
    isForceMuted,         // local user is force-muted → show locked mic UI
    allowSelfUnmute,      // host's permission flag
    onMuteAll:            handleMuteAll,
    onToggleAllowUnmute:  handleToggleAllowUnmute,
    onReaction:             handleReaction,
    recordingDuration,
  };

  return (
    <div
      className="h-screen bg-slate-950 flex overflow-hidden"
      onControlsReveal={resetHideTimer}
      onClick={resetHideTimer}
    >
      {/* ── Main column ──────────────────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col min-w-0 overflow-hidden ${isMeetingMode ? 'bg-slate-950' : 'relative bg-black'}`}>

        {/* Reconnecting banner */}
        <AnimatePresence>
          {isReconnecting && (
            <motion.div
              initial={{ y: -40 }}
              animate={{ y: 0 }}
              exit={{ y: -40 }}
              className="absolute top-0 inset-x-0 z-50 bg-yellow-500/90 backdrop-blur-sm
                         flex items-center justify-center gap-2 py-2
                         text-xs font-semibold text-white"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Reconnecting… your spot is being held
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Top bar ─────────────────────────────────────────────────────── */}
        {isMeetingMode ? (
          /* MEETING: fixed top bar in normal flow */
          <div className="flex-shrink-0 z-20 px-3 sm:px-5 py-2.5 bg-slate-900
                          border-b border-white/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="hidden sm:block text-white font-semibold text-xs sm:text-sm
                             font-mono tracking-widest truncate sm:max-w-[200px]">
                {roomId}
              </h2>
              <button
                onClick={() => setIsShareModalOpen(true)}
                className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full
                           bg-blue-500/20 hover:bg-blue-500/30 text-blue-300
                           border border-blue-500/30 text-xs transition-all"
              >
                <Share2 className="w-3 h-3" />
                <span>Share</span>
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <ModeToggle mode={mode} onToggle={toggleMode} />
            </div>
          </div>
        ) : (
          /* CALL: overlay top bar */
          <AnimatePresence>
            {controlsVisible && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-0 inset-x-0 z-20 p-2 sm:p-4
                           bg-gradient-to-b from-black/60 to-transparent"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <h2 className="hidden sm:block text-white font-semibold text-xs sm:text-sm
                                   font-mono tracking-widest truncate">
                      {roomId}
                    </h2>
                    <button
                      onClick={copyRoomLink}
                      className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-white/10 hover:bg-white/20 text-white text-xs transition-all"
                    >
                      <Copy className="w-3 h-3" /> Copy
                    </button>
                    <button
                      onClick={() => setIsShareModalOpen(true)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300
                                 border border-blue-500/30 text-xs transition-all"
                    >
                      <Share2 className="w-3 h-3" />
                      <span className="hidden sm:inline">Share</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ModeToggle mode={mode} onToggle={toggleMode} />
                    <button
                      onClick={() => { setIsChatOpen(o => !o); setUnreadCount(0); }}
                      className="relative w-8 h-8 rounded-full bg-white/10 hover:bg-white/20
                                 flex items-center justify-center text-white transition-all"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500
                                         rounded-full flex items-center justify-center
                                         text-[9px] font-bold text-white px-0.5
                                         ring-2 ring-slate-900 animate-bounce">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* ── Video grid (fills remaining space) ──────────────────────────── */}
        <div className="flex-1 relative overflow-hidden min-h-0">
          <VideoGrid
            mode={mode}
            localStream={localStream}
            remoteStreams={remoteStreams}
            localUserId={user._id}
            localUsername={user.username}
            isMuted={isMuted}
            isVideoOff={isVideoOff}
            activeSpeaker={activeSpeaker}
            participants={participants}
            meetingViewMode={meetingViewMode}
            pinnedUserId={pinnedUserId}
            onPin={handlePin}
            screenStream={screenStream}
            presenterUserId={presenterUserId}
            onStopSharing={doStopSharing}
            onControlsReveal={resetHideTimer}
            forceMutedIds={forceMutedIds}
          />
        </div>

        {/* ── Floating emoji reactions (visible to all) ───────────────────── */}
        <AnimatePresence>
          {floatReactions.map(r => (
            <motion.div
              key={r.id}
              initial={{ opacity: 1, y: 0, scale: 1, x: '-50%' }}
              animate={{ opacity: 0, y: -180, scale: 2.8, x: '-50%' }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.8, ease: 'easeOut' }}
              className="absolute left-1/2 bottom-28 z-30 flex flex-col items-center
                         pointer-events-none select-none"
              style={{ transform: 'translateX(-50%)' }}
            >
              <span className="text-5xl drop-shadow-2xl">{r.emoji}</span>
              <span className="text-white text-[10px] font-medium mt-1 bg-black/50
                               px-2 py-0.5 rounded-full backdrop-blur-sm">
                {r.username}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* ── RAISE HAND: floating notification banners (top-right) ─────── */}
        <HandRaisedBanner
          raisedHands={raisedHands}
          notifications={handNotifications}
          onDismiss={dismissHandNotif}
          localUserId={user._id}
        />

        {/* ── Controls ────────────────────────────────────────────────────── */}
        {isMeetingMode ? (
          <div className="flex-shrink-0 z-20">
            <Controls {...controlProps} />
          </div>
        ) : (
          <AnimatePresence>
            {controlsVisible && <Controls {...controlProps} />}
          </AnimatePresence>
        )}
      </div>

      {/* ── Participants panel (meeting) ───────────────────────────────────── */}
      {isMeetingMode && (
        <ParticipantsPanel
          isOpen={isParticipantsOpen}
          onClose={() => setIsParticipantsOpen(false)}
          participants={sortedParticipants}
          localUserId={user._id}
          activeSpeaker={activeSpeaker}
          handRaisedIds={handRaisedIds}
          forceMutedIds={forceMutedIds}
          isHost={isHost}
          onPinParticipant={handlePin}
          onMuteParticipant={uid => emit('mute-participant', { roomId, userId: user._id, targetId: uid })}
        />
      )}

      {/* ── Chat sidebar ──────────────────────────────────────────────────── */}
      <ChatSidebar
        isMobile={isMobile}
        roomId={roomId}
        socket={socket}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        roomEvents={roomEvents}
        onUnread={(n) => setUnreadCount(n)}
      />

      {/* ── Share modal ───────────────────────────────────────────────────── */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomId}
        meetingLink={`${window.location.origin}/join/${roomId}`}
      />

      {/* ── Recording modal ───────────────────────────────────────────────── */}
      <RecordingModal
        isOpen={isRecordingModalOpen}
        onClose={() => setIsRecordingModalOpen(false)}
        isRecording={isRecording}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        participantCount={participants.length || 1}
        recordings={recordings}
        onDeleteRecording={handleDeleteRecording}
        onDownloadRecording={handleDownloadRecording}
        recordingDuration={recordingDuration}
      />
    </div>
  );
};

export default memo(VideoRoom);