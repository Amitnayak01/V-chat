// WebRTC utility functions for meeting rooms

export const createPeerConnection = (userId, localStream, iceServers) => {
  const pc = new RTCPeerConnection(iceServers);
  
  // Add local stream tracks to peer connection
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });
  
  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`Peer connection state with ${userId}:`, pc.connectionState);
    
    if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
      console.warn(`Connection with ${userId} ${pc.connectionState}`);
    }
  };
  
  // Handle ICE connection state changes
  pc.oniceconnectionstatechange = () => {
    console.log(`ICE connection state with ${userId}:`, pc.iceConnectionState);
  };
  
  return pc;
};

export const handleOffer = async (peerConnection, offer) => {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
  } catch (err) {
    console.error("Error handling offer:", err);
    throw err;
  }
};

export const handleAnswer = async (peerConnection, answer) => {
  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  } catch (err) {
    console.error("Error handling answer:", err);
    throw err;
  }
};

export const handleIceCandidate = async (peerConnection, candidate) => {
  try {
    if (peerConnection && candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  } catch (err) {
    console.error("Error handling ICE candidate:", err);
  }
};

export const replaceVideoTrack = async (peerConnections, newTrack) => {
  try {
    const promises = Object.values(peerConnections).map(async (pc) => {
      const sender = pc.getSenders().find(s => s.track?.kind === "video");
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    });
    
    await Promise.all(promises);
  } catch (err) {
    console.error("Error replacing video track:", err);
    throw err;
  }
};