/**
 * audioCallSocket.js  (v2 — offline-ring support)
 * ─────────────────────────────────────────────────
 * Everything from v1 is kept intact.
 *
 * NEW: Offline-ring queue
 * ───────────────────────
 * When the receiver is offline the call is NOT immediately failed.
 * Instead it is stored in `pendingCalls` keyed by receiverId.
 * The moment that user reconnects (handled in registerAudioCallHandlers
 * via the `user-reconnected` hook OR via the exported
 * deliverPendingAudioCalls() helper called from handlers.js), the
 * server pushes `incoming-audio-call` to the newly-connected socket
 * exactly as if they had been online all along.
 *
 * The pending call is still governed by CALL_TIMEOUT_MS (30 s).
 * If the receiver hasn't come online by then the caller gets
 * `audio-call-timeout` and the queue entry is discarded.
 *
 * New server → client events:
 *   audio-call-queued   — tells the CALLER the receiver is offline
 *                         but the call is queued / ringing
 *
 * New socket events (client → server):  none — existing API unchanged.
 *
 * Integration — two options (pick one or both):
 * ────────────────────────────────────────────
 * Option A (self-contained — no handlers.js changes needed):
 *   The client emits 'check-pending-audio-calls' on every socket (re)connect.
 *   The handler inside registerAudioCallHandlers() catches it and calls
 *   deliverPendingAudioCalls() automatically. Works out of the box.
 *
 * Option B (handlers.js — extra reliability / belt-and-suspenders):
 *   After socket.join('user:' + userId) in your connect handler call:
 *
 *   import { deliverPendingAudioCalls } from './audioCallSocket.js';
 *   deliverPendingAudioCalls(io, userId);
 */

// ─── In-memory state ──────────────────────────────────────────────────────────
/** callId → { callerId, receiverId, state, startedAt, timeoutTimer } */
const activeCalls = new Map();

/** roomId → Map(userId → { username, avatar, socketId }) */
const audioRooms = new Map();

/**
 * Offline-ring queue.
 * receiverId → { callId, callerId, callerName, callerAvatar, timeoutTimer }
 * Only one pending call per receiver (latest wins — previous is cancelled).
 */
const pendingCalls = new Map();

const CALL_TIMEOUT_MS = 45_000; // 45 s — slightly longer to account for reconnect time
const MAX_ROOM_SIZE   = 8;

const genCallId = () =>
  `acall_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

// ─── Offline-ring helpers ──────────────────────────────────────────────────────

/**
 * Queue a call for an offline receiver.
 * Called internally when the receiver's socket room is empty.
 */
const _queuePendingCall = (io, callerSocket, { callId, callerId, receiverId, callerName, callerAvatar }) => {
  // Cancel any previous pending call for this receiver
  const existing = pendingCalls.get(receiverId);
  if (existing) {
    clearTimeout(existing.timeoutTimer);
    // Tell the previous caller it was superseded (treat as timeout)
    io.to(`user:${existing.callerId}`).emit('audio-call-timeout', {
      callId:  existing.callId,
      reason:  'superseded',
    });
    activeCalls.delete(existing.callId);
  }

  // 45-second ring window — even for offline users
  const timeoutTimer = setTimeout(() => {
    pendingCalls.delete(receiverId);
    activeCalls.delete(callId);
    io.to(`user:${callerId}`).emit('audio-call-timeout', { callId });
    console.log(`⏰ [AudioCall] offline-ring timeout [${callId}] receiver=${receiverId}`);
  }, CALL_TIMEOUT_MS);

  pendingCalls.set(receiverId, { callId, callerId, callerName, callerAvatar, timeoutTimer });

  activeCalls.set(callId, {
    callerId,
    receiverId,
    state: 'ringing',
    startedAt: Date.now(),
    timeoutTimer,
    offline: true,
  });

  // Tell the caller the receiver is offline but the call is queued
  callerSocket.emit('audio-call-queued', {
    callId,
    receiverId,
    message: 'User is offline — will ring when they connect',
  });

  console.log(`📵➡📞 [AudioCall] queued offline ring ${callerId} → ${receiverId} [${callId}]`);
};

/**
 * Called from handlers.js every time a user (re)connects and joins their
 * personal socket room.  Delivers any pending incoming call immediately.
 *
 * Usage in handlers.js:
 *   import { deliverPendingAudioCalls } from './audioCallSocket.js';
 *   // inside the connect / join-user-room handler:
 *   deliverPendingAudioCalls(io, userId);
 */
export const deliverPendingAudioCalls = (io, userId) => {
  const pending = pendingCalls.get(userId);
  if (!pending) return;

  const { callId, callerId, callerName, callerAvatar } = pending;

  // Check the call is still in our activeCalls (caller may have cancelled)
  if (!activeCalls.has(callId)) {
    pendingCalls.delete(userId);
    return;
  }

  console.log(`🔔 [AudioCall] delivering pending call to reconnected user=${userId} callId=${callId}`);

  // Push the incoming call notification — same payload as online flow
  io.to(`user:${userId}`).emit('incoming-audio-call', {
    callId,
    callerId,
    callerName,
    callerAvatar,
  });

  // Remove from pending (it is now live)
  pendingCalls.delete(userId);
};

// ─── Main registration ─────────────────────────────────────────────────────────
export const registerAudioCallHandlers = (io, socket) => {

  /**
   * check-pending-audio-calls
   * ─────────────────────────
   * The CLIENT emits this immediately after every socket (re)connect.
   * It lets us deliver queued offline-ring calls without requiring handlers.js
   * to be modified — fully self-contained.
   *
   * Payload: { userId }   (also accepted as socket.userId if set by auth middleware)
   */
  socket.on('check-pending-audio-calls', ({ userId } = {}) => {
    const uid = userId || socket.userId;
    if (!uid) return;
    console.log(`🔄 [AudioCall] check-pending for userId=${uid}`);
    deliverPendingAudioCalls(io, uid);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1 : 1  A U D I O  C A L L S
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * audio-call-user
   * Caller presses the audio-call button.
   * Payload: { callerId, receiverId, callerName, callerAvatar }
   */
  socket.on('audio-call-user', ({ callerId, receiverId, callerName, callerAvatar }) => {
    try {
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

      // ── Is receiver online? ───────────────────────────────────────────────
      const receiverRoom = io.sockets.adapter.rooms.get(`user:${receiverId}`);
      const isOnline     = receiverRoom && receiverRoom.size > 0;

      if (!isOnline) {
        // Queue the call — ring when they reconnect
        _queuePendingCall(io, socket, { callId, callerId, receiverId, callerName, callerAvatar });

        // Still give the caller their callId so they can cancel
        socket.emit('audio-call-initiated', { callId, receiverId });
        return;
      }

      // ── Receiver is online — normal flow ─────────────────────────────────
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
        offline: false,
      });

      io.to(`user:${receiverId}`).emit('incoming-audio-call', {
        callId,
        callerId,
        callerName,
        callerAvatar,
      });

      socket.emit('audio-call-initiated', { callId, receiverId });

      console.log(`📞 [AudioCall] initiated ${callerId} → ${receiverId} [${callId}]`);
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

      // Also clean up pending queue if it was still there
      if (call?.receiverId) pendingCalls.delete(call.receiverId);

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
   * Either party ended the call.
   * Payload: { callId, peerId }
   */
  socket.on('audio-call-ended', ({ callId, peerId }) => {
    try {
      const call = activeCalls.get(callId);
      if (call?.timeoutTimer) clearTimeout(call.timeoutTimer);
      activeCalls.delete(callId);

      // Clean up pending queue if the caller cancelled before receiver came online
      if (call?.receiverId) pendingCalls.delete(call.receiverId);

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
  // G R O U P  A U D I O  R O O M S  (unchanged)
  // ══════════════════════════════════════════════════════════════════════════

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

  socket.on('join-audio-room', ({ roomId, userId, username, avatar }) => {
    try {
      if (!audioRooms.has(roomId)) audioRooms.set(roomId, new Map());
      const room = audioRooms.get(roomId);

      if (room.size >= MAX_ROOM_SIZE) {
        socket.emit('audio-room-full', { roomId, maxSize: MAX_ROOM_SIZE });
        return;
      }

      room.set(userId, { username, avatar, socketId: socket.id });
      socket.join(`audio:${roomId}`);

      const existingParticipants = Array.from(room.entries())
        .filter(([uid]) => uid !== userId)
        .map(([uid, info]) => ({ userId: uid, ...info }));

      socket.emit('audio-room-joined', { roomId, participants: existingParticipants });

      socket.to(`audio:${roomId}`).emit('user-joined-audio', {
        userId,
        username,
        avatar,
        allParticipants: Array.from(room.entries()).map(([uid, info]) => ({
          userId: uid, ...info,
        })),
      });

      console.log(`🎙️ [AudioRoom] ${username} joined ${roomId} (${room.size} total)`);
    } catch (err) {
      console.error('[AudioCall] join-audio-room error:', err);
    }
  });

  socket.on('leave-audio-room', ({ roomId, userId }) => {
    try {
      _evictFromAudioRoom(io, socket, roomId, userId);
    } catch (err) {
      console.error('[AudioCall] leave-audio-room error:', err);
    }
  });
};

// ─── Shared eviction helper ────────────────────────────────────────────────────
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
        userId: uid, ...info,
      })),
    });
  }
};

// ─── Disconnect cleanup ────────────────────────────────────────────────────────
export const cleanupAudioCallUser = (io, userId) => {
  // End any active 1:1 calls — but do NOT cancel pending (offline-ring) calls
  // Those should survive a brief disconnect/reconnect cycle.
  for (const [callId, call] of activeCalls.entries()) {
    if (call.offline) continue; // leave queued calls alone — they have their own timer

    if (call.callerId === userId || call.receiverId === userId) {
      clearTimeout(call.timeoutTimer);

      const peerId = call.callerId === userId ? call.receiverId : call.callerId;
      io.to(`user:${peerId}`).emit('audio-call-ended', {
        callId,
        reason: 'peer-disconnected',
      });

      activeCalls.delete(callId);
    }
  }

  // Remove from any audio rooms
  for (const [roomId, room] of audioRooms.entries()) {
    if (room.has(userId)) {
      room.delete(userId);
      if (room.size === 0) {
        audioRooms.delete(roomId);
      } else {
        io.to(`audio:${roomId}`).emit('user-left-audio', {
          userId,
          allParticipants: Array.from(room.entries()).map(([uid, info]) => ({
            userId: uid, ...info,
          })),
        });
      }
    }
  }
};