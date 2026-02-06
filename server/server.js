const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");

/* ================= DB ================= */
mongoose.connect("mongodb+srv://amitkumarnayak330_db_user:YMwkvBag3LpTT4rJ@cluster0.vppxlxb.mongodb.net/Chat?appName=Cluster0")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("DB Error:", err));

/* ================= APP ================= */
const app = express();
app.use(cors());
app.use(express.json());
app.use("/api/auth", require("./routes/auth"));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

/* ================= MAPS ================= */
const onlineUsers = new Map();  // userId -> socketId
const socketToUser = new Map(); // socketId -> userId
const activeCalls = new Map();  // userId -> otherUserId
const callTimers = new Map();   // userId -> startTime
const groupCallRooms = new Map(); // roomId -> { participants: [userId], creatorId }

process.on("uncaughtException", err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

/* ================= SOCKET ================= */
io.on("connection", (socket) => {
  console.log("🔌 Socket connected:", socket.id);

  /* ===== USER ONLINE ===== */
  socket.on("user-online", (userId) => {
    if (!userId) {
      console.log("⚠️  No userId provided for user-online");
      return;
    }

    // Remove old socket if user reconnects
    const oldSocket = onlineUsers.get(userId);
    if (oldSocket && oldSocket !== socket.id) {
      console.log(`🔄 User ${userId} reconnecting - removing old socket ${oldSocket}`);
      socketToUser.delete(oldSocket);
    }

    onlineUsers.set(userId, socket.id);
    socketToUser.set(socket.id, userId);

    // Broadcast updated online users list to ALL clients
    const onlineUsersList = Array.from(onlineUsers.keys());
    io.emit("online-users", onlineUsersList);
    console.log(`🟢 User ${userId} is now ONLINE (${onlineUsersList.length} users online)`);
  });

  /* ===== USER OFFLINE (TAB CLOSED / MANUAL) ===== */
  socket.on("user-offline", (userId) => {
    if (!userId) return;

    onlineUsers.delete(userId);
    socketToUser.delete(socket.id);

    // End any active call
    const otherUser = activeCalls.get(userId);
    if (otherUser) {
      const otherSocket = onlineUsers.get(otherUser);
      if (otherSocket) {
        io.to(otherSocket).emit("call-ended");
        console.log(`📵 Call ended - ${userId} went offline`);
      }

      activeCalls.delete(otherUser);
      activeCalls.delete(userId);
      callTimers.delete(otherUser);
      callTimers.delete(userId);
    }

    // Broadcast updated online users
    io.emit("online-users", Array.from(onlineUsers.keys()));
    console.log(`🔴 User ${userId} went OFFLINE`);
  });

  /* ===== CALL USER ===== */
  socket.on("call-user", ({ toUserId, fromUserId, fromUsername, offer }) => {
    console.log(`📞 Call request: ${fromUsername || fromUserId} → ${toUserId}`);

    // Check if target user is busy
    if (activeCalls.has(toUserId)) {
      console.log(`⚠️  User ${toUserId} is busy`);
      socket.emit("user-busy");
      return;
    }

    // Check if target user is online
    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      console.log(`✅ Sending incoming-call to ${toUserId} via socket ${targetSocket}`);
      io.to(targetSocket).emit("incoming-call", {
        fromUserId,
        fromUsername,
        offer
      });
    } else {
      console.log(`❌ User ${toUserId} is not online`);
      socket.emit("user-not-available");
    }
  });

  /* ===== ACCEPT CALL ===== */
  socket.on("accept-call", ({ toUserId, fromUserId, answer }) => {
    console.log(`✅ Call accepted: ${fromUserId} ↔️ ${toUserId}`);

    // Mark both users as in active call
    activeCalls.set(fromUserId, toUserId);
    activeCalls.set(toUserId, fromUserId);

    // Start call timer
    callTimers.set(fromUserId, Date.now());
    callTimers.set(toUserId, Date.now());

    // Send answer to caller
    const callerSocket = onlineUsers.get(toUserId);
    if (callerSocket) {
      io.to(callerSocket).emit("call-accepted", { answer });
      console.log(`📡 Sent call-accepted to ${toUserId}`);
    }
  });

  /* ===== DECLINE CALL ===== */
  socket.on("decline-call", ({ toUserId, fromUserId }) => {
    console.log(`📵 Call declined: ${fromUserId} declined call from ${toUserId}`);

    const callerSocket = onlineUsers.get(toUserId);
    if (callerSocket) {
      io.to(callerSocket).emit("call-declined", { fromUserId });
      console.log(`📡 Sent call-declined to ${toUserId}`);
    }
  });

  /* ===== ICE CANDIDATE ===== */
  socket.on("ice-candidate", ({ toUserId, candidate }) => {
    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      io.to(targetSocket).emit("ice-candidate", { candidate });
      // console.log(`🧊 ICE candidate sent to ${toUserId}`);
    }
  });

  /* ===== END CALL ===== */
  socket.on("end-call", ({ toUserId }) => {
    const currentUser = socketToUser.get(socket.id);
    const targetSocket = onlineUsers.get(toUserId);

    console.log(`📵 Call ended: ${currentUser} ended call with ${toUserId}`);

    // Notify other user
    if (targetSocket) {
      io.to(targetSocket).emit("call-ended");
    }

    // Calculate and log call duration
    const start = callTimers.get(currentUser);
    if (start) {
      const duration = Math.floor((Date.now() - start) / 1000);
      console.log(`⏱️  Call duration: ${duration}s`);
    }

    // Clean up call state
    activeCalls.delete(toUserId);
    activeCalls.delete(currentUser);
    callTimers.delete(toUserId);
    callTimers.delete(currentUser);
  });

  /* ===== DISCONNECT ===== */
  socket.on("disconnect", () => {
    const userId = socketToUser.get(socket.id);
    if (!userId) {
      console.log(`❌ Socket ${socket.id} disconnected (no associated user)`);
      return;
    }

    console.log(`❌ User ${userId} disconnected (socket: ${socket.id})`);

    // Remove from online users
    onlineUsers.delete(userId);
    socketToUser.delete(socket.id);

    // End any active call
    const otherUser = activeCalls.get(userId);
    if (otherUser) {
      const otherSocket = onlineUsers.get(otherUser);
      if (otherSocket) {
        io.to(otherSocket).emit("call-ended");
        console.log(`📵 Call ended - ${userId} disconnected`);
      }

      activeCalls.delete(otherUser);
      activeCalls.delete(userId);
      callTimers.delete(otherUser);
      callTimers.delete(userId);
    }

    // Broadcast updated online users
    const onlineUsersList = Array.from(onlineUsers.keys());
    io.emit("online-users", onlineUsersList);
    console.log(`🔴 Online users after disconnect: ${onlineUsersList.length}`);
  });

  /* ===== DEBUG: Get online users ===== */
  socket.on("get-online-users", () => {
    socket.emit("online-users", Array.from(onlineUsers.keys()));
  });

  /* ================= GROUP CALL EVENTS ================= */
  
  /* ===== CREATE GROUP CALL ===== */
  socket.on("create-group-call", ({ roomId, creatorId }) => {
    if (!groupCallRooms.has(roomId)) {
      groupCallRooms.set(roomId, {
        participants: [creatorId],
        creatorId: creatorId
      });
      console.log(`📹 Group call room ${roomId} created by ${creatorId}`);
    }
  });

  /* ===== GROUP CALL INVITE ===== */
  socket.on("group-call-invite", ({ roomId, from, toUsers, fromUsername }) => {
    console.log(`📧 Group call invite from ${fromUsername} to:`, toUsers);

    toUsers.forEach(userId => {
      const targetSocket = onlineUsers.get(userId);
      if (targetSocket) {
        io.to(targetSocket).emit("incoming-group-invite", {
          roomId,
          from,
          fromUsername
        });
        console.log(`✅ Sent group invite to ${userId}`);
      } else {
        console.log(`❌ User ${userId} not online`);
      }
    });
  });

  /* ===== GROUP CALL ACCEPTED ===== */
  socket.on("group-call-accepted", ({ roomId, userId, username }) => {
    console.log(`✅ ${username} accepted group call ${roomId}`);

    // Add user to room
    if (!groupCallRooms.has(roomId)) {
      groupCallRooms.set(roomId, { participants: [] });
    }

    const room = groupCallRooms.get(roomId);
    if (!room.participants.includes(userId)) {
      room.participants.push(userId);
    }

    // Notify all participants in the room
    room.participants.forEach(participantId => {
      const participantSocket = onlineUsers.get(participantId);
      if (participantSocket && participantId !== userId) {
        io.to(participantSocket).emit("user-joined-group-call", {
          roomId,
          userId,
          username,
          participants: room.participants
        });
      }
    });

    // Send current participants list to new user
    socket.emit("group-call-participants", {
      roomId,
      participants: room.participants
    });

    console.log(`📹 Room ${roomId} participants:`, room.participants);
  });

  /* ===== GROUP CALL DECLINED ===== */
  socket.on("group-call-declined", ({ roomId, from, userId }) => {
    console.log(`❌ ${userId} declined group call ${roomId}`);
    
    const creatorSocket = onlineUsers.get(from);
    if (creatorSocket) {
      io.to(creatorSocket).emit("group-invite-declined", { userId });
    }
  });

  /* ===== GROUP CALL OFFER (WebRTC) ===== */
  socket.on("group-call-offer", ({ roomId, toUserId, fromUserId, offer }) => {
    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      io.to(targetSocket).emit("group-call-offer-received", {
        roomId,
        fromUserId,
        offer
      });
      console.log(`📡 Sent offer from ${fromUserId} to ${toUserId}`);
    }
  });

  /* ===== GROUP CALL ANSWER (WebRTC) ===== */
  socket.on("group-call-answer", ({ roomId, toUserId, fromUserId, answer }) => {
    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      io.to(targetSocket).emit("group-call-answer-received", {
        roomId,
        fromUserId,
        answer
      });
      console.log(`📡 Sent answer from ${fromUserId} to ${toUserId}`);
    }
  });

  /* ===== GROUP CALL ICE CANDIDATE ===== */
  socket.on("group-ice-candidate", ({ roomId, toUserId, fromUserId, candidate }) => {
    const targetSocket = onlineUsers.get(toUserId);
    if (targetSocket) {
      io.to(targetSocket).emit("group-ice-candidate-received", {
        roomId,
        fromUserId,
        candidate
      });
    }
  });

  /* ===== LEAVE GROUP CALL ===== */
  socket.on("leave-group-call", ({ roomId, userId }) => {
    const room = groupCallRooms.get(roomId);
    if (!room) return;

    // Remove user from participants
    room.participants = room.participants.filter(id => id !== userId);

    // Notify remaining participants
    room.participants.forEach(participantId => {
      const participantSocket = onlineUsers.get(participantId);
      if (participantSocket) {
        io.to(participantSocket).emit("user-left-group-call", {
          roomId,
          userId,
          participants: room.participants
        });
      }
    });

    // Delete room if empty
    if (room.participants.length === 0) {
      groupCallRooms.delete(roomId);
      console.log(`📹 Room ${roomId} deleted (empty)`);
    }

    console.log(`📴 ${userId} left room ${roomId}`);
  });

}); // <-- CLOSING BRACE FOR io.on("connection")

/* ================= SERVER ================= */
server.listen(5000, () => {
  console.log("🚀 Server running on port 5000");
  console.log("📡 Socket.IO ready for connections");
});