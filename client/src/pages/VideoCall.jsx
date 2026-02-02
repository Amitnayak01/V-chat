import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCall } from "../CallContext";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Monitor, Grid, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 10
};

export default function VideoCall() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { socket, incomingCall, setIncomingCall } = useCall();
  
  const targetUserId = params.get("userId");
  const targetUsername = params.get("username");
  const isIncoming = params.get("incoming") === "true";
  const currentUserId = localStorage.getItem("userId");

  // Refs
  const localVideo = useRef();
  const remoteVideo = useRef();
  const peerConnection = useRef();
  const localStream = useRef();
  const pendingCandidates = useRef([]);

  // States
  const [callState, setCallState] = useState("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState("good");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useState("focus");
  const [hasRemoteStream, setHasRemoteStream] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);

  // Cleanup
  const cleanup = useCallback(() => {
    peerConnection.current?.close();
    localStream.current?.getTracks().forEach(t => t.stop());
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    navigate(-1);
  }, [navigate]);

  // Socket Events
  useEffect(() => {
    const handlers = {
      "call-accepted": async ({ answer }) => {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
        for (const c of pendingCandidates.current) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(c));
        }
        pendingCandidates.current = [];
        setCallState("connected");
        setCallDuration(0);
      },
      "call-declined": () => { alert("Call declined"); cleanup(); },
      "call-ended": cleanup,
      "ice-candidate": async ({ candidate }) => {
        if (peerConnection.current?.remoteDescription) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
          pendingCandidates.current.push(candidate);
        }
      }
    };

    Object.entries(handlers).forEach(([event, handler]) => socket.on(event, handler));
    return () => Object.keys(handlers).forEach(e => socket.off(e));
  }, [socket, cleanup]);

  // Call Timer
  useEffect(() => {
    if (callState !== "connected") return;
    const interval = setInterval(() => setCallDuration(d => d + 1), 1000);
    return () => clearInterval(interval);
  }, [callState]);

  // Auto-play Remote Video
  useEffect(() => {
    if (!hasRemoteStream || !remoteVideo.current) return;
    const timer = setTimeout(() => {
      remoteVideo.current?.play()
        .then(() => setShowPlayButton(false))
        .catch(() => setShowPlayButton(true));
    }, 100);
    return () => clearTimeout(timer);
  }, [hasRemoteStream]);

  // Setup Media
  const setupMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    localStream.current = stream;
    if (localVideo.current) localVideo.current.srcObject = stream;
    return stream;
  };

  // Create Peer Connection
  const createPeer = (stream, toUserId) => {
    const pc = new RTCPeerConnection(ICE_CONFIG);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = (e) => {
      if (e.streams[0] && remoteVideo.current && !remoteVideo.current.srcObject) {
        remoteVideo.current.srcObject = e.streams[0];
        setHasRemoteStream(true);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit("ice-candidate", { toUserId, candidate: e.candidate });
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      setConnectionQuality(state === "connected" || state === "completed" ? "good" : 
                          state === "disconnected" ? "fair" : "poor");
    };

    peerConnection.current = pc;
    return pc;
  };

  // Start Outgoing Call
  const startCall = async () => {
    try {
      setCallState("calling");
      const stream = await setupMedia();
      createPeer(stream, targetUserId);
      const offer = await peerConnection.current.createOffer({ 
        offerToReceiveAudio: true, 
        offerToReceiveVideo: true 
      });
      await peerConnection.current.setLocalDescription(offer);
      socket.emit("call-user", {
        toUserId: targetUserId,
        fromUserId: currentUserId,
        fromUsername: localStorage.getItem("username") || "Anonymous",
        offer: peerConnection.current.localDescription
      });
    } catch (err) {
      alert("Failed to start call. Check permissions.");
      cleanup();
    }
  };

  // Accept Incoming Call
  const acceptCall = async () => {
    if (!incomingCall) return;
    try {
      setCallState("connecting");
      const stream = await setupMedia();
      createPeer(stream, incomingCall.fromUserId);
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await peerConnection.current.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await peerConnection.current.setLocalDescription(answer);
      socket.emit("accept-call", {
        toUserId: incomingCall.fromUserId,
        fromUserId: currentUserId,
        answer: peerConnection.current.localDescription
      });
      setCallState("connected");
      setIncomingCall(null);
      setCallDuration(0);
    } catch (err) {
      alert("Failed to accept call. Check permissions.");
      cleanup();
    }
  };

  // Initialize Call
  useEffect(() => {
    let initialized = false;
    if (!initialized) {
      if (isIncoming && incomingCall) acceptCall();
      else if (targetUserId && targetUsername && !isIncoming) startCall();
      initialized = true;
    }
  }, []);

  // End Call
  const endCall = () => {
    socket.emit("end-call", { toUserId: targetUserId, fromUserId: currentUserId });
    setCallState("ended");
    setTimeout(cleanup, 1000);
  };

  // Media Controls
  const toggleMute = () => {
    const track = localStream.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsMuted(!track.enabled);
    }
  };

  const toggleVideo = () => {
    const track = localStream.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setIsVideoOff(!track.enabled);
    }
  };

  const toggleSpeaker = () => {
    if (remoteVideo.current) {
      remoteVideo.current.muted = !remoteVideo.current.muted;
      setIsSpeakerOff(remoteVideo.current.muted);
    }
  };

  const toggleScreenShare = async () => {
    try {
      const sender = peerConnection.current.getSenders().find(s => s.track?.kind === "video");
      if (!sender) return;

      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        await sender.replaceTrack(screenTrack);
        screenTrack.onended = () => toggleScreenShare();
        setIsScreenSharing(true);
      } else {
        const videoTrack = localStream.current.getVideoTracks()[0];
        await sender.replaceTrack(videoTrack);
        setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Screen share error:", err);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const formatDuration = (s) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}` 
                 : `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const styles = {
    container: {
      margin: 0, padding: 0, height: '100vh', width: '100vw',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
      fontFamily: "'Inter', sans-serif", overflow: 'hidden', position: 'relative'
    },
    header: {
      position: 'absolute', top: 0, left: 0, right: 0, padding: '20px 30px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 100%)', zIndex: 100
    },
    btn: {
      background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '50%', width: 56, height: 56, display: 'flex', alignItems: 'center',
      justifyContent: 'center', cursor: 'pointer', transition: 'all 0.3s',
      backdropFilter: 'blur(10px)'
    },
    video: { width: '100%', height: '100%', objectFit: 'cover', background: '#000' },
    pip: {
      position: 'absolute', bottom: 120, right: 30,
      width: layoutMode === "grid" ? '45%' : 280,
      height: layoutMode === "grid" ? '45%' : 200,
      borderRadius: 16, overflow: 'hidden', border: '3px solid rgba(255,255,255,0.3)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.5)', background: '#000'
    },
    controls: {
      position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)',
      display: 'flex', gap: 16, alignItems: 'center', padding: '16px 24px',
      background: 'rgba(15,23,42,0.8)', borderRadius: 60,
      border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(20px)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
    }
  };

  return (
    <div style={styles.container}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        .control-btn:hover { background: rgba(255,255,255,0.2); transform: translateY(-2px); }
        .control-btn.active { background: rgba(239,68,68,0.9); border-color: rgba(239,68,68,1); }
        .control-btn.end-call { background: rgba(239,68,68,0.9); width: 64px; height: 64px; }
        .control-btn.end-call:hover { background: rgba(220,38,38,1); transform: scale(1.05); }
        .stats-badge { padding: 6px 12px; border-radius: 20px; font-size: 11px; font-weight: 600; text-transform: uppercase; }
        .stats-badge.good { background: rgba(34,197,94,0.2); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
        .stats-badge.fair { background: rgba(251,191,36,0.2); color: #fbbf24; border: 1px solid rgba(251,191,36,0.3); }
        .stats-badge.poor { background: rgba(239,68,68,0.2); color: #f87171; border: 1px solid rgba(239,68,68,0.3); }
        .pulse { animation: pulse 2s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>

      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 600, margin: 0, marginBottom: 4 }}>
            {callState === "calling" ? `Calling ${targetUsername}...` : 
             callState === "connecting" ? `Connecting with ${targetUsername}...` :
             callState === "connected" ? targetUsername : 
             callState === "ended" ? "Call Ended" : 'Video Call'}
          </h2>
          {callState === "connected" && (
            <div style={{ display: 'flex', gap: 16 }}>
              <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 500 }}>
                {formatDuration(callDuration)}
              </span>
              <span className={`stats-badge ${connectionQuality}`}>
                {connectionQuality === "good" ? "HD" : connectionQuality === "fair" ? "SD" : "Poor"}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => setLayoutMode(m => m === "focus" ? "grid" : "focus")} 
                  className="control-btn" style={styles.btn}>
            <Grid size={22} color="#fff" />
          </button>
          <button onClick={toggleFullscreen} className="control-btn" style={styles.btn}>
            {isFullscreen ? <Minimize size={22} color="#fff" /> : <Maximize size={22} color="#fff" />}
          </button>
        </div>
      </div>

      {/* Videos */}
      <div style={{ width: '100%', height: '100%', position: 'relative' }}>
        <video ref={remoteVideo} autoPlay playsInline style={styles.video} />
        
        {!hasRemoteStream && callState === "connected" && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center', color: 'rgba(255,255,255,0.7)' }}>
            <Video size={48} color="rgba(255,255,255,0.5)" style={{ marginBottom: 12 }} />
            <p>Waiting for {targetUsername}'s video...</p>
          </div>
        )}

        {showPlayButton && hasRemoteStream && (
          <div onClick={() => remoteVideo.current?.play().then(() => setShowPlayButton(false))}
               style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', cursor: 'pointer', background: 'rgba(0,0,0,0.8)', padding: '24px 48px', borderRadius: 16, border: '2px solid rgba(59,130,246,0.5)', zIndex: 50, textAlign: 'center' }}>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(59,130,246,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <div style={{ width: 0, height: 0, borderLeft: '24px solid white', borderTop: '16px solid transparent', borderBottom: '16px solid transparent', marginLeft: 6 }} />
            </div>
            <p style={{ color: '#fff', fontSize: 16, fontWeight: 600, margin: 0 }}>Tap to play video</p>
          </div>
        )}

        <div style={styles.pip}>
          <video ref={localVideo} autoPlay muted playsInline 
                 style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
          {isVideoOff && (
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              Camera Off
            </div>
          )}
        </div>

        {(callState === "calling" || callState === "connecting") && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div className="pulse" style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(59,130,246,0.2)', border: '3px solid rgba(59,130,246,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <Phone size={48} color="#3b82f6" />
            </div>
            <p style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>
              {callState === "calling" ? `Calling ${targetUsername}...` : `Connecting with ${targetUsername}...`}
            </p>
          </div>
        )}

        {callState === "ended" && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'rgba(239,68,68,0.2)', border: '3px solid rgba(239,68,68,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <PhoneOff size={48} color="#ef4444" />
            </div>
            <p style={{ color: '#fff', fontSize: 18, fontWeight: 500 }}>Call Ended</p>
          </div>
        )}
      </div>

      {/* Controls */}
      {callState !== "ended" && (
        <div style={styles.controls}>
          <button onClick={toggleMute} className={`control-btn ${isMuted ? 'active' : ''}`} style={styles.btn}>
            {isMuted ? <MicOff size={22} color="#fff" /> : <Mic size={22} color="#fff" />}
          </button>
          <button onClick={toggleSpeaker} className={`control-btn ${isSpeakerOff ? 'active' : ''}`} style={styles.btn}>
            {isSpeakerOff ? <VolumeX size={22} color="#fff" /> : <Volume2 size={22} color="#fff" />}
          </button>
          <button onClick={endCall} className="control-btn end-call" style={{...styles.btn, width: 64, height: 64}}>
            <PhoneOff size={26} color="#fff" />
          </button>
          <button onClick={toggleVideo} className={`control-btn ${isVideoOff ? 'active' : ''}`} style={styles.btn}>
            {isVideoOff ? <VideoOff size={22} color="#fff" /> : <Video size={22} color="#fff" />}
          </button>
          <button onClick={toggleScreenShare} className={`control-btn ${isScreenSharing ? 'active' : ''}`} style={styles.btn}>
            <Monitor size={22} color="#fff" />
          </button>
        </div>
      )}
    </div>
  );
}