import React, { useEffect, useRef } from "react";
import VideoTile from "./VideoTile";

export default function VideoGrid({ localStream, remoteStreams, participants, isScreenSharing }) {
  const gridRef = useRef(null);
  
  // Calculate grid layout based on number of participants
  const getGridLayout = () => {
    const totalParticipants = Object.keys(remoteStreams).length + 1; // +1 for local
    
    if (totalParticipants === 1) return { cols: 1, rows: 1 };
    if (totalParticipants === 2) return { cols: 2, rows: 1 };
    if (totalParticipants <= 4) return { cols: 2, rows: 2 };
    if (totalParticipants <= 6) return { cols: 3, rows: 2 };
    if (totalParticipants <= 9) return { cols: 3, rows: 3 };
    return { cols: 4, rows: Math.ceil(totalParticipants / 4) };
  };
  
  const layout = getGridLayout();
  
  return (
    <div
      ref={gridRef}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
        gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
        gap: "10px",
        padding: "10px",
        height: "100%",
        width: "100%",
        background: "#0a0a0a"
      }}
    >
      {/* Local Video */}
      <VideoTile
        stream={localStream}
        username="You"
        isLocal={true}
        isMuted={true}
        isScreenSharing={isScreenSharing}
      />
      
      {/* Remote Videos */}
      {Object.entries(remoteStreams).map(([userId, stream]) => {
        const participant = participants.find(p => p.userId === userId);
        return (
          <VideoTile
            key={userId}
            stream={stream}
            username={participant?.username || "Unknown"}
            isLocal={false}
            isMuted={false}
          />
        );
      })}
    </div>
  );
}