import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// ─────────────────────────────────────────────
// Load Environment Variables FIRST
// Must be before all other imports that need env vars
// ─────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import connectDB from './config/db.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import roomRoutes from './routes/rooms.js';
import contactsRoutes from './routes/contacts.js';
import directMessageRoutes from './routes/directMessages.js';
import { handleSocketConnection } from './socket/handlers.js';
import { initCloudinary } from './config/cloudinary.js';

initCloudinary();

// ─────────────────────────────────────────────
// Initialize App & HTTP Server
// ─────────────────────────────────────────────
const app = express();
const httpServer = createServer(app);

// ─────────────────────────────────────────────
// Socket.IO Configuration
// ─────────────────────────────────────────────
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const io = new Server(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ─────────────────────────────────────────────
// ✅ THE FIX: Attach io to app so HTTP controllers
//    (like forwardMessage.js) can access it via
//    req.app.get('io').  Without this line, every
//    call to req.app.get('io') returns undefined,
//    emitToAll() exits immediately, and no socket
//    events are ever sent for forwarded messages.
// ─────────────────────────────────────────────
app.set('io', io);

// ─────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────
app.use(cors({
  origin: CLIENT_URL,
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────────────────────
// Health Check Route
// ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'V-Meet Server is running',
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────────
// API Routes
// ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/direct-messages', directMessageRoutes);
app.use('/api/contacts', contactsRoutes);

// ─────────────────────────────────────────────
// Socket Connection Handler
// ─────────────────────────────────────────────
handleSocketConnection(io);

// ─────────────────────────────────────────────
// 404 Handler
// ─────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// ─────────────────────────────────────────────
// Global Error Handler
// ─────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ─────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    httpServer.listen(PORT, () => {
      console.log('\n🚀 ====================================');
      console.log('🚀   V-Meet Server Started');
      console.log('🚀 ====================================');
      console.log(`📡 Port        : ${PORT}`);
      console.log(`🌐 Environment : ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Client URL  : ${CLIENT_URL}`);
      console.log('🚀 ====================================\n');
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// ─────────────────────────────────────────────
// Graceful Shutdown Handling
// ─────────────────────────────────────────────
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  httpServer.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received. Shutting down gracefully...');
  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

startServer();

export { io };