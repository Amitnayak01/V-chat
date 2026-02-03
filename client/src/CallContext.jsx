import React, { createContext, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { socket } from "./socket";
import { Phone, UserPlus } from "lucide-react";

const CallContext = createContext();

export const useCall = () => useContext(CallContext);

export const CallProvider = ({ children }) => {
  const navigate = useNavigate();
  const [incomingCall, setIncomingCall] = useState(null);
  const [callInvitation, setCallInvitation] = useState(null);
  const currentUserId = localStorage.getItem("userId");

  /* 🔥 REGISTER USER ONLINE ASAP */
  useEffect(() => {
    if (!currentUserId) return;

    if (socket.connected) {
      console.log("🟢 Registering user online:", currentUserId);
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
      console.log("📞 INCOMING CALL RECEIVED from:", fromUsername, fromUserId);
      setIncomingCall({ fromUserId, fromUsername, offer });
    };

    const handleCallInvitation = ({ fromUserId, fromUsername, existingCallUserId, existingCallUsername }) => {
      console.log("📲 CALL INVITATION RECEIVED");
      console.log("   Invited by:", fromUsername, fromUserId);
      console.log("   Should call:", existingCallUsername, existingCallUserId);
      
      setCallInvitation({ 
        fromUserId,           // Person who invited you
        fromUsername,         // Their name
        existingCallUserId,   // Person you should call
        existingCallUsername  // Their name
      });
    };

    const handleCallEnded = () => {
      console.log("📴 Call ended → clearing state");
      setIncomingCall(null);
      setCallInvitation(null);
    };

    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-invitation", handleCallInvitation);
    socket.on("call-ended", handleCallEnded);

    return () => {
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-invitation", handleCallInvitation);
      socket.off("call-ended", handleCallEnded);
    };
  }, []);

  const acceptCall = () => {
    if (!incomingCall) {
      console.log("❌ No incoming call to accept");
      return;
    }
    
    console.log("✅ Accepting regular call from:", incomingCall.fromUsername);
    
    // Navigate to call page with incoming call data
    navigate(`/call?userId=${incomingCall.fromUserId}&username=${incomingCall.fromUsername}&incoming=true`);
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

  const acceptInvitation = () => {
    if (!callInvitation) {
      console.log("❌ No invitation to accept");
      return;
    }

    console.log("✅ ACCEPTING INVITATION");
    console.log("   I will call:", callInvitation.existingCallUsername);
    console.log("   User ID:", callInvitation.existingCallUserId);

    // CRITICAL: Call the person who is ALREADY in the call
    // NOT the person who invited you!
    const url = `/call?userId=${callInvitation.existingCallUserId}&username=${callInvitation.existingCallUsername}&incoming=false`;
    console.log("🔄 Navigating to:", url);
    
    navigate(url);
    
    // Clear invitation
    setTimeout(() => {
      setCallInvitation(null);
    }, 500);
  };

  const declineInvitation = () => {
    if (!callInvitation) return;

    console.log("❌ Declining call invitation");
    setCallInvitation(null);
  };

  return (
    <CallContext.Provider value={{ socket, incomingCall, setIncomingCall }}>
      {children}

      {/* Regular Incoming Call Modal */}
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

      {/* Call Invitation Modal */}
      {callInvitation && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={iconContainerStyle}>
              <UserPlus size={50} color="#3b82f6" />
            </div>
            <h2 style={titleStyle}>Join Call?</h2>
            <p style={textStyle}>
              <strong>{callInvitation.fromUsername}</strong> invited you to join their call with <strong>{callInvitation.existingCallUsername}</strong>
            </p>
            <div style={buttonContainerStyle}>
              <button onClick={acceptInvitation} style={acceptButtonStyle}>
                Join Call
              </button>
              <button onClick={declineInvitation} style={declineButtonStyle}>
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
  maxWidth: "450px",
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
  color: "rgba(255, 255, 255, 0.8)",
  marginBottom: "30px",
  lineHeight: "1.6",
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