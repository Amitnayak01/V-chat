import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { socket } from "../socket";
import { createPeerConnection, handleOffer, handleAnswer, handleIceCandidate } from "../utils/webrtcMeeting";

const MeetingContext = createContext();

export const useMeeting = () => {
  const context = useContext(MeetingContext);
  if (!context) {
    throw new Error("useMeeting must be used within MeetingProvider");
  }
  return context;
};

export const MeetingProvider = ({ children }) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [participants, setParticipants] = useState([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState(null);
  const [currentRoomId, setCurrentRoomId] = useState(null);

  const peerConnections = useRef({});
  const mediaRecorder = useRef(null);
  const recordedChunks = useRef([]);
  const originalStream = useRef(null);
  const currentUserId = localStorage.getItem("userId");

  const iceServers = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  };

  // Initialize local media stream
  const initializeLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720 },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      setLocalStream(stream);
      originalStream.current = stream;
      return stream;
    } catch (err) {
      console.error("Error accessing media devices:", err);
      setError("Could not access camera/microphone. Please grant permissions.");
      throw err;
    }
  };

  // Join meeting room
  const joinRoom = async (roomId) => {
    try {
      setError(null);
      setCurrentRoomId(roomId);
      
      const stream = await initializeLocalStream();
      
      // Emit join event
      socket.emit("meeting-join-room", {
        roomId,
        userId: currentUserId,
        username: localStorage.getItem("username") || "Anonymous"
      });
    } catch (err) {
      console.error("Error joining room:", err);
      setError("Failed to join meeting room");
    }
  };

  // Leave meeting
  const leaveMeeting = () => {
    // Stop all tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close all peer connections
    Object.values(peerConnections.current).forEach(pc => pc.close());
    peerConnections.current = {};
    
    // Stop recording if active
    if (isRecording) {
      stopRecording();
    }
    
    // Emit leave event
    if (currentRoomId) {
      socket.emit("meeting-leave-room", {
        roomId: currentRoomId,
        userId: currentUserId
      });
    }
    
    // Reset state
    setLocalStream(null);
    setRemoteStreams({});
    setParticipants([]);
    setCurrentRoomId(null);
    setIsScreenSharing(false);
    setIsRecording(false);
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Toggle screen share
  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing, return to camera
        const stream = originalStream.current;
        const videoTrack = stream.getVideoTracks()[0];
        
        // Replace track in all peer connections
        Object.values(peerConnections.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        });
        
        setLocalStream(stream);
        setIsScreenSharing(false);
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: "always" },
          audio: false
        });
        
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Replace track in all peer connections
        Object.values(peerConnections.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === "video");
          if (sender) {
            sender.replaceTrack(screenTrack);
          }
        });
        
        // Update local stream
        const newStream = new MediaStream([
          screenTrack,
          ...localStream.getAudioTracks()
        ]);
        
        setLocalStream(newStream);
        setIsScreenSharing(true);
        
        // Handle screen share stop
        screenTrack.onended = () => {
          toggleScreenShare();
        };
      }
    } catch (err) {
      console.error("Error toggling screen share:", err);
      setError("Failed to share screen");
    }
  };

  // Start recording
  const startRecording = () => {
    try {
      const combinedStream = new MediaStream([
        ...localStream.getTracks(),
        ...Object.values(remoteStreams).flatMap(stream => stream.getTracks())
      ]);
      
      mediaRecorder.current = new MediaRecorder(combinedStream, {
        mimeType: "video/webm;codecs=vp9"
      });
      
      recordedChunks.current = [];
      
      mediaRecorder.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunks.current.push(event.data);
        }
      };
      
      mediaRecorder.current.onstop = async () => {
        const blob = new Blob(recordedChunks.current, { type: "video/webm" });
        const formData = new FormData();
        formData.append("recording", blob, `meeting-${currentRoomId}-${Date.now()}.webm`);
        formData.append("roomId", currentRoomId);
        formData.append("userId", currentUserId);
        
        try {
          const response = await fetch("/api/meetings/upload-recording", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${localStorage.getItem("token")}`
            },
            body: formData
          });
          
          if (response.ok) {
            console.log("Recording uploaded successfully");
          }
        } catch (err) {
          console.error("Error uploading recording:", err);
        }
      };
      
      mediaRecorder.current.start(1000);
      setIsRecording(true);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Failed to start recording");
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      setIsRecording(false);
    }
  };

  // Toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Socket event handlers
  useEffect(() => {
    // User joined
    socket.on("meeting-user-joined", async ({ userId, username, participants: updatedParticipants }) => {
      console.log("User joined:", username);
      setParticipants(updatedParticipants);
      
      // Create peer connection for new user
      if (userId !== currentUserId && localStream) {
        const pc = createPeerConnection(userId, localStream, iceServers);
        peerConnections.current[userId] = pc;
        
        // Handle remote stream
        pc.ontrack = (event) => {
          setRemoteStreams(prev => ({
            ...prev,
            [userId]: event.streams[0]
          }));
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("meeting-ice-candidate", {
              roomId: currentRoomId,
              targetUserId: userId,
              candidate: event.candidate
            });
          }
        };
        
        // Create and send offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        
        socket.emit("meeting-offer", {
          roomId: currentRoomId,
          targetUserId: userId,
          offer
        });
      }
    });
    
    // User left
    socket.on("meeting-user-left", ({ userId, participants: updatedParticipants }) => {
      console.log("User left:", userId);
      setParticipants(updatedParticipants);
      
      // Close peer connection
      if (peerConnections.current[userId]) {
        peerConnections.current[userId].close();
        delete peerConnections.current[userId];
      }
      
      // Remove remote stream
      setRemoteStreams(prev => {
        const newStreams = { ...prev };
        delete newStreams[userId];
        return newStreams;
      });
    });
    
    // Received offer
    socket.on("meeting-offer", async ({ fromUserId, offer }) => {
      console.log("Received offer from:", fromUserId);
      
      if (!peerConnections.current[fromUserId] && localStream) {
        const pc = createPeerConnection(fromUserId, localStream, iceServers);
        peerConnections.current[fromUserId] = pc;
        
        // Handle remote stream
        pc.ontrack = (event) => {
          setRemoteStreams(prev => ({
            ...prev,
            [fromUserId]: event.streams[0]
          }));
        };
        
        // Handle ICE candidates
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit("meeting-ice-candidate", {
              roomId: currentRoomId,
              targetUserId: fromUserId,
              candidate: event.candidate
            });
          }
        };
      }
      
      const answer = await handleOffer(peerConnections.current[fromUserId], offer);
      
      socket.emit("meeting-answer", {
        roomId: currentRoomId,
        targetUserId: fromUserId,
        answer
      });
    });
    
    // Received answer
    socket.on("meeting-answer", async ({ fromUserId, answer }) => {
      console.log("Received answer from:", fromUserId);
      await handleAnswer(peerConnections.current[fromUserId], answer);
    });
    
    // Received ICE candidate
    socket.on("meeting-ice-candidate", async ({ fromUserId, candidate }) => {
      await handleIceCandidate(peerConnections.current[fromUserId], candidate);
    });
    
    return () => {
      socket.off("meeting-user-joined");
      socket.off("meeting-user-left");
      socket.off("meeting-offer");
      socket.off("meeting-answer");
      socket.off("meeting-ice-candidate");
    };
  }, [localStream, currentRoomId, currentUserId]);

  const value = {
    localStream,
    remoteStreams,
    participants,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    isRecording,
    error,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    toggleRecording,
    joinRoom,
    leaveMeeting
  };

  return (
    <MeetingContext.Provider value={value}>
      {children}
    </MeetingContext.Provider>
  );
};