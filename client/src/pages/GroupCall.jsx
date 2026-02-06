import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useCall } from "../CallContext";
import { Mic, MicOff, Video, VideoOff, PhoneOff, UserPlus, X } from "lucide-react";

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ],
  iceCandidatePoolSize: 10
};

export default function GroupCall() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { socket, onlineUsers } = useCall();
  
  const currentUserId = localStorage.getItem("userId");
  const currentUsername = localStorage.getItem("username") || "User";

  // Refs
  const localVideo = useRef();
  const localStream = useRef();
  const peerConnections = useRef(new Map()); // userId -> RTCPeerConnection
  const remoteVideos = useRef(new Map()); // userId -> video element
  const [usernames, setUsernames] = useState(new Map()); // userId -> username

  // States
  const [participants, setParticipants] = useState([currentUserId]);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState([]);

  // Setup Media
  const setupMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      localStream.current = stream;
      if (localVideo.current) localVideo.current.srcObject = stream;
      return stream;
    } catch (err) {
      console.error("Media error:", err);
      alert("Failed to access camera/microphone");
    }
  };

  // Create Peer Connection
  const createPeerConnection = useCallback((userId) => {
    if (peerConnections.current.has(userId)) {
      return peerConnections.current.get(userId);
    }

    const pc = new RTCPeerConnection(ICE_CONFIG);

    // Add local stream tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log("📹 Received track from:", userId);
      const remoteStream = event.streams[0];
      
      if (remoteVideos.current.has(userId)) {
        const videoEl = remoteVideos.current.get(userId);
        if (videoEl) videoEl.srcObject = remoteStream;
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("group-ice-candidate", {
          roomId,
          toUserId: userId,
          fromUserId: currentUserId,
          candidate: event.candidate
        });
      }
    };

    peerConnections.current.set(userId, pc);
    return pc;
  }, [roomId, currentUserId, socket]);

  // Initialize call
  useEffect(() => {
    const init = async () => {
      await setupMedia();
      
      // Create room
      socket.emit("create-group-call", {
        roomId,
        creatorId: currentUserId
      });

      socket.emit("group-call-accepted", {
        roomId,
        userId: currentUserId,
        username: currentUsername
      });
    };

    init();
  }, []);

  // Socket Events
  useEffect(() => {
    // User joined
   socket.on("user-joined-group-call", async ({ userId, username, participants: newParticipants }) => {
  console.log(`✅ ${username} joined group call`);
  
  // Store username
  setUsernames(prev => new Map(prev).set(userId, username));
  
  setParticipants(prev => {
    if (!prev.includes(userId)) {
      return [...prev, userId];
    }
    return prev;
  });

      // Create offer for new user
      const pc = createPeerConnection(userId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit("group-call-offer", {
        roomId,
        toUserId: userId,
        fromUserId: currentUserId,
        offer
      });
    });

    // Received offer
    socket.on("group-call-offer-received", async ({ fromUserId, offer }) => {
      console.log("📥 Received offer from:", fromUserId);
      
      const pc = createPeerConnection(fromUserId);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit("group-call-answer", {
        roomId,
        toUserId: fromUserId,
        fromUserId: currentUserId,
        answer
      });
    });

    // Received answer
    socket.on("group-call-answer-received", async ({ fromUserId, answer }) => {
      console.log("📥 Received answer from:", fromUserId);
      
      const pc = peerConnections.current.get(fromUserId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    // ICE candidate
    socket.on("group-ice-candidate-received", async ({ fromUserId, candidate }) => {
      const pc = peerConnections.current.get(fromUserId);
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    // User left
    socket.on("user-left-group-call", ({ userId, participants: newParticipants }) => {
      console.log("📴 User left:", userId);
      
      setParticipants(newParticipants);
      
      const pc = peerConnections.current.get(userId);
      if (pc) {
        pc.close();
        peerConnections.current.delete(userId);
      }
      
      remoteVideos.current.delete(userId);
    });

    // Current participants
    socket.on("group-call-participants", ({ participants: existingParticipants }) => {
      console.log("📋 Existing participants:", existingParticipants);
      setParticipants(existingParticipants);
    });

    return () => {
      socket.off("user-joined-group-call");
      socket.off("group-call-offer-received");
      socket.off("group-call-answer-received");
      socket.off("group-ice-candidate-received");
      socket.off("user-left-group-call");
      socket.off("group-call-participants");
    };
  }, [createPeerConnection, roomId, currentUserId, socket]);

  // Cleanup
  const leaveCall = useCallback(() => {
    socket.emit("leave-group-call", { roomId, userId: currentUserId });
    
    peerConnections.current.forEach(pc => pc.close());
    localStream.current?.getTracks().forEach(t => t.stop());
    
    navigate(-1);
  }, [roomId, currentUserId, navigate, socket]);

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

  // Add Participants
  const openAddModal = () => {
    setShowAddModal(true);
    setSelectedUsers([]);
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const sendInvites = () => {
    if (selectedUsers.length === 0) return;

    socket.emit("group-call-invite", {
      roomId,
      from: currentUserId,
      fromUsername: currentUsername,
      toUsers: selectedUsers
    });

    alert(`Invites sent to ${selectedUsers.length} user(s)`);
    setShowAddModal(false);
    setSelectedUsers([]);
  };

  // Available users (online but not in call)
  const availableUsers = onlineUsers.filter(
    id => id !== currentUserId && !participants.includes(id)
  );

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2>Group Call</h2>
        <span>{participants.length} participants</span>
      </div>

      <div style={videoGridStyle}>
        {/* Local Video */}
        <div style={videoBoxStyle}>
          <video ref={localVideo} autoPlay muted playsInline style={videoStyle} />
          <div style={labelStyle}>You</div>
        </div>

        {/* Remote Videos */}
        {participants
          .filter(id => id !== currentUserId)
          .map(userId => (
            <div key={userId} style={videoBoxStyle}>
              <video
                ref={el => {
                  if (el) remoteVideos.current.set(userId, el);
                }}
                autoPlay
                playsInline
                style={videoStyle}
              />
              <div style={labelStyle}>{usernames.get(userId) || `User ${userId.slice(0, 6)}`}</div>
            </div>
          ))}
      </div>

      {/* Controls */}
      <div style={controlsStyle}>
        <button onClick={toggleMute} style={isMuted ? activeButtonStyle : buttonStyle}>
          {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
        </button>

        <button onClick={toggleVideo} style={isVideoOff ? activeButtonStyle : buttonStyle}>
          {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
        </button>

        <button onClick={openAddModal} style={buttonStyle}>
          <UserPlus size={20} />
        </button>

        <button onClick={leaveCall} style={endCallButtonStyle}>
          <PhoneOff size={20} />
        </button>
      </div>

      {/* Add Participants Modal */}
      {showAddModal && (
        <div style={modalOverlayStyle} onClick={() => setShowAddModal(false)}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h3>Add Participants</h3>
              <button onClick={() => setShowAddModal(false)} style={closeButtonStyle}>
                <X size={20} />
              </button>
            </div>

            <div style={userListStyle}>
             {availableUsers.length === 0 ? (
  <p style={emptyTextStyle}>No available users</p>
) : (
  availableUsers.map(userId => (
    <label key={userId} style={userItemStyle}>
      <input
        type="checkbox"
        checked={selectedUsers.includes(userId)}
        onChange={() => toggleUserSelection(userId)}
        style={{ cursor: 'pointer' }}
      />
      <span style={{ cursor: 'pointer' }}>User {userId.slice(0, 8)}</span>
    </label>
  ))
)}
            </div>

            <button
              onClick={sendInvites}
              disabled={selectedUsers.length === 0}
              style={selectedUsers.length > 0 ? sendButtonStyle : disabledButtonStyle}
            >
              Send Invites ({selectedUsers.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
const containerStyle = {
  width: "100vw",
  height: "100vh",
  background: "#0f172a",
  display: "flex",
  flexDirection: "column",
  color: "white"
};

const headerStyle = {
  padding: "20px",
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center"
};

const videoGridStyle = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: "10px",
  padding: "10px",
  overflow: "auto"
};

const videoBoxStyle = {
  position: "relative",
  background: "#000",
  borderRadius: "10px",
  overflow: "hidden",
  aspectRatio: "16/9"
};

const videoStyle = {
  width: "100%",
  height: "100%",
  objectFit: "cover"
};

const labelStyle = {
  position: "absolute",
  bottom: "10px",
  left: "10px",
  background: "rgba(0,0,0,0.7)",
  padding: "5px 10px",
  borderRadius: "5px",
  fontSize: "14px"
};

const controlsStyle = {
  padding: "20px",
  display: "flex",
  justifyContent: "center",
  gap: "15px",
  background: "rgba(0,0,0,0.5)"
};

const buttonStyle = {
  width: "50px",
  height: "50px",
  borderRadius: "50%",
  background: "rgba(255,255,255,0.1)",
  border: "none",
  color: "white",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center"
};

const activeButtonStyle = {
  ...buttonStyle,
  background: "#ef4444"
};

const endCallButtonStyle = {
  ...buttonStyle,
  background: "#ef4444",
  width: "60px",
  height: "60px"
};

const modalOverlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.9)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999
};

const modalContentStyle = {
  background: "#1e293b",
  borderRadius: "15px",
  padding: "20px",
  width: "400px",
  maxWidth: "90vw"
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "20px"
};

const closeButtonStyle = {
  background: "none",
  border: "none",
  color: "white",
  cursor: "pointer"
};

const userListStyle = {
  maxHeight: "300px",
  overflowY: "auto",
  marginBottom: "20px"
};
const userItemStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "10px",
  cursor: "pointer",
  borderRadius: "5px",
  marginBottom: "5px",
  background: "rgba(255,255,255,0.05)",
  transition: "background 0.2s ease",
  userSelect: "none"
};

const userItemHoverStyle = {
  background: "rgba(255,255,255,0.1)"
};
const emptyTextStyle = {
  textAlign: "center",
  color: "rgba(255,255,255,0.5)",
  padding: "20px"
};

const sendButtonStyle = {
  width: "100%",
  padding: "12px",
  background: "#3b82f6",
  color: "white",
  border: "none",
  borderRadius: "8px",
  cursor: "pointer",
  fontWeight: "600"
};

const disabledButtonStyle = {
  ...sendButtonStyle,
  background: "#475569",
  cursor: "not-allowed"
};