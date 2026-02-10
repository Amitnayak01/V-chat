import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useCall } from "../CallContext";
import { Mic, MicOff, Video, VideoOff, PhoneOff, UserPlus } from "lucide-react";

export default function VideoCall() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { socket, incomingCall, setIncomingCall } = useCall();

  const targetUserId = params.get("userId");
  const targetUsername = params.get("username");
  const isIncoming = params.get("incoming") === "true";
  const currentUserId = localStorage.getItem("userId");

  const localVideo = useRef();
  const remoteVideo = useRef();
  const peerConnection = useRef();
  const localStream = useRef();

  const [callState, setCallState] = useState("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);

  /* 🔥 ADD TO CALL STATES */
  const [showAddPopup, setShowAddPopup] = useState(false);
  const [users, setUsers] = useState([]);

  const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  /* ================= GET USERS ================= */
  useEffect(() => {
    socket.emit("get-online-users");
    socket.on("online-users", (list) => {
      setUsers(list);
    });
    return () => socket.off("online-users");
  }, [socket]);

  /* ================= MEDIA ================= */
  const setupMedia = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localStream.current = stream;
    localVideo.current.srcObject = stream;
    return stream;
  };

  /* ================= PEER ================= */
  const createPeer = (stream, toUserId) => {
    const pc = new RTCPeerConnection(ICE);

    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    pc.ontrack = e => {
      remoteVideo.current.srcObject = e.streams[0];
    };

    pc.onicecandidate = e => {
      if (e.candidate) {
        socket.emit("ice-candidate", { toUserId, candidate: e.candidate });
      }
    };

    peerConnection.current = pc;
    return pc;
  };

  /* ================= START CALL ================= */
  const startCall = async () => {
    setCallState("calling");
    const stream = await setupMedia();
    createPeer(stream, targetUserId);

    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);

    socket.emit("call-user", {
      toUserId: targetUserId,
      fromUserId: currentUserId,
      fromUsername: localStorage.getItem("username"),
      offer
    });
  };

  /* ================= ACCEPT CALL ================= */
  const acceptCall = async () => {
    if (!incomingCall) return;

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

    setIncomingCall(null);
    setCallState("connected");
  };

  /* ================= SOCKET EVENTS ================= */
  useEffect(() => {
    socket.on("call-accepted", async ({ answer }) => {
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      setCallState("connected");
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (peerConnection.current) {
        await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on("call-ended", () => {
      cleanup();
    });

    return () => {
      socket.off("call-accepted");
      socket.off("ice-candidate");
      socket.off("call-ended");
    };
  }, [socket]);

  /* ================= INIT ================= */
  useEffect(() => {
    if (isIncoming && incomingCall) acceptCall();
    else if (targetUserId && !isIncoming) startCall();
  }, []);

  /* ================= CLEANUP ================= */
  const cleanup = () => {
    peerConnection.current?.close();
    localStream.current?.getTracks().forEach(t => t.stop());
    navigate(-1);
  };

  /* ================= CONTROLS ================= */
  const toggleMute = () => {
    const track = localStream.current.getAudioTracks()[0];
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  };

  const toggleVideo = () => {
    const track = localStream.current.getVideoTracks()[0];
    track.enabled = !track.enabled;
    setIsVideoOff(!track.enabled);
  };

  const endCall = () => {
    socket.emit("end-call");
    cleanup();
  };

  /* ================= ADD PARTICIPANT ================= */
  const inviteUser = (userId) => {
    socket.emit("invite-to-call", {
      toUserId: userId,
      roomId: window.currentRoomId,
      fromUserId: currentUserId,
      fromUsername: localStorage.getItem("username")
    });
    setShowAddPopup(false);
  };

  /* ================= UI ================= */
  return (
    <div className="call-container">
      <video ref={remoteVideo} autoPlay playsInline className="remote" />
      <video ref={localVideo} autoPlay muted playsInline className="local" />

      <div className="controls">
        <button onClick={toggleMute}>{isMuted ? <MicOff /> : <Mic />}</button>
        <button onClick={toggleVideo}>{isVideoOff ? <VideoOff /> : <Video />}</button>
        <button onClick={() => setShowAddPopup(true)}><UserPlus /></button>
        <button onClick={endCall}><PhoneOff /></button>
      </div>

      {/* ADD USER POPUP */}
      {showAddPopup && (
        <div className="popup">
          <h3>Add Participant</h3>
          {users.filter(u => u !== currentUserId).map(user => (
            <div key={user} className="user-item">
              <span>{user}</span>
              <button onClick={() => inviteUser(user)}>Add</button>
            </div>
          ))}
          <button onClick={() => setShowAddPopup(false)}>Close</button>
        </div>
      )}
    </div>
  );
}
