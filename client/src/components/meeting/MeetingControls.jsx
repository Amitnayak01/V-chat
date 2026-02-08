import React from "react";

export default function MeetingControls({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  isRecording,
  onToggleAudio,
  onToggleVideo,
  onToggleScreenShare,
  onToggleRecording,
  onToggleChat,
  onLeaveMeeting,
  showChat
}) {
  const controlButtonStyle = (isActive) => ({
    background: isActive ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)",
    color: "white",
    padding: "15px",
    borderRadius: "50%",
    border: "none",
    cursor: "pointer",
    fontSize: "24px",
    width: "60px",
    height: "60px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s"
  });
  
  const dangerButtonStyle = {
    background: "#ff4444",
    color: "white",
    padding: "15px 30px",
    borderRadius: "30px",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "600",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.2s"
  };
  
  return (
    <div
      style={{
        padding: "20px",
        background: "rgba(0,0,0,0.8)",
        borderTop: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "15px",
        flexWrap: "wrap"
      }}
    >
      {/* Microphone */}
      <button
        onClick={onToggleAudio}
        style={controlButtonStyle(isAudioEnabled)}
        title={isAudioEnabled ? "Mute" : "Unmute"}
        onMouseEnter={(e) => {
          e.target.style.background = isAudioEnabled 
            ? "rgba(255,255,255,0.3)" 
            : "rgba(255,68,68,0.8)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = isAudioEnabled 
            ? "rgba(255,255,255,0.2)" 
            : "rgba(255,255,255,0.1)";
        }}
      >
        {isAudioEnabled ? "🎤" : "🔇"}
      </button>
      
      {/* Camera */}
      <button
        onClick={onToggleVideo}
        style={controlButtonStyle(isVideoEnabled)}
        title={isVideoEnabled ? "Stop Video" : "Start Video"}
        onMouseEnter={(e) => {
          e.target.style.background = isVideoEnabled 
            ? "rgba(255,255,255,0.3)" 
            : "rgba(255,68,68,0.8)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = isVideoEnabled 
            ? "rgba(255,255,255,0.2)" 
            : "rgba(255,255,255,0.1)";
        }}
      >
        {isVideoEnabled ? "📹" : "📴"}
      </button>
      
      {/* Screen Share */}
      <button
        onClick={onToggleScreenShare}
        style={controlButtonStyle(isScreenSharing)}
        title={isScreenSharing ? "Stop Sharing" : "Share Screen"}
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(255,255,255,0.3)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = isScreenSharing 
            ? "rgba(255,255,255,0.2)" 
            : "rgba(255,255,255,0.1)";
        }}
      >
        {isScreenSharing ? "🖥️" : "📺"}
      </button>
      
      {/* Recording */}
      <button
        onClick={onToggleRecording}
        style={controlButtonStyle(isRecording)}
        title={isRecording ? "Stop Recording" : "Start Recording"}
        onMouseEnter={(e) => {
          e.target.style.background = isRecording 
            ? "rgba(255,68,68,0.8)" 
            : "rgba(255,255,255,0.3)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = isRecording 
            ? "rgba(255,255,255,0.2)" 
            : "rgba(255,255,255,0.1)";
        }}
      >
        {isRecording ? "⏹️" : "⏺️"}
      </button>
      
      {/* Chat */}
      <button
        onClick={onToggleChat}
        style={controlButtonStyle(showChat)}
        title="Toggle Chat"
        onMouseEnter={(e) => {
          e.target.style.background = "rgba(255,255,255,0.3)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = showChat 
            ? "rgba(255,255,255,0.2)" 
            : "rgba(255,255,255,0.1)";
        }}
      >
        💬
      </button>
      
      {/* Leave Meeting */}
      <button
        onClick={onLeaveMeeting}
        style={dangerButtonStyle}
        title="Leave Meeting"
        onMouseEnter={(e) => {
          e.target.style.background = "#cc0000";
          e.target.style.transform = "scale(1.05)";
        }}
        onMouseLeave={(e) => {
          e.target.style.background = "#ff4444";
          e.target.style.transform = "scale(1)";
        }}
      >
        📞 Leave
      </button>
    </div>
  );
}