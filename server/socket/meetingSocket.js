// Meeting Socket Handlers
// This file handles all socket events for group video meetings

const meetingRooms = new Map(); // roomId -> { participants: [], messages: [] }

/**
 * Initialize meeting socket handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
function initializeMeetingSocket(io) {
  console.log("🎥 Initializing meeting socket handlers...");

  io.on("connection", (socket) => {
    // Join meeting room
    socket.on("meeting-join-room", ({ roomId, userId, username }) => {
      console.log(`👤 User ${username} joining room ${roomId}`);

      // Join socket room
      socket.join(roomId);

      // Initialize room if it doesn't exist
      if (!meetingRooms.has(roomId)) {
        meetingRooms.set(roomId, {
          participants: [],
          messages: []
        });
      }

      const room = meetingRooms.get(roomId);

      // Add participant if not already in room
      if (!room.participants.find(p => p.userId === userId)) {
        room.participants.push({
          userId,
          username,
          socketId: socket.id,
          joinedAt: new Date()
        });
      }

      // Store room info in socket
      socket.meetingRoomId = roomId;
      socket.meetingUserId = userId;

      // Notify others in the room
      socket.to(roomId).emit("meeting-user-joined", {
        userId,
        username,
        participants: room.participants
      });

      // Send current participants to the new user
      socket.emit("meeting-user-joined", {
        userId,
        username,
        participants: room.participants
      });

      console.log(`✅ Room ${roomId} now has ${room.participants.length} participants`);
    });

    // Leave meeting room
    socket.on("meeting-leave-room", ({ roomId, userId }) => {
      handleUserLeave(socket, io, roomId, userId);
    });

    // WebRTC Signaling - Offer
    socket.on("meeting-offer", ({ roomId, targetUserId, offer }) => {
      const room = meetingRooms.get(roomId);
      if (!room) return;

      const targetParticipant = room.participants.find(p => p.userId === targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit("meeting-offer", {
          fromUserId: socket.meetingUserId,
          offer
        });
      }
    });

    // WebRTC Signaling - Answer
    socket.on("meeting-answer", ({ roomId, targetUserId, answer }) => {
      const room = meetingRooms.get(roomId);
      if (!room) return;

      const targetParticipant = room.participants.find(p => p.userId === targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit("meeting-answer", {
          fromUserId: socket.meetingUserId,
          answer
        });
      }
    });

    // WebRTC Signaling - ICE Candidate
    socket.on("meeting-ice-candidate", ({ roomId, targetUserId, candidate }) => {
      const room = meetingRooms.get(roomId);
      if (!room) return;

      const targetParticipant = room.participants.find(p => p.userId === targetUserId);
      if (targetParticipant) {
        io.to(targetParticipant.socketId).emit("meeting-ice-candidate", {
          fromUserId: socket.meetingUserId,
          candidate
        });
      }
    });

    // Chat - Send message
    socket.on("meeting-send-message", async (message) => {
      const { roomId } = message;
      
      // Broadcast to all in room
      io.to(roomId).emit("meeting-receive-message", {
        ...message,
        timestamp: new Date()
      });

      // Save to in-memory cache
      const room = meetingRooms.get(roomId);
      if (room) {
        room.messages.push({
          ...message,
          timestamp: new Date()
        });
      }
    });

    // Chat - Typing indicator
    socket.on("meeting-typing", ({ roomId, userId, username, isTyping }) => {
      socket.to(roomId).emit("meeting-typing", {
        userId,
        username,
        isTyping
      });
    });

    // File uploaded
    socket.on("meeting-file-uploaded", ({ roomId, message }) => {
      io.to(roomId).emit("meeting-file-uploaded", message);

      const room = meetingRooms.get(roomId);
      if (room) {
        room.messages.push(message);
      }
    });

    // Handle disconnect
    socket.on("disconnect", () => {
      if (socket.meetingRoomId && socket.meetingUserId) {
        handleUserLeave(socket, io, socket.meetingRoomId, socket.meetingUserId);
      }
    });
  });

  console.log("✅ Meeting socket handlers ready");
}

// Helper function to handle user leaving
function handleUserLeave(socket, io, roomId, userId) {
  const room = meetingRooms.get(roomId);
  if (!room) return;

  // Remove participant
  room.participants = room.participants.filter(p => p.userId !== userId);

  // Leave socket room
  socket.leave(roomId);

  // Notify others
  socket.to(roomId).emit("meeting-user-left", {
    userId,
    participants: room.participants
  });

  console.log(`👋 User ${userId} left room ${roomId}. Remaining: ${room.participants.length}`);

  // Clean up empty rooms
  if (room.participants.length === 0) {
    meetingRooms.delete(roomId);
    console.log(`🗑️  Room ${roomId} deleted (empty)`);
  }
}

// Export the initialization function
module.exports = initializeMeetingSocket;

// Also export a method to get rooms (for debugging)
module.exports.getMeetingRooms = () => meetingRooms;