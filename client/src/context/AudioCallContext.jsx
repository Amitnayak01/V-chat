/**
 * AudioCallContext.jsx
 * ────────────────────
 * Global context for 1:1 and group audio calls.
 * - Manages WebRTC peer connections (audio-only, separate from VideoRoom)
 * - Handles ringing tone via Web Audio API (no external files needed)
 * - Tracks call state, duration, participants
 * - Zero interference with the existing video-call system
 *
 * Call state machine:
 *   idle → calling  (outgoing call initiated)
 *   idle → incoming (incoming call received)
 *   calling / incoming → connecting (call accepted by both sides)
 *   connecting → connected (WebRTC established)
 *   any → idle  (call ended / rejected / failed / timeout)
 */

import {
  createContext, useContext, useRef, useState,
  useCallback, useEffect,
} from 'react';
import { useSocket } from './SocketContext';
import { useAuth }   from './AuthContext';
import { WEBRTC_CONFIG } from '../utils/webrtc';

// ─────────────────────────────────────────────────────────────────────────────
const AudioCallContext = createContext(null);

export const useAudioCall = () => {
  const ctx = useContext(AudioCallContext);
  if (!ctx) throw new Error('useAudioCall must be used within AudioCallProvider');
  return ctx;
};

// ─── Audio constraints — voice only ──────────────────────────────────────────
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation:  true,
    noiseSuppression:  true,
    autoGainControl:   true,
    sampleRate:        48000,
    channelCount:      1,
  },
  video: false,
};

// ─── WhatsApp-style ring tone via Web Audio API ───────────────────────────────
const makeRingtone = () => {
  let audioCtx   = null;
  let intervalId = null;

  const playPattern = () => {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx  = new Ctx();

      const beep = (freq, startDelay, dur) => {
        const osc  = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startDelay);
        gain.gain.setValueAtTime(0, audioCtx.currentTime + startDelay);
        gain.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + startDelay + 0.01);
        gain.gain.linearRampToValueAtTime(0,    audioCtx.currentTime + startDelay + dur);
        osc.start(audioCtx.currentTime + startDelay);
        osc.stop (audioCtx.currentTime + startDelay + dur);
      };

      // Two-tone ring: 440 Hz → 480 Hz (matches WhatsApp cadence)
      beep(440, 0.00, 0.40);
      beep(480, 0.50, 0.40);
    } catch (_) { /* AudioContext blocked — silent fallback */ }
  };

  return {
    start: () => {
      playPattern();
      intervalId = setInterval(playPattern, 3200);
    },
    stop: () => {
      clearInterval(intervalId);
      intervalId = null;
      try { audioCtx?.close(); } catch (_) {}
      audioCtx = null;
    },
  };
};

// ─────────────────────────────────────────────────────────────────────────────
export const AudioCallProvider = ({ children }) => {
  const { socket, emit } = useSocket();
  const { user }         = useAuth();

  // ── Call state ─────────────────────────────────────────────────────────────
  // 'idle' | 'calling' | 'incoming' | 'connecting' | 'connected'
  const [callState,    setCallState]    = useState('idle');
  const [incomingCall, setIncomingCall] = useState(null);
  // { callId, callerId, callerName, callerAvatar }

  const [activeCall,   setActiveCall]   = useState(null);
  // { callId, peerId, peerName, peerAvatar, isGroup, roomId? }

  const [localStream,    setLocalStream]    = useState(null);
  const [remoteStreams,   setRemoteStreams]  = useState(new Map());
  const [isMuted,         setIsMuted]       = useState(false);
  const [callDuration,    setCallDuration]  = useState(0);
  const [participants,    setParticipants]  = useState([]);
  // toast-style status messages
  const [callStatus,      setCallStatus]    = useState('');

  // ── Refs ───────────────────────────────────────────────────────────────────
  const peerConnectionsRef = useRef(new Map()); // userId → RTCPeerConnection
  const localStreamRef     = useRef(null);
  const pendingCandidates  = useRef(new Map()); // userId → RTCIceCandidate[]
  const callTimerRef       = useRef(null);
  const ringtoneRef        = useRef(null);
  const remoteStreamsRef   = useRef(new Map());

  // "Latest value" refs so socket callbacks always see fresh state/functions
  const callStateRef   = useRef('idle');
  const activeCallRef  = useRef(null);
  const callIdRef      = useRef(null);
  const incomingCallRef = useRef(null);

  useEffect(() => { callStateRef.current  = callState;    }, [callState]);
  useEffect(() => { activeCallRef.current = activeCall;   }, [activeCall]);
  useEffect(() => { incomingCallRef.current = incomingCall; }, [incomingCall]);

  // ── Ringtone ───────────────────────────────────────────────────────────────
  const startRinging = useCallback(() => {
    if (!ringtoneRef.current) ringtoneRef.current = makeRingtone();
    ringtoneRef.current.start();
  }, []);

  const stopRinging = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
  }, []);

  // ── Call timer ─────────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    setCallDuration(0);
    callTimerRef.current = setInterval(
      () => setCallDuration((d) => d + 1),
      1000,
    );
  }, []);

  const stopTimer = useCallback(() => {
    clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    setCallDuration(0);
  }, []);

  // ── Remote stream registry ─────────────────────────────────────────────────
  const publishRemoteStream = useCallback((userId, stream) => {
    remoteStreamsRef.current.set(userId, stream);
    setRemoteStreams(new Map(remoteStreamsRef.current));
  }, []);

  const removeRemoteStream = useCallback((userId) => {
    remoteStreamsRef.current.delete(userId);
    setRemoteStreams(new Map(remoteStreamsRef.current));
  }, []);

  // ── ICE candidate queue ────────────────────────────────────────────────────
  const flushPendingCandidates = useCallback(async (userId, pc) => {
    const queue = pendingCandidates.current.get(userId) ?? [];
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (_) {}
    }
    pendingCandidates.current.delete(userId);
  }, []);

  // ── Create / replace a peer connection ─────────────────────────────────────
  const createAudioPeer = useCallback(
    (userId) => {
      // Close any existing connection for this user
      const existing = peerConnectionsRef.current.get(userId);
      if (existing) {
        existing.ontrack               = null;
        existing.onicecandidate        = null;
        existing.onconnectionstatechange = null;
        existing.close();
        peerConnectionsRef.current.delete(userId);
      }

      const pc = new RTCPeerConnection(WEBRTC_CONFIG);

      // ── Add local audio ────────────────────────────────────────────────
      const stream = localStreamRef.current;
      if (stream) {
        stream.getAudioTracks().forEach((t) => pc.addTrack(t, stream));
      }

      // ── Receive remote audio ───────────────────────────────────────────
      pc.ontrack = ({ track, streams }) => {
        let peerStream = remoteStreamsRef.current.get(userId);
        if (!peerStream) {
          peerStream = new MediaStream();
          remoteStreamsRef.current.set(userId, peerStream);
        }
        const addIfMissing = (t) => {
          if (!peerStream.getTracks().find((e) => e.id === t.id)) {
            peerStream.addTrack(t);
          }
        };
        if (streams?.[0]) streams[0].getTracks().forEach(addIfMissing);
        else              addIfMissing(track);
        publishRemoteStream(userId, peerStream);
      };

      // ── ICE candidates — use audio-specific signaling events ───────────
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          emit('audio-webrtc-ice', { candidate, to: userId, from: user?._id });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'closed') {
          removeRemoteStream(userId);
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === 'failed') pc.restartIce?.();
      };

      peerConnectionsRef.current.set(userId, pc);
      return pc;
    },
    [emit, user, publishRemoteStream, removeRemoteStream],
  );

  // ── Offer / Answer ─────────────────────────────────────────────────────────
  const createAudioOffer = useCallback(
    async (userId) => {
      const pc = createAudioPeer(userId);
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        emit('audio-webrtc-offer', { offer, to: userId, from: user?._id });
      } catch (err) {
        console.error('[AudioCall] createAudioOffer:', err);
      }
    },
    [createAudioPeer, emit, user],
  );

  const handleAudioOffer = useCallback(
    async (fromUserId, offer) => {
      const pc = createAudioPeer(fromUserId);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        await flushPendingCandidates(fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emit('audio-webrtc-answer', { answer, to: fromUserId, from: user?._id });
      } catch (err) {
        console.error('[AudioCall] handleAudioOffer:', err);
      }
    },
    [createAudioPeer, emit, user, flushPendingCandidates],
  );

  const handleAudioAnswer = useCallback(
    async (fromUserId, answer) => {
      const pc = peerConnectionsRef.current.get(fromUserId);
      if (!pc) return;
      try {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          await flushPendingCandidates(fromUserId, pc);
        }
      } catch (err) {
        console.error('[AudioCall] handleAudioAnswer:', err);
      }
    },
    [flushPendingCandidates],
  );

  const handleAudioIce = useCallback(
    async (fromUserId, candidate) => {
      if (!candidate) return;
      const pc = peerConnectionsRef.current.get(fromUserId);
      if (!pc?.remoteDescription) {
        if (!pendingCandidates.current.has(fromUserId)) {
          pendingCandidates.current.set(fromUserId, []);
        }
        pendingCandidates.current.get(fromUserId).push(candidate);
        return;
      }
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (_) {}
    },
    [],
  );

  // ── Acquire / release microphone ───────────────────────────────────────────
  const acquireAudio = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const releaseAudio = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
  }, []);

  // ── Full cleanup (reset to idle) ───────────────────────────────────────────
  const fullCleanup = useCallback(() => {
    stopRinging();
    stopTimer();
    releaseAudio();

    peerConnectionsRef.current.forEach((pc) => {
      pc.ontrack               = null;
      pc.onicecandidate        = null;
      pc.onconnectionstatechange = null;
      pc.close();
    });
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingCandidates.current.clear();

    setRemoteStreams(new Map());
    setCallState('idle');
    setIncomingCall(null);
    setActiveCall(null);
    setIsMuted(false);
    setParticipants([]);
    setCallStatus('');
    callIdRef.current = null;
    callStateRef.current = 'idle';
  }, [stopRinging, stopTimer, releaseAudio]);

  // ══════════════════════════════════════════════════════════════════════════
  // P U B L I C  A P I
  // ══════════════════════════════════════════════════════════════════════════

  /** Caller: press the audio-call button */
  const initiateCall = useCallback(
    async (receiverId, receiverName, receiverAvatar) => {
      if (callStateRef.current !== 'idle') return;
      try {
        setCallState('calling');
        callStateRef.current = 'calling';
        setCallStatus('Ringing…');

        const callData = {
          peerId:     receiverId,
          peerName:   receiverName,
          peerAvatar: receiverAvatar,
          isGroup:    false,
        };
        setActiveCall(callData);
        activeCallRef.current = callData;

        await acquireAudio();
        startRinging();

        emit('audio-call-user', {
          callerId:      user._id,
          receiverId,
          callerName:    user.username,
          callerAvatar:  user.avatar,
        });
      } catch (err) {
        console.error('[AudioCall] initiateCall error:', err);
        fullCleanup();
        throw err;
      }
    },
    [acquireAudio, startRinging, emit, user, fullCleanup],
  );

  /** Receiver: accept the popup */
  const acceptCall = useCallback(async () => {
    const incoming = incomingCallRef.current;
    if (!incoming) return;
    try {
      stopRinging();
      setCallStatus('Connecting…');
      await acquireAudio();

      const callData = {
        callId:    incoming.callId,
        peerId:    incoming.callerId,
        peerName:  incoming.callerName,
        peerAvatar: incoming.callerAvatar,
        isGroup:   false,
      };
      setActiveCall(callData);
      activeCallRef.current  = callData;
      callIdRef.current      = incoming.callId;
      setCallState('connecting');
      callStateRef.current   = 'connecting';
      setIncomingCall(null);
      incomingCallRef.current = null;

      emit('audio-call-accepted', {
        callId:   incoming.callId,
        callerId: incoming.callerId,
      });
    } catch (err) {
      console.error('[AudioCall] acceptCall error:', err);
      fullCleanup();
      throw err;
    }
  }, [stopRinging, acquireAudio, emit, fullCleanup]);

  /** Receiver: reject the popup */
  const rejectCall = useCallback(() => {
    const incoming = incomingCallRef.current;
    if (!incoming) return;
    stopRinging();
    emit('audio-call-rejected', {
      callId:   incoming.callId,
      callerId: incoming.callerId,
    });
    fullCleanup();
  }, [stopRinging, emit, fullCleanup]);

  /** Either party: end the active call */
  const endCall = useCallback(() => {
    const call = activeCallRef.current;
    if (!call) { fullCleanup(); return; }

    if (call.isGroup) {
      emit('leave-audio-room', { roomId: call.roomId, userId: user?._id });
    } else {
      emit('audio-call-ended', {
        callId: callIdRef.current,
        peerId: call.peerId,
      });
    }
    fullCleanup();
  }, [emit, user, fullCleanup]);

  /** Toggle microphone */
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const next = !isMuted;
    stream.getAudioTracks().forEach((t) => { t.enabled = !next; });
    setIsMuted(next);
  }, [isMuted]);

  /** Join a group audio room */
  const joinAudioRoom = useCallback(
    async (roomId, roomName) => {
      if (callStateRef.current !== 'idle') return;
      try {
        setCallState('connecting');
        callStateRef.current = 'connecting';
        setCallStatus('Joining…');
        await acquireAudio();

        const callData = {
          peerId:  null,
          peerName: roomName,
          isGroup: true,
          roomId,
        };
        setActiveCall(callData);
        activeCallRef.current = callData;

        emit('join-audio-room', {
          roomId,
          userId:   user._id,
          username: user.username,
          avatar:   user.avatar,
        });
      } catch (err) {
        console.error('[AudioCall] joinAudioRoom error:', err);
        fullCleanup();
        throw err;
      }
    },
    [acquireAudio, emit, user, fullCleanup],
  );

  // ══════════════════════════════════════════════════════════════════════════
  // S O C K E T  E V E N T  H A N D L E R S
  // All handlers are stored in a ref so they see the latest state without
  // requiring the socket effect to re-run.
  // ══════════════════════════════════════════════════════════════════════════

  // Stable ref for all handler implementations
  const fn = useRef({});
  fn.current = {
    // Incoming call (receiver side)
    onIncomingAudioCall: ({ callId, callerId, callerName, callerAvatar }) => {
      if (callStateRef.current !== 'idle') {
        // We're busy — auto-reject
        emit('audio-call-rejected', { callId, callerId });
        return;
      }
      const data = { callId, callerId, callerName, callerAvatar };
      setIncomingCall(data);
      incomingCallRef.current = data;
      setCallState('incoming');
      callStateRef.current = 'incoming';
      startRinging();
    },

    // Caller gets confirmation of callId
    onAudioCallInitiated: ({ callId }) => {
      callIdRef.current = callId;
      setActiveCall((prev) => (prev ? { ...prev, callId } : null));
      if (activeCallRef.current) activeCallRef.current.callId = callId;
    },

    // Receiver accepted → caller creates WebRTC offer
    onAudioCallAccepted: async ({ callId }) => {
      stopRinging();
      setCallState('connecting');
      callStateRef.current = 'connecting';
      setCallStatus('Connecting…');
      const call = activeCallRef.current;
      if (call && !call.isGroup) {
        await createAudioOffer(call.peerId);
      }
    },

    // Receiver rejected
    onAudioCallRejected: () => {
      stopRinging();
      fullCleanup();
    },

    // Peer ended or call timed out
    onAudioCallEnded: () => {
      stopRinging();
      fullCleanup();
    },

    // Receiver is offline — server queued the call, keep ringing
    onAudioCallQueued: ({ callId }) => {
      // Update callId in case it differs, then show offline-ring status.
      // The ringtone is already playing (started in initiateCall).
      // We stay in 'calling' state — UI shows "Ringing (offline)…"
      callIdRef.current = callId;
      setActiveCall((prev) => (prev ? { ...prev, callId } : null));
      if (activeCallRef.current) activeCallRef.current.callId = callId;
      setCallStatus('Ringing (offline)…');
    },

    // User was offline and never reconnected in time / caller cancelled
    onAudioCallFailed:   () => { stopRinging(); fullCleanup(); },
    onAudioCallTimeout:  () => { stopRinging(); fullCleanup(); },
    onAudioCallBusy:     () => { stopRinging(); fullCleanup(); },

    // WebRTC signaling (audio-specific events)
    onAudioWebRTCOffer: async ({ offer, from }) => {
      if (!activeCallRef.current) return;
      await handleAudioOffer(from, offer);
    },

    onAudioWebRTCAnswer: async ({ answer, from }) => {
      if (!activeCallRef.current) return;
      await handleAudioAnswer(from, answer);
      // Mark as connected once answer arrives
      setCallState('connected');
      callStateRef.current = 'connected';
      setCallStatus('');
      startTimer();
    },

    onAudioWebRTCIce: async ({ candidate, from }) => {
      if (!activeCallRef.current) return;
      await handleAudioIce(from, candidate);
    },

    // ── Group room events ──────────────────────────────────────────────
    onAudioRoomJoined: async ({ roomId, participants: existing }) => {
      setParticipants(existing);
      setCallState('connected');
      callStateRef.current = 'connected';
      setCallStatus('');
      startTimer();
      for (const p of existing) {
        await createAudioOffer(p.userId);
      }
    },

    onUserJoinedAudio: async ({ userId, username, avatar, allParticipants }) => {
      setParticipants(allParticipants.filter((p) => p.userId !== user?._id));
      await createAudioOffer(userId);
    },

    onUserLeftAudio: ({ userId, allParticipants }) => {
      setParticipants(allParticipants.filter((p) => p.userId !== user?._id));
      const pc = peerConnectionsRef.current.get(userId);
      if (pc) { pc.close(); peerConnectionsRef.current.delete(userId); }
      removeRemoteStream(userId);
    },

    onAudioRoomEnded: () => { fullCleanup(); },
  };

  // ── Register stable socket wrappers (run once per socket instance) ─────────
  useEffect(() => {
    if (!socket) return;

    const wrap = (key) => (...args) => fn.current[key]?.(...args);

    const handlers = {
      'incoming-audio-call':  wrap('onIncomingAudioCall'),
      'audio-call-initiated': wrap('onAudioCallInitiated'),
      'audio-call-queued':    wrap('onAudioCallQueued'),
      'audio-call-accepted':  wrap('onAudioCallAccepted'),
      'audio-call-rejected':  wrap('onAudioCallRejected'),
      'audio-call-ended':     wrap('onAudioCallEnded'),
      'audio-call-failed':    wrap('onAudioCallFailed'),
      'audio-call-timeout':   wrap('onAudioCallTimeout'),
      'audio-call-busy':      wrap('onAudioCallBusy'),
      'audio-webrtc-offer':   wrap('onAudioWebRTCOffer'),
      'audio-webrtc-answer':  wrap('onAudioWebRTCAnswer'),
      'audio-webrtc-ice':     wrap('onAudioWebRTCIce'),
      'audio-room-joined':    wrap('onAudioRoomJoined'),
      'user-joined-audio':    wrap('onUserJoinedAudio'),
      'user-left-audio':      wrap('onUserLeftAudio'),
      'audio-room-ended':     wrap('onAudioRoomEnded'),
    };

    Object.entries(handlers).forEach(([ev, handler]) => socket.on(ev, handler));

    // ── Offline-ring delivery on (re)connect ──────────────────────────────
    // Every time the socket connects or reconnects, tell the server to push
    // any pending incoming call that was queued while we were offline.
    // This is the client side of the offline-ring feature — the server's
    // deliverPendingAudioCalls() is triggered by the 'check-pending-audio-calls'
    // event handled in audioCallSocket.js.
    const deliverOnConnect = () => {
      if (!user?._id) return;
      // Small delay to ensure the user's personal socket room has been joined
      // by the auth/connect handler in handlers.js before we ask for delivery.
      setTimeout(() => {
        socket.emit('check-pending-audio-calls', { userId: user._id });
      }, 500);
    };

    socket.on('connect',   deliverOnConnect);
    socket.on('reconnect', deliverOnConnect);

    // If socket is already connected right now, run delivery immediately
    if (socket.connected) deliverOnConnect();

    return () => {
      Object.entries(handlers).forEach(([ev, handler]) => socket.off(ev, handler));
      socket.off('connect',   deliverOnConnect);
      socket.off('reconnect', deliverOnConnect);
    };
  }, [socket, user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => () => fullCleanup(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <AudioCallContext.Provider
      value={{
        callState,
        incomingCall,
        activeCall,
        localStream,
        remoteStreams,
        isMuted,
        callDuration,
        participants,
        callStatus,
        initiateCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        joinAudioRoom,
      }}
    >
      {children}
    </AudioCallContext.Provider>
  );
};