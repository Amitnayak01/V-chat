/**
 * audioCallSocket.js
 * ──────────────────
 * Audio-call socket handlers for V-Meet.
 * 1:1 audio calls + group audio rooms (mesh, up to 8 participants).
 *
 * Routing uses `user:{userId}` socket rooms that are already maintained
 * by handlers.js — no dependency on the userSockets Map, no existing
 * code touched.
 *
 * New socket events (client → server):
 *   audio-call-user        audio-call-accepted    audio-call-rejected
 *   audio-call-ended       audio-webrtc-offer     audio-webrtc-answer
 *   audio-webrtc-ice       create-audio-room      join-audio-room
 *   leave-audio-room
 *
 * New socket events (server → client):
 *   incoming-audio-call    audio-call-initiated   audio-call-accepted
 *   audio-call-rejected    audio-call-ended       audio-call-failed
 *   audio-call-busy        audio-call-timeout     audio-webrtc-offer
 *   audio-webrtc-answer    audio-webrtc-ice       audio-room-created
 *   audio-room-joined      audio-room-full        audio-room-ended
 *   user-joined-audio      user-left-audio
 */

// ─── In-memory state (isolated from video-call state) ────────────────────────
/** callId → { callerId, receiverId, state, startedAt, timeoutTimer } */
const activeCalls = new Map();

/** roomId → Map(userId → { username, avatar, socketId }) */
const audioRooms = new Map();

const CALL_TIMEOUT_MS  = 30_000; // 30 s auto-reject
const MAX_ROOM_SIZE    = 8;

const genCallId = () =>
  `acall_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ─── Main registration ────────────────────────────────────────────────────────

export const registerAudioCallHandlers = (io, socket) => {

  // ══════════════════════════════════════════════════════════════════════════
  // 1 : 1  A U D I O  C A L L S
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * audio-call-user
   * Caller presses the audio-call button in ChatWindow.
   * Payload: { callerId, receiverId, callerName, callerAvatar }
   */
  socket.on('audio-call-user', ({ callerId, receiverId, callerName, callerAvatar }) => {
    try {
      // ── Is receiver online? ───────────────────────────────────────────────
      const receiverRoom = io.sockets.adapter.rooms.get(`user:${receiverId}`);
      if (!receiverRoom || receiverRoom.size === 0) {
        socket.emit('audio-call-failed', {
          receiverId,
          message: 'User is offline',
        });
        return;
      }

      // ── Is receiver already in an active 1:1 audio call? ─────────────────
      const isReceiverBusy = Array.from(activeCalls.values()).some(
        (c) =>
          (c.callerId === receiverId || c.receiverId === receiverId) &&
          c.state === 'connected',
      );
      if (isReceiverBusy) {
        socket.emit('audio-call-busy', {
          receiverId,
          message: 'User is already in a call',
        });
        return;
      }

      const callId = genCallId();

      // Auto-reject after 30 s of ringing
      const timeoutTimer = setTimeout(() => {
        const call = activeCalls.get(callId);
        if (call && call.state === 'ringing') {
          activeCalls.delete(callId);
          socket.emit('audio-call-timeout', { callId });
          io.to(`user:${receiverId}`).emit('audio-call-ended', {
            callId,
            reason: 'timeout',
          });
        }
      }, CALL_TIMEOUT_MS);

      activeCalls.set(callId, {
        callerId,
        receiverId,
        state: 'ringing',
        startedAt: Date.now(),
        timeoutTimer,
      });

      // Notify receiver
      io.to(`user:${receiverId}`).emit('incoming-audio-call', {
        callId,
        callerId,
        callerName,
        callerAvatar,
      });

      // Acknowledge caller (they need callId to reference the call later)
      socket.emit('audio-call-initiated', { callId, receiverId });

      console.log(
        `📞 [AudioCall] initiated ${callerId} → ${receiverId} [${callId}]`,
      );
    } catch (err) {
      console.error('[AudioCall] audio-call-user error:', err);
    }
  });

  /**
   * audio-call-accepted
   * Receiver accepted the incoming call.
   * Payload: { callId, callerId }
   */
  socket.on('audio-call-accepted', ({ callId, callerId }) => {
    try {
      const call = activeCalls.get(callId);
      if (!call) return;

      clearTimeout(call.timeoutTimer);
      call.state = 'connected';

      // Tell the caller — they will now create the WebRTC offer
      io.to(`user:${callerId}`).emit('audio-call-accepted', {
        callId,
        acceptedBy: socket.userId || call.receiverId,
      });

      console.log(`✅ [AudioCall] accepted [${callId}]`);
    } catch (err) {
      console.error('[AudioCall] audio-call-accepted error:', err);
    }
  });

  /**
   * audio-call-rejected
   * Receiver declined the call.
   * Payload: { callId, callerId }
   */
  socket.on('audio-call-rejected', ({ callId, callerId }) => {
    try {
      const call = activeCalls.get(callId);
      if (call?.timeoutTimer) clearTimeout(call.timeoutTimer);
      activeCalls.delete(callId);

      io.to(`user:${callerId}`).emit('audio-call-rejected', {
        callId,
        rejectedBy: socket.userId || call?.receiverId,
      });

      console.log(`❌ [AudioCall] rejected [${callId}]`);
    } catch (err) {
      console.error('[AudioCall] audio-call-rejected error:', err);
    }
  });

  /**
   * audio-call-ended
   * Either party ended an established call.
   * Payload: { callId, peerId }
   */
  socket.on('audio-call-ended', ({ callId, peerId }) => {
    try {
      const call = activeCalls.get(callId);
      if (call?.timeoutTimer) clearTimeout(call.timeoutTimer);
      activeCalls.delete(callId);

      if (peerId) {
        io.to(`user:${peerId}`).emit('audio-call-ended', {
          callId,
          reason: 'ended',
          endedBy: socket.userId,
        });
      }

      console.log(`📵 [AudioCall] ended [${callId}]`);
    } catch (err) {
      console.error('[AudioCall] audio-call-ended error:', err);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // A U D I O - O N L Y  W e b R T C  S I G N A L I N G
  // Separate event names prevent collision with the video call WebRTC events.
  // ══════════════════════════════════════════════════════════════════════════

  socket.on('audio-webrtc-offer', ({ offer, to, from }) => {
    const fromId = from || socket.userId;
    io.to(`user:${to}`).emit('audio-webrtc-offer', { offer, from: fromId });
  });

  socket.on('audio-webrtc-answer', ({ answer, to, from }) => {
    const fromId = from || socket.userId;
    io.to(`user:${to}`).emit('audio-webrtc-answer', { answer, from: fromId });
  });

  socket.on('audio-webrtc-ice', ({ candidate, to }) => {
    io.to(`user:${to}`).emit('audio-webrtc-ice', {
      candidate,
      from: socket.userId,
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // G R O U P  A U D I O  R O O M S
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * create-audio-room
   * Host creates and enters a new audio room.
   * Payload: { roomId, userId, username, avatar }
   */
  socket.on('create-audio-room', ({ roomId, userId, username, avatar }) => {
    try {
      if (!audioRooms.has(roomId)) audioRooms.set(roomId, new Map());
      const room = audioRooms.get(roomId);
      room.set(userId, { username, avatar, socketId: socket.id });
      socket.join(`audio:${roomId}`);

      socket.emit('audio-room-created', { roomId, participants: [] });
      console.log(`🎙️ [AudioRoom] created ${roomId} by ${username}`);
    } catch (err) {
      console.error('[AudioCall] create-audio-room error:', err);
    }
  });

  /**
   * join-audio-room
   * Participant joins an existing audio room.
   * Payload: { roomId, userId, username, avatar }
   */
  socket.on('join-audio-room', ({ roomId, userId, username, avatar }) => {
    try {
      if (!audioRooms.has(roomId)) audioRooms.set(roomId, new Map());
      const room = audioRooms.get(roomId);

      // Enforce participant cap
      if (room.size >= MAX_ROOM_SIZE) {
        socket.emit('audio-room-full', { roomId, maxSize: MAX_ROOM_SIZE });
        return;
      }

      room.set(userId, { username, avatar, socketId: socket.id });
      socket.join(`audio:${roomId}`);

      // Joiner needs the list of existing participants to create offers to them
      const existingParticipants = Array.from(room.entries())
        .filter(([uid]) => uid !== userId)
        .map(([uid, info]) => ({ userId: uid, ...info }));

      socket.emit('audio-room-joined', { roomId, participants: existingParticipants });

      // Notify everyone else
      socket.to(`audio:${roomId}`).emit('user-joined-audio', {
        userId,
        username,
        avatar,
        allParticipants: Array.from(room.entries()).map(([uid, info]) => ({
          userId: uid,
          ...info,
        })),
      });

      console.log(
        `🎙️ [AudioRoom] ${username} joined ${roomId} (${room.size} total)`,
      );
    } catch (err) {
      console.error('[AudioCall] join-audio-room error:', err);
    }
  });

  /**
   * leave-audio-room
   * Payload: { roomId, userId }
   */
  socket.on('leave-audio-room', ({ roomId, userId }) => {
    try {
      _evictFromAudioRoom(io, socket, roomId, userId);
    } catch (err) {
      console.error('[AudioCall] leave-audio-room error:', err);
    }
  });
};

// ─── Shared eviction helper (used by leave + disconnect cleanup) ──────────────
const _evictFromAudioRoom = (io, socket, roomId, userId) => {
  const room = audioRooms.get(roomId);
  if (!room || !room.has(userId)) return;

  room.delete(userId);
  socket?.leave?.(`audio:${roomId}`);

  if (room.size === 0) {
    audioRooms.delete(roomId);
    io.to(`audio:${roomId}`).emit('audio-room-ended', { roomId });
  } else {
    io.to(`audio:${roomId}`).emit('user-left-audio', {
      userId,
      allParticipants: Array.from(room.entries()).map(([uid, info]) => ({
        userId: uid,
        ...info,
      })),
    });
  }
};

// ─── Disconnect cleanup — called from handlers.js disconnect handler ──────────
export const cleanupAudioCallUser = (io, userId) => {
  // End any pending / active 1:1 audio calls involving this user
  for (const [callId, call] of activeCalls.entries()) {
    if (call.callerId === userId || call.receiverId === userId) {
      clearTimeout(call.timeoutTimer);

      const peerId =
        call.callerId === userId ? call.receiverId : call.callerId;

      io.to(`user:${peerId}`).emit('audio-call-ended', {
        callId,
        reason: 'peer-disconnected',
      });

      activeCalls.delete(callId);
    }
  }

  // Remove from any audio rooms the user was in
  for (const [roomId, room] of audioRooms.entries()) {
    if (room.has(userId)) {
      room.delete(userId);

      if (room.size === 0) {
        audioRooms.delete(roomId);
      } else {
        io.to(`audio:${roomId}`).emit('user-left-audio', {
          userId,
          allParticipants: Array.from(room.entries()).map(([uid, info]) => ({
            userId: uid,
            ...info,
          })),
        });
      }
    }
  }
};