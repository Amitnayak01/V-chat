import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "./socket";
import { Phone } from "lucide-react";

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);
  const [incomingGroupInvite, setIncomingGroupInvite] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const currentUserId = localStorage.getItem("userId");

  /* 🔥 REGISTER USER ONLINE ASAP */
  useEffect(() => {
    if (!currentUserId) return;

    if (socket.connected) {
      socket.emit("user-online", currentUserId);
    }

    socket.on("connect", () => {
      console.log("🟢 Socket connected:", socket.id);
      socket.emit("user-online", currentUserId);
    });

    return () => {
      socket.off("connect");
    };
  }, [currentUserId]);

  /* 🚨 ATTACH CALL LISTENER ONCE */
  useEffect(() => {
    const handleIncomingCall = ({ fromUserId, fromUsername, offer }) => {
      console.log("📞 CALL RECEIVED:", fromUsername);
      setIncomingCall({ fromUserId, fromUsername, offer });
    };

    const handleCallEnded = () => {
      console.log("📴 Call ended → clearing incomingCall state");
      setIncomingCall(null);
    };
     

    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-ended", handleCallEnded);

    const handleIncomingGroupInvite = ({ roomId, from, fromUsername }) => {
  console.log("📧 GROUP INVITE RECEIVED from:", fromUsername);
  setIncomingGroupInvite({ roomId, from, fromUsername });
};

const handleGroupInviteDeclined = ({ userId }) => {
  console.log("❌ Group invite declined by:", userId);
};

socket.on("incoming-group-invite", handleIncomingGroupInvite);
socket.on("group-invite-declined", handleGroupInviteDeclined);
socket.on("online-users", (users) => {
  console.log("👥 Online users updated:", users);
  setOnlineUsers(users);
});

return () => {
  socket.off("incoming-call", handleIncomingCall);
  socket.off("call-ended", handleCallEnded);
  socket.off("incoming-group-invite", handleIncomingGroupInvite);
  socket.off("group-invite-declined", handleGroupInviteDeclined);
  socket.off("online-users");
};
  }, []);

  const acceptCall = () => {
    if (!incomingCall) return;
    
    console.log("✅ Accepting call from:", incomingCall.fromUsername);
    
    // Navigate to call page with incoming call data
    navigate(`/call?userId=${incomingCall.fromUserId}&username=${incomingCall.fromUsername}&incoming=true`);
    
    // Don't clear incomingCall immediately - let VideoCall component access it
    // It will be cleared by VideoCall after processing
  };

  const declineCall = () => {
    if (!incomingCall) return;
    
    console.log("❌ Declining call from:", incomingCall.fromUsername);
    
    socket.emit("decline-call", { 
      toUserId: incomingCall.fromUserId,
      fromUserId: currentUserId 
    });
    
    setIncomingCall(null);
  };


  const acceptGroupInvite = () => {
  if (!incomingGroupInvite) return;
  
  console.log("✅ Accepting group call invite");
  
  socket.emit("group-call-accepted", {
    roomId: incomingGroupInvite.roomId,
    userId: currentUserId,
    username: localStorage.getItem("username") || "User"
  });
  
  navigate(`/group-call/${incomingGroupInvite.roomId}`);
  setIncomingGroupInvite(null);
};

const declineGroupInvite = () => {
  if (!incomingGroupInvite) return;
  
  console.log("❌ Declining group call invite");
  
  socket.emit("group-call-declined", {
    roomId: incomingGroupInvite.roomId,
    from: incomingGroupInvite.from,
    userId: currentUserId
  });
  
  setIncomingGroupInvite(null);
};









  return (
    <CallContext.Provider value={{ 
      socket,
      incomingCall, 
      setIncomingCall, 
      incomingGroupInvite,
      setIncomingGroupInvite,
       acceptGroupInvite, 
       declineGroupInvite,
       onlineUsers

       }}>
      {children}

      {incomingCall && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={iconContainerStyle}>
              <Phone size={50} color="#22c55e" />
            </div>
            <h2 style={titleStyle}>Incoming Call</h2>
            <p style={textStyle}>{incomingCall.fromUsername} is calling...</p>
            <div style={buttonContainerStyle}>
              <button onClick={acceptCall} style={acceptButtonStyle}>
                Accept
              </button>
              <button onClick={declineCall} style={declineButtonStyle}>
                Decline
              </button>
            </div>
          </div>
        </div>
      )}



      {incomingGroupInvite && (
  <div style={overlayStyle}>
    <div style={modalStyle}>
      <div style={iconContainerStyle}>
        <Phone size={50} color="#3b82f6" />
      </div>
      <h2 style={titleStyle}>Group Call Invite</h2>
      <p style={textStyle}>{incomingGroupInvite.fromUsername} invited you to a group video call</p>
      <div style={buttonContainerStyle}>
        <button onClick={acceptGroupInvite} style={{...acceptButtonStyle, background: "#3b82f6"}}>
          Join Call
        </button>
        <button onClick={declineGroupInvite} style={declineButtonStyle}>
          Decline
        </button>
      </div>
    </div>
  </div>
)}
    </CallContext.Provider>
  );
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.9)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 9999,
  backdropFilter: "blur(10px)",
};

const modalStyle = {
  background: "linear-gradient(135deg, #1a1f3a 0%, #0a0e27 100%)",
  padding: "40px",
  borderRadius: "20px",
  color: "white",
  textAlign: "center",
  minWidth: "320px",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)",
};

const iconContainerStyle = {
  marginBottom: "20px",
  animation: "pulse 2s infinite",
};

const titleStyle = {
  fontSize: "24px",
  fontWeight: "600",
  marginBottom: "10px",
  color: "#fff",
};

const textStyle = {
  fontSize: "16px",
  color: "rgba(255, 255, 255, 0.7)",
  marginBottom: "30px",
};

const buttonContainerStyle = {
  display: "flex",
  gap: "12px",
  justifyContent: "center",
};

const acceptButtonStyle = {
  background: "#22c55e",
  color: "white",
  border: "none",
  borderRadius: "50px",
  padding: "12px 32px",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.3s ease",
};

const declineButtonStyle = {
  background: "#ef4444",
  color: "white",
  border: "none",
  borderRadius: "50px",
  padding: "12px 32px",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.3s ease",
};