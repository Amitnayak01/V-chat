import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCall } from "../CallContext";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Phone, Monitor, Grid, Volume2, VolumeX, Maximize, Minimize, User, Wifi, WifiOff } from "lucide-react";
import { RefreshCcw } from "lucide-react";


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
  const [showControls, setShowControls] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user"); // "user" = front, "environment" = back
  const [isLocalFullscreen, setIsLocalFullscreen] = useState(false);
 
  const pipRef = useRef(null);
const [pipPosition, setPipPosition] = useState({ x: 0, y: 0 });
const dragData = useRef({ dragging: false, offsetX: 0, offsetY: 0 });

const startDrag = (e) => {
  if (layoutMode !== "focus" || isLocalFullscreen) return;

  const rect = pipRef.current.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  dragData.current = {
    dragging: true,
    offsetX: clientX - rect.left,
    offsetY: clientY - rect.top
  };
};

const onDrag = (e) => {
  if (!dragData.current.dragging) return;

  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;

  const x = clientX - dragData.current.offsetX;
  const y = clientY - dragData.current.offsetY;

  setPipPosition({ x, y });
};

const endDrag = () => {
  if (!dragData.current.dragging) return;
  dragData.current.dragging = false;

  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  const rect = pipRef.current.getBoundingClientRect();

  // Snap logic
  const snapX = rect.left < screenW / 2 ? 16 : screenW - rect.width - 16;
  const snapY = rect.top < screenH / 2 ? 16 : screenH - rect.height - 120;

  setPipPosition({ x: snapX, y: snapY });
};


useEffect(() => {
  window.addEventListener("mousemove", onDrag);
  window.addEventListener("mouseup", endDrag);
  window.addEventListener("touchmove", onDrag);
  window.addEventListener("touchend", endDrag);
  return () => {
    window.removeEventListener("mousemove", onDrag);
    window.removeEventListener("mouseup", endDrag);
    window.removeEventListener("touchmove", onDrag);
    window.removeEventListener("touchend", endDrag);
  };
}, []);




  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-hide controls
  useEffect(() => {
    if (callState !== "connected") return;
    let timeout;
    const resetTimeout = () => {
      setShowControls(true);
      clearTimeout(timeout);
      timeout = setTimeout(() => setShowControls(false), 3000);
    };
    resetTimeout();
    document.addEventListener('mousemove', resetTimeout);
    document.addEventListener('touchstart', resetTimeout);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousemove', resetTimeout);
      document.removeEventListener('touchstart', resetTimeout);
    };
  }, [callState]);

  // Cleanup
  const cleanup = useCallback(() => {
    peerConnection.current?.close();
    localStream.current?.getTracks().forEach(t => t.stop());
    if (localVideo.current) localVideo.current.srcObject = null;
    if (remoteVideo.current) remoteVideo.current.srcObject = null;
    navigate(-1);
  }, [navigate]);

  const switchCamera = async () => {
  try {
    if (!localStream.current) return;

    const currentVideoTrack = localStream.current.getVideoTracks()[0];
    if (currentVideoTrack) currentVideoTrack.stop();

    const newFacing = cameraFacing === "user" ? "environment" : "user";

    const newStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { exact: newFacing } },
      audio: false
    });

    const newVideoTrack = newStream.getVideoTracks()[0];

    // Replace track in peer connection
    const sender = peerConnection.current
      ?.getSenders()
      .find(s => s.track?.kind === "video");

    if (sender) await sender.replaceTrack(newVideoTrack);

    // Update local stream
    localStream.current.removeTrack(currentVideoTrack);
    localStream.current.addTrack(newVideoTrack);

    localVideo.current.srcObject = localStream.current;

    setCameraFacing(newFacing);
  } catch (err) {
    console.error("Camera switch error:", err);
  }
};

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

  return (
    <div className="video-call-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        
        * { box-sizing: border-box; margin: 0; padding: 0; }
        
        .video-call-container {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          overflow: hidden;
          color: white;
        }

        /* Header */
        .call-header {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          padding: clamp(12px, 3vw, 24px);
          background: linear-gradient(180deg, rgba(0,0,0,0.6) 0%, transparent 100%);
          z-index: 100;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .call-header.hidden {
          opacity: 0;
          transform: translateY(-100%);
          pointer-events: none;
        }

        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 1400px;
          margin: 0 auto;
        }

        .header-info h2 {
          font-size: clamp(16px, 4vw, 24px);
          font-weight: 700;
          margin-bottom: 6px;
          letter-spacing: -0.02em;
        }

        .header-meta {
          display: flex;
          gap: clamp(8px, 2vw, 16px);
          align-items: center;
          flex-wrap: wrap;
        }

        .duration-badge, .quality-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: clamp(11px, 2.5vw, 13px);
          font-weight: 600;
          backdrop-filter: blur(10px);
          white-space: nowrap;
        }

        .duration-badge {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border: 1px solid rgba(59, 130, 246, 0.3);
        }

        .quality-badge {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .quality-badge.good { background: rgba(34, 197, 94, 0.2); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.3); }
        .quality-badge.fair { background: rgba(251, 191, 36, 0.2); color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); }
        .quality-badge.poor { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }

        .header-actions {
          display: flex;
          gap: clamp(8px, 2vw, 12px);
        }

        /* Video Layout */
        .video-layout {
          width: 100%;
          height: 100%;
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .video-layout.grid-mode {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 8px;
        }

        @media (max-width: 768px) {
          .video-layout.grid-mode {
            grid-template-columns: 1fr;
            grid-template-rows: 1fr 1fr;
          }
        }

        /* Remote Video */
        .remote-video-container {
          width: 100%;
          height: 100%;
          position: relative;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .video-layout.grid-mode .remote-video-container {
          border-radius: 16px;
          overflow: hidden;
        }

        .remote-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          background: #000;
        }

        /* Local Video (PiP) */
        .local-video-container {
          position: absolute;
          bottom: clamp(80px, 15vh, 140px);
          right: clamp(12px, 3vw, 30px);
          width: clamp(120px, 25vw, 280px);
          height: clamp(90px, 18vw, 200px);
          border-radius: clamp(12px, 2vw, 20px);
          overflow: hidden;
          border: 3px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
          background: #000;
          z-index: 50;
          transition: all 0.3s ease;
        }

        .video-layout.grid-mode .local-video-container {
          position: relative;
          bottom: auto;
          right: auto;
          width: 100%;
          height: 100%;
          border-radius: 16px;
        }

        @media (max-width: 768px) {
          .local-video-container {
            width: clamp(100px, 30vw, 160px);
            height: clamp(75px, 22vw, 120px);
            bottom: clamp(100px, 18vh, 120px);
            right: clamp(12px, 3vw, 16px);
          }
        }

        .local-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transform: scaleX(-1);
        }

        .video-placeholder {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(10px);
          gap: 16px;
        }

        .video-placeholder-icon {
          width: clamp(60px, 10vw, 80px);
          height: clamp(60px, 10vw, 80px);
          border-radius: 50%;
          background: rgba(59, 130, 246, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid rgba(59, 130, 246, 0.3);
        }

        .video-placeholder p {
          font-size: clamp(13px, 3vw, 16px);
          color: rgba(255, 255, 255, 0.7);
          text-align: center;
          padding: 0 20px;
        }

        /* Controls */
        .controls-container {
          position: absolute;
          bottom: clamp(16px, 4vw, 30px);
          left: 50%;
          transform: translateX(-50%);
          z-index: 100;
          transition: opacity 0.3s ease, transform 0.3s ease;
        }

        .controls-container.hidden {
          opacity: 0;
          transform: translateX(-50%) translateY(20px);
          pointer-events: none;
        }

        .controls {
          display: flex;
          gap: clamp(10px, 2.5vw, 18px);
          align-items: center;
          padding: clamp(14px, 3.5vw, 22px) clamp(20px, 5vw, 36px);
          background: rgba(15, 23, 42, 0.95);
          border-radius: 60px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }

        @media (max-width: 768px) {
          .controls {
            padding: 10px 16px;
            gap: 8px;
          }
        }

        @media (max-width: 480px) {
          .controls {
            padding: 10px 14px;
            gap: 6px;
          }
        }

        @media (max-width: 380px) {
          .controls {
            padding: 8px 12px;
            gap: 5px;
          }
        }

        .control-btn {
          width: clamp(50px, 11vw, 60px);
          height: clamp(50px, 11vw, 60px);
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.15);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
          backdrop-filter: blur(10px);
          flex-shrink: 0;
        }

        @media (max-width: 768px) {
          .control-btn {
            width: 50px;
            height: 50px;
          }
        }

        @media (max-width: 480px) {
          .control-btn {
            width: 46px;
            height: 46px;
          }
        }

        @media (max-width: 380px) {
          .control-btn {
            width: 42px;
            height: 42px;
          }
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3);
        }

        .control-btn:active {
          transform: translateY(0);
        }

        .control-btn.active {
          background: rgba(239, 68, 68, 0.9);
          border-color: rgba(239, 68, 68, 1);
        }

        .control-btn.end-call {
          width: clamp(60px, 13vw, 72px);
          height: clamp(60px, 13vw, 72px);
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
          border: none;
          box-shadow: 0 8px 24px rgba(239, 68, 68, 0.4);
        }

        @media (max-width: 768px) {
          .control-btn.end-call {
            width: 58px;
            height: 58px;
          }
        }

        @media (max-width: 480px) {
          .control-btn.end-call {
            width: 54px;
            height: 54px;
          }
        }

        @media (max-width: 380px) {
          .control-btn.end-call {
            width: 50px;
            height: 50px;
          }
        }

        .control-btn.end-call:hover {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
          transform: scale(1.05);
        }

        @media (max-width: 768px) {
          .control-btn svg {
            width: 20px;
            height: 20px;
          }
          
          .control-btn.end-call svg {
            width: 24px;
            height: 24px;
          }
        }

        @media (max-width: 480px) {
          .control-btn svg {
            width: 18px;
            height: 18px;
          }
          
          .control-btn.end-call svg {
            width: 22px;
            height: 22px;
          }
        }

        @media (max-width: 380px) {
          .control-btn svg {
            width: 17px;
            height: 17px;
          }
          
          .control-btn.end-call svg {
            width: 20px;
            height: 20px;
          }
        }

        /* Call States */
        .call-state-overlay {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          text-align: center;
          z-index: 40;
        }

        .call-state-icon {
          width: clamp(100px, 20vw, 140px);
          height: clamp(100px, 20vw, 140px);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
          position: relative;
        }

        .call-state-icon.calling {
          background: rgba(59, 130, 246, 0.15);
          border: 3px solid rgba(59, 130, 246, 0.4);
          animation: pulse 2s infinite;
        }

        .call-state-icon.ended {
          background: rgba(239, 68, 68, 0.15);
          border: 3px solid rgba(239, 68, 68, 0.4);
        }

        .call-state-text {
          font-size: clamp(16px, 4vw, 20px);
          font-weight: 600;
          color: rgba(255, 255, 255, 0.9);
        }

        /* Play Button */
        .play-button {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: rgba(0, 0, 0, 0.9);
          padding: clamp(20px, 5vw, 32px) clamp(32px, 8vw, 56px);
          border-radius: 20px;
          border: 2px solid rgba(59, 130, 246, 0.5);
          cursor: pointer;
          z-index: 60;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .play-button:hover {
          background: rgba(0, 0, 0, 0.95);
          border-color: rgba(59, 130, 246, 0.8);
          transform: translate(-50%, -50%) scale(1.05);
        }

        .play-icon {
          width: clamp(60px, 12vw, 80px);
          height: clamp(60px, 12vw, 80px);
          border-radius: 50%;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
          box-shadow: 0 8px 24px rgba(59, 130, 246, 0.4);
        }

        .play-triangle {
          width: 0;
          height: 0;
          border-left: clamp(20px, 4vw, 28px) solid white;
          border-top: clamp(12px, 2.5vw, 18px) solid transparent;
          border-bottom: clamp(12px, 2.5vw, 18px) solid transparent;
          margin-left: clamp(4px, 1vw, 6px);
        }

        .play-text {
          font-size: clamp(14px, 3.5vw, 18px);
          font-weight: 600;
          color: white;
        }

        /* Animations */
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.05); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .fade-in {
          animation: fadeIn 0.4s ease;
        }

        /* Responsive adjustments */
        @media (max-width: 480px) {
          .header-meta {
            font-size: 11px;
          }
          
          .controls {
            max-width: 95vw;
          }
        }

        @media (max-width: 380px) {
          .controls {
            max-width: 98vw;
          }
        }



        .video-layout.grid-mode {
  display: grid;
  width: 100%;
  height: 100%;
}

/* Desktop → side by side */
@media (min-width: 769px) {
  .video-layout.grid-mode {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr;
  }
}

/* Mobile → top bottom split */
@media (max-width: 768px) {
  .video-layout.grid-mode {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
  }

  .video-layout.grid-mode .remote-video-container,
  .video-layout.grid-mode .local-video-container {
    position: relative !important;
    width: 100% !important;
    height: 100% !important;
    border-radius: 0 !important;
    bottom: auto !important;
    right: auto !important;
  }
}




        /* Swap videos when local is fullscreen */
.video-layout.local-full .local-video-container {
  position: absolute;
  top: 0;
  left: 0;
  width: 100% !important;
  height: 100% !important;
  border-radius: 0;
  z-index: 10;
}

.video-layout.local-full .remote-video-container {
  position: absolute;
  bottom: clamp(80px, 15vh, 140px);
  right: clamp(12px, 3vw, 30px);
  width: clamp(120px, 25vw, 280px);
  height: clamp(90px, 18vw, 200px);
  border-radius: clamp(12px, 2vw, 20px);
  overflow: hidden;
  border: 3px solid rgba(255,255,255,0.2);
  z-index: 50;
}


        /* Hide scrollbar */
        ::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Header */}
      <div className={`call-header ${!showControls && callState === "connected" ? "hidden" : ""}`}>
        <div className="header-content">
          <div className="header-info">
            <h2>
              {callState === "calling" ? `Calling ${targetUsername}...` : 
               callState === "connecting" ? `Connecting...` :
               callState === "connected" ? targetUsername : 
               callState === "ended" ? "Call Ended" : 'Video Call'}
            </h2>
            {callState === "connected" && (
              <div className="header-meta">
                <span className="duration-badge">{formatDuration(callDuration)}</span>
                <span className={`quality-badge ${connectionQuality}`}>
                  {connectionQuality === "good" ? <Wifi size={14} /> : <WifiOff size={14} />}
                  {connectionQuality === "good" ? "HD" : connectionQuality === "fair" ? "SD" : "Poor"}
                </span>
              </div>
            )}
          </div>
          <div className="header-actions">
          <button 
  onClick={() => setLayoutMode(m => m === "focus" ? "grid" : "focus")} 
  className="control-btn" 
  title="Split Screen"
>
  <Grid size={isMobile ? 18 : 20} color="#fff" />
</button>

            <button
  onClick={switchCamera}
  className="control-btn"
  title="Flip Camera"
>
  <RefreshCcw size={isMobile ? 20 : 22} color="#fff" />
</button>

            <button onClick={toggleFullscreen} className="control-btn" title="Fullscreen">
              {isFullscreen ? <Minimize size={20} color="#fff" /> : <Maximize size={20} color="#fff" />}
            </button>
          </div>
        </div>
      </div>

      {/* Video Layout */}
      <div className={`video-layout ${layoutMode === "grid" ? "grid-mode" : ""} ${isLocalFullscreen ? "local-full" : ""}`}>
        {/* Remote Video */}
        <div 
  className="remote-video-container"
  onClick={() => setIsLocalFullscreen(f => !f)}
>
          <video ref={remoteVideo} autoPlay playsInline className="remote-video" />
          
          {!hasRemoteStream && callState === "connected" && (
            <div className="video-placeholder fade-in">
              <div className="video-placeholder-icon">
                <User size={isMobile ? 32 : 40} color="rgba(59, 130, 246, 0.6)" />
              </div>
              <p>Waiting for {targetUsername}'s video...</p>
            </div>
          )}

          {showPlayButton && hasRemoteStream && (
            <div className="play-button fade-in" onClick={() => remoteVideo.current?.play().then(() => setShowPlayButton(false))}>
              <div className="play-icon">
                <div className="play-triangle" />
              </div>
              <p className="play-text">Tap to play video</p>
            </div>
          )}
        </div>

        {/* Local Video (PiP) */}
  <div
  ref={pipRef}
  className="local-video-container fade-in"
  onMouseDown={startDrag}
  onTouchStart={startDrag}
  style={
    layoutMode === "focus" && !isLocalFullscreen
      ? {
          position: "absolute",
          left: pipPosition.x || undefined,
          top: pipPosition.y || undefined
        }
      : {}
  }
>


          <video ref={localVideo} autoPlay muted playsInline className="local-video" />
          {isVideoOff && (
            <div className="video-placeholder">
              <div className="video-placeholder-icon">
                <VideoOff size={isMobile ? 24 : 32} color="rgba(255, 255, 255, 0.6)" />
              </div>
              <p style={{ fontSize: isMobile ? '12px' : '14px' }}>Camera Off</p>
            </div>
          )}
        </div>

        {/* Call State Overlays */}
        {(callState === "calling" || callState === "connecting") && (
          <div className="call-state-overlay fade-in">
            <div className="call-state-icon calling">
              <Phone size={isMobile ? 40 : 56} color="#3b82f6" />
            </div>
            <p className="call-state-text">
              {callState === "calling" ? `Calling ${targetUsername}...` : `Connecting...`}
            </p>
          </div>
        )}

        {callState === "ended" && (
          <div className="call-state-overlay fade-in">
            <div className="call-state-icon ended">
              <PhoneOff size={isMobile ? 40 : 56} color="#ef4444" />
            </div>
            <p className="call-state-text">Call Ended</p>
          </div>
        )}
      </div>

      {/* Controls */}
      {callState !== "ended" && (
        <div className={`controls-container ${!showControls && callState === "connected" ? "hidden" : ""}`}>
          <div className="controls">
            <button 
              onClick={toggleMute} 
              className={`control-btn ${isMuted ? 'active' : ''}`}
              title={isMuted ? "Unmute" : "Mute"}
            >
              {isMuted ? <MicOff size={isMobile ? 20 : 22} color="#fff" /> : <Mic size={isMobile ? 20 : 22} color="#fff" />}
            </button>

            <button 
              onClick={toggleVideo} 
              className={`control-btn ${isVideoOff ? 'active' : ''}`}
              title={isVideoOff ? "Turn on camera" : "Turn off camera"}
            >
              {isVideoOff ? <VideoOff size={isMobile ? 20 : 22} color="#fff" /> : <Video size={isMobile ? 20 : 22} color="#fff" />}
            </button>

            <button 
              onClick={endCall} 
              className="control-btn end-call"
              title="End call"
            >
              <PhoneOff size={isMobile ? 24 : 26} color="#fff" />
            </button>

            <button 
              onClick={toggleSpeaker} 
              className={`control-btn ${isSpeakerOff ? 'active' : ''}`}
              title={isSpeakerOff ? "Unmute speaker" : "Mute speaker"}
            >
              {isSpeakerOff ? <VolumeX size={isMobile ? 20 : 22} color="#fff" /> : <Volume2 size={isMobile ? 20 : 22} color="#fff" />}
            </button>

            <button 
              onClick={toggleScreenShare} 
              className={`control-btn ${isScreenSharing ? 'active' : ''}`}
              title={isScreenSharing ? "Stop sharing" : "Share screen"}
            >
              <Monitor size={isMobile ? 20 : 22} color="#fff" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}