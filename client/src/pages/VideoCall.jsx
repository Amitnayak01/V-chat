import React, { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCall } from "../CallContext";
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, Phone, 
  Monitor, Grid, Volume2, VolumeX, Maximize, Minimize
} from "lucide-react";

const configuration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
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
  const hasInitialized = useRef(false);

  // Call states
  const [callState, setCallState] = useState("idle");
  const [callDuration, setCallDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState("good");

  // Media controls
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // UI states
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [layoutMode, setLayoutMode] = useState("focus");

  // Function to go back to previous page
  const goBackToPreviousPage = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  // SOCKET EVENTS
  useEffect(() => {
    const handleCallAccepted = async ({ answer }) => {
      console.log("✅ Call accepted, setting remote description");
      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState("connected");
        startCallTimer();
      } catch (err) {
        console.error("Error setting remote description:", err);
      }
    };

    const handleCallDeclined = () => {
      console.log("❌ Call declined");
      alert("Call declined");
      cleanupAndRedirect();
    };

    const handleCallEnded = () => {
      console.log("📴 Call ended by remote user");
      cleanupAndRedirect();
    };

    const handleIceCandidate = async ({ candidate }) => {
      try {
        if (peerConnection.current && peerConnection.current.remoteDescription) {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error("Error adding ICE candidate:", err);
      }
    };

    socket.on("call-accepted", handleCallAccepted);
    socket.on("call-declined", handleCallDeclined);
    socket.on("call-ended", handleCallEnded);
    socket.on("ice-candidate", handleIceCandidate);

    return () => {
      socket.off("call-accepted", handleCallAccepted);
      socket.off("call-declined", handleCallDeclined);
      socket.off("call-ended", handleCallEnded);
      socket.off("ice-candidate", handleIceCandidate);
    };
  }, [socket]);

  // Call timer
  useEffect(() => {
    let interval;
    if (callState === "connected") {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callState]);

  const setupMedia = async (videoEnabled = true) => {
    try {
      console.log("🎥 Requesting media devices...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoEnabled ? { 
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user"
        } : false,
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      console.log("✅ Media devices accessed successfully");
      localStream.current = stream;
      if (localVideo.current) {
        localVideo.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error("❌ Error accessing media devices:", err);
      throw err;
    }
  };

  const createPeer = (stream, toUserId) => {
    console.log("🔗 Creating peer connection");
    peerConnection.current = new RTCPeerConnection(configuration);

    stream.getTracks().forEach(track => {
      peerConnection.current.addTrack(track, stream);
      console.log("➕ Added track:", track.kind);
    });

    peerConnection.current.ontrack = (event) => {
      console.log("📹 Received remote track:", event.streams[0]);
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
      }
    };

    peerConnection.current.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          toUserId,
          candidate: event.candidate
        });
      }
    };

    peerConnection.current.onconnectionstatechange = () => {
      const state = peerConnection.current.connectionState;
      console.log("Connection state:", state);
      
      if (state === "disconnected" || state === "failed") {
        setConnectionQuality("poor");
      } else if (state === "connected") {
        setConnectionQuality("good");
      }
    };
  };

  // AUTO CALL OR ACCEPT INCOMING CALL
  useEffect(() => {
    // Prevent double initialization
    if (hasInitialized.current) return;

    const initializeCall = async () => {
      console.log("🚀 Initializing call...", { isIncoming, targetUserId, targetUsername });
      
      if (isIncoming && incomingCall) {
        console.log("📞 Accepting incoming call");
        hasInitialized.current = true;
        await acceptIncomingCall();
      } else if (targetUserId && targetUsername && !isIncoming) {
        console.log("📞 Starting outgoing call");
        hasInitialized.current = true;
        await startCall();
      } else {
        console.log("⚠️ Missing required parameters for call initialization");
      }
    };

    initializeCall();
  }, []); // Empty dependency array - only run once on mount

  const startCall = async () => {
    try {
      console.log("📞 Starting outgoing call to:", targetUsername);
      setCallState("calling");
      
      const stream = await setupMedia();
      createPeer(stream, targetUserId);

      const offer = await peerConnection.current.createOffer();
      await peerConnection.current.setLocalDescription(offer);

      socket.emit("call-user", {
        toUserId: targetUserId,
        fromUserId: currentUserId,
        fromUsername: localStorage.getItem("username") || "Anonymous",
        offer
      });
    } catch (err) {
      console.error("❌ Error starting call:", err);
      alert("Failed to start call. Please check camera/microphone permissions.");
      setCallState("idle");
      goBackToPreviousPage();
    }
  };

  const acceptIncomingCall = async () => {
    if (!incomingCall) {
      console.error("❌ No incoming call data available");
      return;
    }

    try {
      console.log("✅ Accepting call from:", incomingCall.fromUsername);
      setCallState("connecting");
      
      const stream = await setupMedia();
      createPeer(stream, incomingCall.fromUserId);

      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      socket.emit("accept-call", {
        toUserId: incomingCall.fromUserId,
        fromUserId: currentUserId,
        answer
      });

      setCallState("connected");
      setIncomingCall(null); // Clear the incoming call from context
      startCallTimer();
    } catch (err) {
      console.error("❌ Error accepting call:", err);
      alert("Failed to accept call. Please check camera/microphone permissions.");
      goBackToPreviousPage();
    }
  };

  const cleanupAndRedirect = useCallback(() => {
    console.log("🧹 Cleaning up call resources");
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        track.stop();
        console.log("⏹️ Stopped track:", track.kind);
      });
      localStream.current = null;
    }
    
    navigate(-1);
  }, [navigate]);

  const endCall = useCallback(() => {
    console.log("📴 Ending call");
    
    // Close peer connection
    if (peerConnection.current) {
      peerConnection.current.close();
    }
    
    // Stop all media tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => track.stop());
    }

    // Emit end call event to server
    socket.emit("end-call", {
      toUserId: targetUserId,
      fromUserId: currentUserId
    });

    setCallState("ended");
    
    // Go back to previous page
    setTimeout(() => {
      goBackToPreviousPage();
    }, 1000);
  }, [targetUserId, currentUserId, goBackToPreviousPage, socket]);

  const toggleMute = () => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log("🎤 Mute toggled:", !audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        console.log("📹 Video toggled:", !videoTrack.enabled);
      }
    }
  };

  const toggleSpeaker = () => {
    if (remoteVideo.current) {
      remoteVideo.current.muted = !remoteVideo.current.muted;
      setIsSpeakerOff(remoteVideo.current.muted);
      console.log("🔊 Speaker toggled:", remoteVideo.current.muted);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false
        });

        const screenTrack = screenStream.getVideoTracks()[0];
        const sender = peerConnection.current.getSenders().find(s => 
          s.track && s.track.kind === "video"
        );

        if (sender) {
          sender.replaceTrack(screenTrack);
        }

        screenTrack.onended = () => {
          toggleScreenShare();
        };

        setIsScreenSharing(true);
      } else {
        const videoTrack = localStream.current.getVideoTracks()[0];
        const sender = peerConnection.current.getSenders().find(s => 
          s.track && s.track.kind === "video"
        );

        if (sender) {
          sender.replaceTrack(videoTrack);
        }

        setIsScreenSharing(false);
      }
    } catch (err) {
      console.error("Error toggling screen share:", err);
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

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const startCallTimer = () => {
    setCallDuration(0);
  };

  return (
    <div style={{
      margin: 0,
      padding: 0,
      height: '100vh',
      width: '100vw',
      background: 'linear-gradient(135deg, #0a0e27 0%, #1a1f3a 100%)',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflow: 'hidden',
      position: 'relative'
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
        }

        video {
          object-fit: cover;
          background: #000;
        }

        .control-btn {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 50%;
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.3s ease;
          backdrop-filter: blur(10px);
        }

        .control-btn:hover {
          background: rgba(255, 255, 255, 0.2);
          transform: translateY(-2px);
        }

        .control-btn.active {
          background: rgba(239, 68, 68, 0.9);
          border-color: rgba(239, 68, 68, 1);
        }

        .control-btn.end-call {
          background: rgba(239, 68, 68, 0.9);
          border-color: rgba(239, 68, 68, 1);
          width: 64px;
          height: 64px;
        }

        .control-btn.end-call:hover {
          background: rgba(220, 38, 38, 1);
          transform: scale(1.05);
        }

        .stats-badge {
          padding: 6px 12px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .stats-badge.good {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
          border: 1px solid rgba(34, 197, 94, 0.3);
        }

        .stats-badge.fair {
          background: rgba(251, 191, 36, 0.2);
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.3);
        }

        .stats-badge.poor {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .pulse {
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>

      {/* Header */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        padding: '20px 30px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, transparent 100%)',
        zIndex: 100
      }}>
        <div>
          <h2 style={{
            color: '#fff',
            fontSize: '24px',
            fontWeight: '600',
            margin: 0,
            marginBottom: '4px'
          }}>
            {callState === "calling" ? `Calling ${targetUsername}...` : 
             callState === "connecting" ? `Connecting with ${targetUsername}...` :
             callState === "connected" ? targetUsername : 
             callState === "ended" ? "Call Ended" :
             'Video Call'}
          </h2>
          {callState === "connected" && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <span style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '14px',
                fontWeight: '500'
              }}>
                {formatDuration(callDuration)}
              </span>
              <span className={`stats-badge ${connectionQuality}`}>
                {connectionQuality === "good" ? "HD" : 
                 connectionQuality === "fair" ? "SD" : "Poor"}
              </span>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setLayoutMode(m => m === "focus" ? "grid" : "focus")}
            className="control-btn"
            title="Change Layout"
          >
            <Grid size={22} color="#fff" />
          </button>
          <button
            onClick={toggleFullscreen}
            className="control-btn"
            title="Fullscreen"
          >
            {isFullscreen ? <Minimize size={22} color="#fff" /> : <Maximize size={22} color="#fff" />}
          </button>
        </div>
      </div>

      {/* Main Video Area */}
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative'
      }}>
        {/* Remote Video */}
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover'
          }}
        />

        {/* Local Video (PIP) */}
        <div style={{
          position: 'absolute',
          bottom: '120px',
          right: '30px',
          width: layoutMode === "grid" ? '45%' : '280px',
          height: layoutMode === "grid" ? '45%' : '200px',
          borderRadius: '16px',
          overflow: 'hidden',
          border: '3px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.5)',
          transition: 'all 0.3s ease',
          background: '#000'
        }}>
          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)'
            }}
          />
          {isVideoOff && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: '14px'
            }}>
              Camera Off
            </div>
          )}
        </div>

        {/* Calling State */}
        {(callState === "calling" || callState === "connecting") && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <div className="pulse" style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.2)',
              border: '3px solid rgba(59, 130, 246, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <Phone size={48} color="#3b82f6" />
            </div>
            <p style={{ color: '#fff', fontSize: '18px', fontWeight: '500' }}>
              {callState === "calling" ? `Calling ${targetUsername}...` : `Connecting with ${targetUsername}...`}
            </p>
          </div>
        )}

        {/* Call Ended State */}
        {callState === "ended" && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center'
          }}>
            <div style={{
              width: '120px',
              height: '120px',
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '3px solid rgba(239, 68, 68, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px'
            }}>
              <PhoneOff size={48} color="#ef4444" />
            </div>
            <p style={{ color: '#fff', fontSize: '18px', fontWeight: '500' }}>
              Call Ended
            </p>
            <p style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '14px', marginTop: '8px' }}>
              Redirecting...
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      {callState !== "ended" && (
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '16px',
          alignItems: 'center',
          padding: '16px 24px',
          background: 'rgba(15, 23, 42, 0.8)',
          borderRadius: '60px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)'
        }}>
          <button
            onClick={toggleMute}
            className={`control-btn ${isMuted ? 'active' : ''}`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff size={22} color="#fff" /> : <Mic size={22} color="#fff" />}
          </button>

          <button
            onClick={toggleSpeaker}
            className={`control-btn ${isSpeakerOff ? 'active' : ''}`}
            title={isSpeakerOff ? "Unmute Speaker" : "Mute Speaker"}
          >
            {isSpeakerOff ? <VolumeX size={22} color="#fff" /> : <Volume2 size={22} color="#fff" />}
          </button>
          
          <button
            onClick={endCall}
            className="control-btn end-call"
            title="End Call"
          >
            <PhoneOff size={26} color="#fff" />
          </button>

          <button
            onClick={toggleVideo}
            className={`control-btn ${isVideoOff ? 'active' : ''}`}
            title={isVideoOff ? "Turn On Camera" : "Turn Off Camera"}
          >
            {isVideoOff ? <VideoOff size={22} color="#fff" /> : <Video size={22} color="#fff" />}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`control-btn ${isScreenSharing ? 'active' : ''}`}
            title="Share Screen"
          >
            <Monitor size={22} color="#fff" />
          </button>
        </div>
      )}
    </div>
  );
}