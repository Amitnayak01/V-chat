// WebRTC Configuration
export const WEBRTC_CONFIG = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:stun1.l.google.com:19302'
    },
    {
      urls: 'stun:stun2.l.google.com:19302'
    },
    {
      urls: 'stun:stun3.l.google.com:19302'
    },
    {
      urls: 'stun:stun4.l.google.com:19302'
    }
  ],
  iceCandidatePoolSize: 10
};

// Media constraints
export const MEDIA_CONSTRAINTS = {
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 60 }
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
};

// Screen share constraints
export const SCREEN_SHARE_CONSTRAINTS = {
  video: {
    cursor: 'always',
    displaySurface: 'monitor'
  },
  audio: false
};

// Create peer connection
export const createPeerConnection = () => {
  return new RTCPeerConnection(WEBRTC_CONFIG);
};

// Get user media with error handling
export const getUserMedia = async (constraints = MEDIA_CONSTRAINTS) => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return { stream, error: null };
  } catch (error) {
    console.error('Error getting user media:', error);
    let errorMessage = 'Failed to access camera/microphone';
    
    if (error.name === 'NotAllowedError') {
      errorMessage = 'Camera/microphone access denied. Please allow access in browser settings.';
    } else if (error.name === 'NotFoundError') {
      errorMessage = 'No camera/microphone found. Please connect a device.';
    } else if (error.name === 'NotReadableError') {
      errorMessage = 'Camera/microphone is already in use by another application.';
    }
    
    return { stream: null, error: errorMessage };
  }
};

// Get display media (screen sharing)
export const getDisplayMedia = async (constraints = SCREEN_SHARE_CONSTRAINTS) => {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
    return { stream, error: null };
  } catch (error) {
    console.error('Error getting display media:', error);
    return {
      stream: null,
      error: error.name === 'NotAllowedError'
        ? 'Screen sharing permission denied'
        : 'Failed to share screen'
    };
  }
};

// Toggle media track
export const toggleMediaTrack = (stream, kind, enabled) => {
  if (!stream) return false;
  
  const tracks = kind === 'audio'
    ? stream.getAudioTracks()
    : stream.getVideoTracks();
  
  tracks.forEach(track => {
    track.enabled = enabled;
  });
  
  return enabled;
};

// Stop all tracks in a stream
export const stopMediaStream = (stream) => {
  if (!stream) return;
  
  stream.getTracks().forEach(track => {
    track.stop();
  });
};

// Replace track in peer connection
export const replaceTrack = async (peerConnection, newTrack, kind) => {
  const sender = peerConnection
    .getSenders()
    .find(s => s.track && s.track.kind === kind);
  
  if (sender) {
    await sender.replaceTrack(newTrack);
    return true;
  }
  
  return false;
};

// Check browser support
export const checkWebRTCSupport = () => {
  const hasGetUserMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const hasRTCPeerConnection = !!window.RTCPeerConnection;
  
  return {
    supported: hasGetUserMedia && hasRTCPeerConnection,
    getUserMedia: hasGetUserMedia,
    peerConnection: hasRTCPeerConnection
  };
};

// Generate room ID
export const generateRoomId = () => {
  return `room_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Recording utilities (basic implementation)
export class MediaRecorderHelper {
  constructor(stream) {
    this.stream = stream;
    this.mediaRecorder = null;
    this.recordedChunks = [];
  }

  start() {
    try {
      const options = { mimeType: 'video/webm;codecs=vp9' };
      
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'video/webm;codecs=vp8';
      }
      
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.recordedChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      this.mediaRecorder.start(1000); // Collect data every second
      return true;
    } catch (error) {
      console.error('Error starting recording:', error);
      return false;
    }
  }

  stop() {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('No media recorder initialized'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, {
          type: 'video/webm'
        });
        
        const url = URL.createObjectURL(blob);
        resolve({ blob, url });
      };

      this.mediaRecorder.onerror = (error) => {
        reject(error);
      };

      this.mediaRecorder.stop();
    });
  }

  isRecording() {
    return this.mediaRecorder && this.mediaRecorder.state === 'recording';
  }
}

export default {
  WEBRTC_CONFIG,
  MEDIA_CONSTRAINTS,
  SCREEN_SHARE_CONSTRAINTS,
  createPeerConnection,
  getUserMedia,
  getDisplayMedia,
  toggleMediaTrack,
  stopMediaStream,
  replaceTrack,
  checkWebRTCSupport,
  generateRoomId,
  MediaRecorderHelper
};
