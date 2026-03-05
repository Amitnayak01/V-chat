import express from 'express';
import { protect } from '../middleware/auth.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';

const router = express.Router();

// ─── GET /api/contacts
// Returns all users who have exchanged at least one DM with the current user.
// Each contact includes: user info, last message preview, unread count, last activity.
// ──────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const myId = req.user._id;

    // Find all conversations where current user is a participant
    const conversations = await Conversation.find({
      participants: myId,
      // Only include conversations that have at least one message
      'lastMessage.timestamp': { $exists: true },
    })
      .populate({
        path: 'participants',
        select: '_id username avatar status lastSeen',
      })
      .sort({ lastActivityAt: -1 });

    // Build contacts list — one entry per conversation (the OTHER participant)
    const contacts = conversations.map((conv) => {
      // Get the other participant (not current user)
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== myId.toString()
      );
      if (!otherUser) return null;

      // Unread count for current user
      const unread = conv.unreadCount?.get(myId.toString()) || 0;

      return {
        _id:            otherUser._id,
        username:       otherUser.username,
        avatar:         otherUser.avatar,
        status:         otherUser.status,
        lastSeen:       otherUser.lastSeen,
        conversationId: conv.conversationId,
        lastMessage: conv.lastMessage
          ? {
              content:   conv.lastMessage.content,
              type:      conv.lastMessage.type || 'text',
              senderId:  conv.lastMessage.sender?.toString(),
              timestamp: conv.lastMessage.timestamp,
            }
          : null,
        unreadCount:    unread,
        lastActivityAt: conv.lastActivityAt,
      };
    }).filter(Boolean);

    res.status(200).json({ success: true, contacts });
  } catch (error) {
    console.error('Get contacts error:', error);
    res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

export default router;