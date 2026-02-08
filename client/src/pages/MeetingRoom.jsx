import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMeeting } from "../context/MeetingContext";
import VideoGrid from "../components/meeting/VideoGrid";
import MeetingControls from "../components/meeting/MeetingControls";
import ChatSidebar from "../components/meeting/ChatSidebar";
import ParticipantsList from "../components/meeting/ParticipantsList";

export default function MeetingRoom() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const {
    localStream,
    remoteStreams,
    participants,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    isRecording,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    toggleRecording,
    leaveMeeting,
    joinRoom,
    error
  } = useMeeting();

  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!roomId) {
      navigate("/");
      return;
    }

    // Join the meeting room
    joinRoom(roomId);

    // Cleanup on unmount
    return () => {
      leaveMeeting();
    };
  }, [roomId]);

  const handleLeaveMeeting = () => {
    leaveMeeting();
    navigate("/");
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  if (error) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#1e1e1e",
        color: "white",
        flexDirection: "column",
        gap: "20px"
      }}>
        <div style={{
          fontSize: "48px"
        }}>⚠️</div>
        <h2>Meeting Error</h2>
        <p style={{ color: "#ff4444" }}>{error}</p>
        <button
          onClick={() => navigate("/")}
          style={{
            background: "#2196F3",
            color: "white",
            padding: "12px 24px",
            borderRadius: "5px",
            border: "none",
            cursor: "pointer",
            fontWeight: "500"
          }}
        >
          Return Home
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        display: "flex",
        height: "100vh",
        background: "#1e1e1e",
        color: "white",
        overflow: "hidden"
      }}
    >
      {/* Main Video Area */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        position: "relative"
      }}>
        {/* Header */}
        <div style={{
          padding: "15px 20px",
          background: "rgba(0,0,0,0.5)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255,255,255,0.1)"
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "16px" }}>Meeting Room</h3>
            <p style={{ margin: "5px 0 0 0", fontSize: "12px", color: "#888" }}>
              Room ID: {roomId}
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {isRecording && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                background: "rgba(255,0,0,0.2)",
                padding: "6px 12px",
                borderRadius: "20px",
                border: "1px solid #ff0000"
              }}>
                <div style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#ff0000",
                  animation: "pulse 1.5s infinite"
                }} />
                <span style={{ fontSize: "12px" }}>Recording</span>
              </div>
            )}
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              style={{
                background: showParticipants ? "#2196F3" : "rgba(255,255,255,0.1)",
                color: "white",
                padding: "8px 16px",
                borderRadius: "5px",
                border: "none",
                cursor: "pointer",
                fontSize: "14px",
                display: "flex",
                alignItems: "center",
                gap: "5px"
              }}
            >
              👥 {participants.length}
            </button>
            <button
              onClick={handleToggleFullscreen}
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "white",
                padding: "8px 12px",
                borderRadius: "5px",
                border: "none",
                cursor: "pointer",
                fontSize: "18px"
              }}
              title="Toggle Fullscreen"
            >
              {isFullscreen ? "⛶" : "⛶"}
            </button>
          </div>
        </div>

        {/* Video Grid */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            participants={participants}
            isScreenSharing={isScreenSharing}
          />
        </div>

        {/* Meeting Controls */}
        <MeetingControls
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          isScreenSharing={isScreenSharing}
          isRecording={isRecording}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleScreenShare={toggleScreenShare}
          onToggleRecording={toggleRecording}
          onToggleChat={() => setShowChat(!showChat)}
          onLeaveMeeting={handleLeaveMeeting}
          showChat={showChat}
        />
      </div>

      {/* Chat Sidebar */}
      {showChat && (
        <ChatSidebar
          roomId={roomId}
          onClose={() => setShowChat(false)}
        />
      )}

      {/* Participants Sidebar */}
      {showParticipants && (
        <ParticipantsList
          participants={participants}
          onClose={() => setShowParticipants(false)}
        />
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}