import {
  createContext, useContext, useRef, useState, useCallback,
} from 'react';
import { useSocket } from './SocketContext';
import {
  WEBRTC_CONFIG,
  getUserMedia,
  MEDIA_CONSTRAINTS,
  replaceTrack,
} from '../utils/webrtc';

// ─────────────────────────────────────────────────────────────────────────────
const WebRTCContext = createContext(null);

export const useWebRTC = () => {
  const ctx = useContext(WebRTCContext);
  if (!ctx) throw new Error('useWebRTC must be used within WebRTCProvider');
  return ctx;
};

// ─────────────────────────────────────────────────────────────────────────────
export const WebRTCProvider = ({ children }) => {
  const { emit } = useSocket();

  // ── State ──────────────────────────────────────────────────────────────────
  const [localStream,      setLocalStream]     = useState(null);
  const [remoteStreamsObj, setRemoteStreamsObj] = useState({});
  const [isMuted,          setIsMuted]         = useState(false);
  const [isVideoOff,       setIsVideoOff]      = useState(false);
  const [isScreenSharing,  setIsScreenSharing] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const peerConnectionsRef = useRef(new Map()); // userId → RTCPeerConnection
  const remoteStreamsRef   = useRef(new Map()); // userId → MediaStream  (source of truth)
  const localStreamRef     = useRef(null);
  const myUserIdRef        = useRef(null);
  const pendingCandidates  = useRef(new Map()); // userId → RTCIceCandidate[]

  // ── Derived: expose remoteStreams as Map ───────────────────────────────────
  // Build Map from state — exclude the internal _ts timestamp key
  const remoteStreams = new Map(
    Object.entries(remoteStreamsObj).filter(([k]) => k !== '_ts')
  );

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Publish a remote stream into React state.
  // We always create a fresh snapshot object so React sees a state change
  // and VideoTile's effects re-run — even when the MediaStream ref is the same.
  const publishStream = useCallback((userId, stream) => {
    remoteStreamsRef.current.set(userId, stream);
    // Spread into a new object every time so every downstream memo/effect
    // that depends on remoteStreamsObj always sees a new reference.
    setRemoteStreamsObj(() => ({
      ...Object.fromEntries(remoteStreamsRef.current),
      // Force a new plain-object identity (Object.fromEntries already does this,
      // but the extra _ts guarantees no bail-out via shallow equality)
      _ts: Date.now(),
    }));
  }, []);

  const removeRemoteStream = useCallback((userId) => {
    remoteStreamsRef.current.delete(userId);
    setRemoteStreamsObj(Object.fromEntries(remoteStreamsRef.current));
  }, []);

  const flushPendingCandidates = useCallback(async (userId, pc) => {
    const pending = pendingCandidates.current.get(userId) ?? [];
    for (const candidate of pending) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (_) {}
    }
    pendingCandidates.current.delete(userId);
  }, []);

  // ── createPeer ─────────────────────────────────────────────────────────────
  const createPeer = useCallback((userId) => {
    // Close stale connection
    const existing = peerConnectionsRef.current.get(userId);
    if (existing) {
      existing.ontrack                    = null;
      existing.onicecandidate             = null;
      existing.onconnectionstatechange    = null;
      existing.oniceconnectionstatechange = null;
      existing.close();
      peerConnectionsRef.current.delete(userId);
    }

    const pc = new RTCPeerConnection(WEBRTC_CONFIG);

    // ── Add local tracks ──────────────────────────────────────────────────
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(track => pc.addTrack(track, stream));

    // ── Incoming remote tracks ────────────────────────────────────────────
    // We maintain ONE MediaStream per peer in remoteStreamsRef.
    // Every ontrack event adds the new track into it.
    //
    // KEY: we always call publishStream() which creates a fresh object
    // reference in state so React/VideoTile sees the update even when the
    // underlying MediaStream object is the same reference.
    pc.ontrack = ({ track, streams }) => {
      console.log(`[WebRTC] ontrack from ${userId}: kind=${track.kind} id=${track.id} streams=${streams?.length}`);

      // Get or create our canonical MediaStream for this peer
      let peerStream = remoteStreamsRef.current.get(userId);
      if (!peerStream) {
        peerStream = new MediaStream();
        remoteStreamsRef.current.set(userId, peerStream);
      }

      // Add track(s) — prefer the browser-provided stream so we get all tracks
      // that were negotiated together (audio + video in one bundle).
      const addIfMissing = (t) => {
        if (!peerStream.getTracks().find(e => e.id === t.id)) peerStream.addTrack(t);
      };

      if (streams && streams.length > 0) {
        streams[0].getTracks().forEach(addIfMissing);
      } else {
        // Firefox / older Safari — track arrives directly without a streams array
        addIfMissing(track);
      }

      // Publish immediately — VideoTile uses addtrack events + polling internally,
      // so a single publish is enough.
      publishStream(userId, peerStream);

      // Re-publish on important track lifecycle changes so VideoTile
      // re-evaluates hasVideo (e.g. camera toggled off/on remotely).
      track.onended  = () => publishStream(userId, peerStream);
      track.onmute   = () => publishStream(userId, peerStream);
      track.onunmute = () => {
        console.log(`[WebRTC] track unmuted from ${userId}: kind=${track.kind}`);
        publishStream(userId, peerStream);
      };
    };

    // ── ICE ───────────────────────────────────────────────────────────────
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) emit('webrtc-ice-candidate', { candidate, to: userId });
    };

    // ── Connection lifecycle ──────────────────────────────────────────────
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[WebRTC] connection state with ${userId}: ${state}`);
      if (state === 'failed' || state === 'closed') removeRemoteStream(userId);
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE state with ${userId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') pc.restartIce?.();
    };

    peerConnectionsRef.current.set(userId, pc);
    return pc;
  }, [emit, publishStream, removeRemoteStream]);

  // ── Public API ─────────────────────────────────────────────────────────────

  const initializeMedia = useCallback(async (userId) => {
    myUserIdRef.current = userId;
    const { stream, error } = await getUserMedia(MEDIA_CONSTRAINTS);
    if (error || !stream) return { success: false, error };
    localStreamRef.current = stream;
    setLocalStream(stream);
    return { success: true };
  }, []);

  const createOffer = useCallback(async (userId, roomId) => {
    const pc = createPeer(userId);
    try {
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      emit('webrtc-offer', { offer, to: userId, from: myUserIdRef.current, roomId });
    } catch (err) {
      console.error('[WebRTC] createOffer:', err);
    }
  }, [createPeer, emit]);

  const handleOffer = useCallback(async (fromUserId, roomId, offer) => {
    const pc = createPeer(fromUserId);
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(fromUserId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      emit('webrtc-answer', { answer, to: fromUserId, from: myUserIdRef.current, roomId });
    } catch (err) {
      console.error('[WebRTC] handleOffer:', err);
    }
  }, [createPeer, emit, flushPendingCandidates]);

  const handleAnswer = useCallback(async (fromUserId, answer) => {
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (!pc) return;
    try {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        await flushPendingCandidates(fromUserId, pc);
      }
    } catch (err) {
      console.error('[WebRTC] handleAnswer:', err);
    }
  }, [flushPendingCandidates]);

  const handleIceCandidate = useCallback(async (fromUserId, candidate) => {
    if (!candidate) return;
    const pc = peerConnectionsRef.current.get(fromUserId);
    if (!pc || !pc.remoteDescription) {
      // Queue until remote description is ready
      if (!pendingCandidates.current.has(fromUserId)) {
        pendingCandidates.current.set(fromUserId, []);
      }
      pendingCandidates.current.get(fromUserId).push(candidate);
      return;
    }
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      if (!err.message?.includes('remote description')) {
        console.warn('[WebRTC] addIceCandidate:', err);
      }
    }
  }, []);

  // ── Mute controls ──────────────────────────────────────────────────────────

  /** User-initiated toggle — respects isMuted state. */
  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newMuted = !isMuted;
    stream.getAudioTracks().forEach(t => { t.enabled = !newMuted; });
    setIsMuted(newMuted);
  }, [isMuted]);

  /**
   * forceMute — called by VideoRoom when the server sends host-muted-all or
   * host-muted-you. Mutes the audio track regardless of current isMuted state
   * and updates the UI accordingly.
   */
  const forceMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = false; });
    setIsMuted(true);
  }, []);

  /**
   * forceUnmute — called by VideoRoom when allowUnmute=true and the user
   * chooses to unmute after being force-muted. State control stays in
   * VideoRoom which guards the allowUnmute flag.
   */
  const forceUnmute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => { t.enabled = true; });
    setIsMuted(false);
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const newOff = !isVideoOff;
    stream.getVideoTracks().forEach(t => { t.enabled = !newOff; });
    setIsVideoOff(newOff);
  }, [isVideoOff]);

  const replaceVideoTrack = useCallback(async (newTrack) => {
    const results = await Promise.allSettled(
      Array.from(peerConnectionsRef.current.values()).map(pc =>
        replaceTrack(pc, newTrack, 'video')
      )
    );
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.warn('[WebRTC] replaceVideoTrack peer', i, r.reason);
      }
    });
  }, []);

  const startScreenShare = useCallback(() => {
    setIsScreenSharing(true);
  }, []);

  const stopScreenShare = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) {
      const cameraTrack = stream.getVideoTracks()[0];
      if (cameraTrack) {
        peerConnectionsRef.current.forEach(pc => {
          replaceTrack(pc, cameraTrack, 'video').catch(() => {});
        });
      }
    }
    setIsScreenSharing(false);
  }, []);

  const handlePeerDisconnect = useCallback((userId) => {
    const pc = peerConnectionsRef.current.get(userId);
    if (pc) {
      pc.ontrack                    = null;
      pc.onicecandidate             = null;
      pc.onconnectionstatechange    = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      peerConnectionsRef.current.delete(userId);
    }
    pendingCandidates.current.delete(userId);
    removeRemoteStream(userId);
  }, [removeRemoteStream]);

  const cleanup = useCallback(() => {
    peerConnectionsRef.current.forEach(pc => {
      pc.ontrack                    = null;
      pc.onicecandidate             = null;
      pc.onconnectionstatechange    = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
    });
    peerConnectionsRef.current.clear();
    remoteStreamsRef.current.clear();
    pendingCandidates.current.clear();

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;

    setLocalStream(null);
    setRemoteStreamsObj({});
    setIsMuted(false);
    setIsVideoOff(false);
    setIsScreenSharing(false);
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────
  return (
    <WebRTCContext.Provider value={{
      localStream,
      remoteStreams,
      isMuted,
      isVideoOff,
      isScreenSharing,
      initializeMedia,
      createOffer,
      handleOffer,
      handleAnswer,
      handleIceCandidate,
      toggleMute,
      forceMute,
      forceUnmute,
      toggleVideo,
      startScreenShare,
      stopScreenShare,
      replaceVideoTrack,
      handlePeerDisconnect,
      cleanup,
    }}>
      {children}
    </WebRTCContext.Provider>
  );
};