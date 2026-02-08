import React, { useEffect, useRef, useState } from "react";

export default function VideoTile({ stream, username, isLocal, isMuted, isScreenSharing }) {
  const videoRef = useRef(null);
  const [isVideoActive, setIsVideoActive] = useState(true);
  
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      
      // Check if video track is active
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        setIsVideoActive(videoTrack.enabled);
        
        // Listen for track changes
        videoTrack.onended = () => setIsVideoActive(false);
        videoTrack.onmute = () => setIsVideoActive(false);
        videoTrack.onunmute = () => setIsVideoActive(true);
      }
    }
  }, [stream]);
  
  return (
    <div
      style={{
        position: "relative",
        background: "#1a1a1a",
        borderRadius: "10px",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "2px solid rgba(255,255,255,0.1)",
        minHeight: "200px"
      }}
    >
      {/* Video Element */}
      {isVideoActive ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isMuted}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: isLocal && !isScreenSharing ? "scaleX(-1)" : "none"
          }}
        />
      ) : (
        // Avatar when video is off
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          }}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              borderRadius: "50%",
              background: "rgba(255,255,255,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "36px",
              fontWeight: "bold",
              color: "white"
            }}
          >
            {username.charAt(0).toUpperCase()}
          </div>
        </div>
      )}
      
      {/* Username Label */}
      <div
        style={{
          position: "absolute",
          bottom: "10px",
          left: "10px",
          background: "rgba(0,0,0,0.7)",
          color: "white",
          padding: "6px 12px",
          borderRadius: "5px",
          fontSize: "14px",
          fontWeight: "500",
          display: "flex",
          alignItems: "center",
          gap: "8px"
        }}
      >
        {!isVideoActive && (
          <span style={{ fontSize: "16px" }}>📹</span>
        )}
        {username}
        {isLocal && (
          <span style={{
            background: "#2196F3",
            padding: "2px 6px",
            borderRadius: "3px",
            fontSize: "10px"
          }}>
            YOU
          </span>
        )}
      </div>
      
      {/* Screen Sharing Indicator */}
      {isScreenSharing && (
        <div
          style={{
            position: "absolute",
            top: "10px",
            right: "10px",
            background: "rgba(0,0,0,0.7)",
            color: "white",
            padding: "6px 12px",
            borderRadius: "5px",
            fontSize: "12px",
            fontWeight: "500",
            display: "flex",
            alignItems: "center",
            gap: "5px"
          }}
        >
          🖥️ Screen Sharing
        </div>
      )}
    </div>
  );
}