import express            from 'express';
import multer             from 'multer';
import { cloudinary }     from '../config/cloudinary.js';
import DirectMessage      from '../models/DirectMessage.js';
import Conversation       from '../models/Conversation.js';
import { protect }        from '../middleware/auth.js';
import { forwardMessage } from '../controllers/forwardMessage.js';

const router = express.Router();

/* ─── Simple in-memory rate limiters (no external dependency) ──────────────── */
const _rateCounts = new Map();
const makeRateLimiter = (windowMs, max, errorMsg) => (req, res, next) => {
  const key   = req.user?._id?.toString() || req.ip;
  const now   = Date.now();
  const entry = _rateCounts.get(key);
  if (!entry || now > entry.resetAt) {
    _rateCounts.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (entry.count >= max) {
    return res.status(429).json({ success: false, message: errorMsg });
  }
  entry.count += 1;
  next();
};
// Prune expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _rateCounts.entries()) {
    if (now > v.resetAt) _rateCounts.delete(k);
  }
}, 300_000);

const sendLimiter    = makeRateLimiter(10_000,  20, 'Too many messages, slow down.');
const voiceLimiter   = makeRateLimiter(60_000,  10, 'Too many voice messages, slow down.');
const searchLimiter  = makeRateLimiter(60_000,  30, 'Too many searches, slow down.');
const forwardLimiter = makeRateLimiter(10_000,  10, 'Too many forwards, slow down.');

/* ─── Multer: memory storage → stream to Cloudinary ───────────────────────── */
const _memMulter = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 25 * 1024 * 1024, files: 5 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/', 'video/', 'audio/',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument',
      'text/',
    ];
    const ok = allowed.some((t) => file.mimetype.startsWith(t));
    cb(ok ? null : new Error('File type not allowed'), ok);
  },
}).array('files', 5);

/* ── Upload a buffer to Cloudinary, return { url, cloudinaryDuration } ──────── */
const _hasCloudinary = () =>
  !!(process.env.CLOUDINARY_CLOUD_NAME &&
     process.env.CLOUDINARY_API_KEY    &&
     process.env.CLOUDINARY_API_SECRET);

const uploadToCloudinary = (buffer, mimetype, originalname = '') => {
  if (!_hasCloudinary()) {
    return Promise.resolve({
      url: `data:${mimetype};base64,${buffer.toString('base64')}`,
      cloudinaryDuration: null,
    });
  }
  return new Promise((resolve) => {
    const resourceType = (mimetype.startsWith('video/') || mimetype.startsWith('audio/')) ? 'video'
                       : mimetype.startsWith('image/') ? 'image'
                       : 'raw';
    const folder = mimetype.startsWith('audio/') ? 'v-meet/voice' : 'v-meet/dm';
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type:   resourceType,
        unique_filename: true,
        ...(mimetype.startsWith('audio/') && { format: 'mp3' }),
      },
      (err, result) => {
        if (err) {
          console.warn('Cloudinary upload failed, fallback to base64:', err.message);
          return resolve({
            url: `data:${mimetype};base64,${buffer.toString('base64')}`,
            cloudinaryDuration: null,
          });
        }
        resolve({ url: result.secure_url, cloudinaryDuration: result.duration ?? null });
      }
    );
    stream.end(buffer);
  });
};

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
const sanitize = (str, max = 65536) =>
  typeof str === 'string'
    ? str.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
         .replace(/<[^>]+>/g, '')
         .trim()
         .slice(0, max)
    : '';

/* =====================================================================
   POST /upload  — standalone file upload (kept for compatibility)
===================================================================== */
router.post('/upload', protect, (req, res) => {
  _memMulter(req, res, async (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    if (!req.files?.length) return res.status(400).json({ success: false, message: 'No files received' });
    try {
      const attachments = await Promise.all(req.files.map(async (f) => {
        const { url, cloudinaryDuration } = await uploadToCloudinary(f.buffer, f.mimetype, f.originalname);
        return {
          url,
          name:     f.originalname,
          size:     f.size,
          mimeType: f.mimetype,
          ...(cloudinaryDuration != null && { duration: cloudinaryDuration }),
        };
      }));
      res.json({ success: true, attachments });
    } catch (e) {
      console.error('Cloudinary upload error:', e);
      res.status(500).json({ success: false, message: 'Upload failed' });
    }
  });
});

/* =====================================================================
   GET /conversations
===================================================================== */
router.get('/conversations', protect, async (req, res) => {
  try {
    const { archived = 'false' } = req.query;
    const uid = req.user._id;

    const query = { participants: uid };
    if (archived !== 'true') {
      query.archivedBy = { $ne: uid };
    }

    const conversations = await Conversation.find(query)
      .populate('participants', 'username avatar status lastSeen')
      .populate('lastMessage.sender', 'username avatar')
      .sort({ lastActivityAt: -1 })
      .limit(100)
      .lean();

    const formatted = conversations.map((conv) => {
      const otherUser = conv.participants.find(
        (p) => p._id.toString() !== uid.toString()
      );
      const unreadCount = conv.unreadCount?.get
        ? (conv.unreadCount.get(uid.toString()) || 0)
        : (conv.unreadCount?.[uid.toString()] || 0);

      return {
        conversationId: conv.conversationId,
        user:           otherUser,
        lastMessage:    conv.lastMessage,
        unreadCount,
        updatedAt:      conv.updatedAt,
        lastActivityAt: conv.lastActivityAt,
        isPinned: conv.pinnedBy?.some((id) => id.toString() === uid.toString()),
        isMuted: (() => {
          const entry = conv.mutedBy?.get
            ? conv.mutedBy.get(uid.toString())
            : conv.mutedBy?.[uid.toString()];
          if (!entry) return false;
          return !entry.until || entry.until > new Date();
        })(),
        isArchived: conv.archivedBy?.some((id) => id.toString() === uid.toString()),
      };
    });

    // Pinned first, then by lastActivityAt desc
    formatted.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return (
        new Date(b.lastActivityAt || b.updatedAt) -
        new Date(a.lastActivityAt || a.updatedAt)
      );
    });

    res.json({ success: true, conversations: formatted });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ success: false, message: 'Failed to load conversations' });
  }
});

/* =====================================================================
   POST /conversation  — get or create
===================================================================== */
router.post('/conversation', protect, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const uid = req.user._id;
    const conversationId =
      typeof DirectMessage.getConversationId === 'function'
        ? DirectMessage.getConversationId(uid, userId)
        : [uid.toString(), userId.toString()].sort().join('-');

    let conv = await Conversation.findOne({ conversationId })
      .populate('participants', 'username avatar status lastSeen')
      .populate('lastMessage.sender', 'username avatar');

    if (!conv) {
      conv = await Conversation.create({ conversationId, participants: [uid, userId] });
      await conv.populate('participants', 'username avatar status lastSeen');
    }

    const otherUser   = conv.participants.find((p) => p._id.toString() !== uid.toString());
    const unreadCount = conv.unreadCount?.get?.(uid.toString()) || 0;

    res.json({
      success: true,
      conversation: {
        conversationId: conv.conversationId,
        user:           otherUser,
        lastMessage:    conv.lastMessage,
        unreadCount,
        updatedAt:      conv.updatedAt,
      },
    });
  } catch (error) {
    console.error('Get/create conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to get or create conversation' });
  }
});

/* =====================================================================
   GET /conversation/:conversationId  — cursor-based pagination
===================================================================== */
router.get('/conversation/:conversationId', protect, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { cursor, limit = 30, direction = 'before' } = req.query;

    const conv = await Conversation.findOne({
      conversationId,
      participants: req.user._id,
    }).lean();
    if (!conv) return res.status(403).json({ success: false, message: 'Forbidden' });

    const lim = Math.min(parseInt(limit) || 30, 100);
    const uid = req.user._id;

    let cursorQuery = {};
    if (cursor) {
      cursorQuery = direction === 'before'
        ? { _id: { $lt: cursor } }
        : { _id: { $gt: cursor } };
    }

    const messages = await DirectMessage.find({
      conversationId,
      deletedForEveryone: { $ne: true },
      deletedFor:         { $ne: uid },
      ...cursorQuery,
    })
      .populate('sender',   'username avatar')
      .populate('receiver', 'username avatar')
      .sort({ _id: direction === 'before' ? -1 : 1 })
      .limit(lim + 1)
      .lean();

    const hasMore = messages.length > lim;
    if (hasMore) messages.pop();
    if (direction === 'before') messages.reverse();

    const nextCursor = hasMore
      ? (direction === 'before' ? messages[0]?._id : messages[messages.length - 1]?._id)
      : null;

    res.json({
      success: true,
      messages,
      pagination: { nextCursor, hasMore, limit: lim },
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
});

/* =====================================================================
   POST /send
===================================================================== */
router.post(
  '/send',
  protect,
  sendLimiter,
  (req, res, next) => {
    // Extra rate limit for voice messages
    if ((req.body?.type || '') === 'audio') return voiceLimiter(req, res, next);
    next();
  },
  (req, res) => {
    _memMulter(req, res, async (multerErr) => {
      if (multerErr && multerErr.code !== 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ success: false, message: multerErr.message });
      }
      try {
        const body            = req.body || {};
        const receiverId      = body.receiverId;
        const content         = body.content         || '';
        const type            = body.type            || (req.files?.length ? 'image' : 'text');
        const clientMessageId = body.clientMessageId;
        const metadata        = (() => { try { return JSON.parse(body.metadata || '{}'); } catch { return {}; } })();
        const replyTo         = (() => { try { return JSON.parse(body.replyTo  || 'null'); } catch { return null; } })();

        // Upload files
        const fileAttachments = await Promise.all((req.files || []).map(async (f) => {
          const { url, cloudinaryDuration } = await uploadToCloudinary(f.buffer, f.mimetype, f.originalname);
          const isAudio  = f.mimetype.startsWith('audio/');
          const duration = isAudio
            ? (Number(metadata.duration) > 0 ? Math.round(Number(metadata.duration)) : cloudinaryDuration)
            : cloudinaryDuration;
          return {
            url,
            name:     f.originalname,
            size:     f.size,
            mimeType: f.mimetype,
            ...(duration != null && { duration }),
          };
        }));
        const bodyAttachments = (() => {
          try { return JSON.parse(body.attachments || '[]'); } catch { return []; }
        })().filter((a) => a?.url);
        const attachments = [...fileAttachments, ...bodyAttachments].slice(0, 10);

        if (!receiverId) return res.status(400).json({ success: false, message: 'receiverId required' });

        const cleanContent = sanitize(content);
        if (type === 'text' && !cleanContent) {
          return res.status(400).json({ success: false, message: 'Content cannot be empty' });
        }

        const uid            = req.user._id;
        const conversationId =
          typeof DirectMessage.getConversationId === 'function'
            ? DirectMessage.getConversationId(uid, receiverId)
            : [uid.toString(), receiverId.toString()].sort().join('-');

        // Idempotency check
        if (clientMessageId) {
          const existing = await DirectMessage.findOne({ conversationId, clientMessageId })
            .populate('sender receiver', 'username avatar');
          if (existing) return res.json({ success: true, message: existing, duplicate: true });
        }

        // Resolve replyTo snapshot
        let replySnapshot = null;
        if (replyTo?.messageId) {
          try {
            const orig = await DirectMessage.findById(replyTo.messageId)
              .select('content type sender')
              .populate('sender', 'username');
            if (orig) {
              replySnapshot = {
                messageId:      orig._id,
                content:        orig.content?.slice(0, 200),
                senderId:       orig.sender._id,
                senderUsername: orig.sender.username,
                type:           orig.type,
              };
            }
          } catch (_) {}
        }

        const message = await DirectMessage.create({
          conversationId,
          clientMessageId: clientMessageId || undefined,
          sender:          uid,
          receiver:        receiverId,
          content:         cleanContent,
          type,
          attachments:     Array.isArray(attachments) ? attachments.slice(0, 10) : [],
          replyTo:         replySnapshot,
          metadata:        typeof metadata === 'object' ? metadata : {},
          status:          'sent',
          isDelivered:     true,
          deliveredAt:     new Date(),
        });

        await message.populate('sender receiver', 'username avatar');

        // Step 1: upsert conversation
        await Conversation.findOneAndUpdate(
          { conversationId },
          {
            $set: {
              conversationId,
              participants:   [uid, receiverId],
              lastMessage: {
                messageId: message._id,
                content:   cleanContent || `[${type}]`,
                type,
                sender:    uid,
                timestamp: message.createdAt,
              },
              lastActivityAt: new Date(),
            },
            $inc: { [`unreadCount.${receiverId}`]: 1 },
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        // Step 2: un-archive separately
        await Conversation.updateOne(
          { conversationId },
          { $pull: { archivedBy: receiverId } }
        );

        res.json({ success: true, message });
      } catch (error) {
        if (error.code === 11000) {
          const dup = await DirectMessage.findOne({ clientMessageId: req.body.clientMessageId })
            .populate('sender receiver', 'username avatar');
          return res.json({ success: true, message: dup, duplicate: true });
        }
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: 'Failed to send message' });
      }
    });
  }
);

/* =====================================================================
   PUT /read/:conversationId
===================================================================== */
router.put('/read/:conversationId', protect, async (req, res) => {
  try {
    const { conversationId } = req.params;
    const uid = req.user._id;

    await DirectMessage.updateMany(
      { conversationId, receiver: uid, isRead: false },
      { $set: { isRead: true, readAt: new Date(), status: 'read' } }
    );
    await Conversation.findOneAndUpdate(
      { conversationId },
      {
        $set: {
          [`unreadCount.${uid}`]: 0,
          [`lastReadAt.${uid}`]:  new Date(),
        },
      }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

/* =====================================================================
   PUT /batch-read
===================================================================== */
router.put('/batch-read', protect, async (req, res) => {
  try {
    const { conversationIds } = req.body;
    if (!Array.isArray(conversationIds) || !conversationIds.length) {
      return res.status(400).json({ success: false, message: 'conversationIds array required' });
    }
    const uid  = req.user._id;
    const ids  = conversationIds.slice(0, 50);
    const now  = new Date();

    await DirectMessage.updateMany(
      { conversationId: { $in: ids }, receiver: uid, isRead: false },
      { $set: { isRead: true, readAt: now, status: 'read' } }
    );
    await Promise.all(
      ids.map((cid) =>
        Conversation.findOneAndUpdate(
          { conversationId: cid, participants: uid },
          { $set: { [`unreadCount.${uid}`]: 0, [`lastReadAt.${uid}`]: now } }
        )
      )
    );

    res.json({ success: true, updated: ids.length });
  } catch (error) {
    console.error('Batch read error:', error);
    res.status(500).json({ success: false, message: 'Failed to batch mark as read' });
  }
});

/* =====================================================================
   GET /unread-count
===================================================================== */
router.get('/unread-count', protect, async (req, res) => {
  try {
    const uid = req.user._id.toString();
    const conversations = await Conversation.find({ participants: req.user._id })
      .select('conversationId unreadCount')
      .lean();

    let total = 0;
    const byConversation = {};
    conversations.forEach((c) => {
      const count = c.unreadCount?.get
        ? (c.unreadCount.get(uid) || 0)
        : (c.unreadCount?.[uid] || 0);
      total += count;
      if (count > 0) byConversation[c.conversationId] = count;
    });

    res.json({ success: true, total, byConversation });
  } catch (error) {
    console.error('Unread count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get unread count' });
  }
});

/* =====================================================================
   PUT /:messageId  — edit message
===================================================================== */
router.put('/:messageId', protect, async (req, res) => {
  try {
    const { content } = req.body;
    const cleanContent = sanitize(content);
    if (!cleanContent) return res.status(400).json({ success: false, message: 'Content required' });

    const message = await DirectMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!message.canEditOrDelete(req.user._id, 15 * 60 * 1000)) {
      return res.status(403).json({ success: false, message: 'Edit window expired (15 min)' });
    }

    message.editHistory.push({ content: message.content, editedAt: new Date() });
    message.content  = cleanContent;
    message.edited   = true;
    message.editedAt = new Date();
    message.version  = (message.version || 1) + 1;
    await message.save();
    await message.populate('sender receiver', 'username avatar');

    res.json({ success: true, message });
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ success: false, message: 'Failed to edit message' });
  }
});

/* =====================================================================
   DELETE /:messageId  — soft delete
===================================================================== */
router.delete('/:messageId', protect, async (req, res) => {
  try {
    const { everyone = false } = req.query;
    const message = await DirectMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const uid     = req.user._id;
    const isOwner = message.sender.toString() === uid.toString();

    if (everyone === 'true' || everyone === true) {
      if (!isOwner) return res.status(403).json({ success: false, message: 'Not authorized' });
      if (!message.canEditOrDelete(uid, 60 * 60 * 1000)) {
        return res.status(403).json({ success: false, message: 'Delete for everyone window expired (1 hour)' });
      }
      message.deletedForEveryone = true;
      message.content            = '';
      message.attachments        = [];
      await message.save();
      return res.json({ success: true, deletedForEveryone: true });
    }

    if (!message.deletedFor.includes(uid)) {
      message.deletedFor.push(uid);
      await message.save();
    }
    res.json({ success: true, deletedForMe: true });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete message' });
  }
});

/* =====================================================================
   POST /:messageId/react  — add emoji reaction
===================================================================== */
router.post('/:messageId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, message: 'emoji required' });

    const VALID_EMOJI = /^(\p{Emoji}|\p{Emoji_Presentation}){1,4}$/u;
    if (!VALID_EMOJI.test(emoji)) return res.status(400).json({ success: false, message: 'Invalid emoji' });

    const message = await DirectMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const uid      = req.user._id;
    const existing = message.reactions.find((r) => r.emoji === emoji);
    if (existing) {
      if (!existing.userIds.some((id) => id.toString() === uid.toString())) {
        existing.userIds.push(uid);
      }
    } else {
      if (message.reactions.length >= 8) {
        return res.status(400).json({ success: false, message: 'Max 8 reaction types per message' });
      }
      message.reactions.push({ emoji, userIds: [uid] });
    }
    await message.save();
    res.json({ success: true, reactions: message.reactions });
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ success: false, message: 'Failed to add reaction' });
  }
});

/* =====================================================================
   DELETE /:messageId/react  — remove reaction
===================================================================== */
router.delete('/:messageId/react', protect, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) return res.status(400).json({ success: false, message: 'emoji required' });

    const message = await DirectMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const uid   = req.user._id;
    const entry = message.reactions.find((r) => r.emoji === emoji);
    if (entry) {
      entry.userIds = entry.userIds.filter((id) => id.toString() !== uid.toString());
      if (entry.userIds.length === 0) {
        message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
      }
      await message.save();
    }
    res.json({ success: true, reactions: message.reactions });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove reaction' });
  }
});

/* =====================================================================
   POST /:messageId/star  — toggle star
===================================================================== */
router.post('/:messageId/star', protect, async (req, res) => {
  try {
    const message = await DirectMessage.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const uid = req.user._id;
    const idx = message.starredBy.findIndex((id) => id.toString() === uid.toString());
    let starred;
    if (idx >= 0) {
      message.starredBy.splice(idx, 1);
      starred = false;
    } else {
      message.starredBy.push(uid);
      starred = true;
    }
    await message.save();
    res.json({ success: true, starred });
  } catch (error) {
    console.error('Star message error:', error);
    res.status(500).json({ success: false, message: 'Failed to star message' });
  }
});

/* =====================================================================
   GET /starred  — all starred messages
===================================================================== */
router.get('/starred', protect, async (req, res) => {
  try {
    const uid      = req.user._id;
    const messages = await DirectMessage.find({
      starredBy:          uid,
      deletedForEveryone: { $ne: true },
      deletedFor:         { $ne: uid },
    })
      .populate('sender receiver', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ success: true, messages });
  } catch (error) {
    console.error('Get starred messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to get starred messages' });
  }
});

/* =====================================================================
   GET /search  — full-text search
===================================================================== */
router.get('/search', protect, searchLimiter, async (req, res) => {
  try {
    const { query, conversationId } = req.query;
    if (!query) return res.status(400).json({ success: false, message: 'query required' });

    const uid = req.user._id;
    const filter = {
      $or: [{ sender: uid }, { receiver: uid }],
      deletedForEveryone: { $ne: true },
      deletedFor:         { $ne: uid },
    };
    if (conversationId) filter.conversationId = conversationId;
    filter.content = {
      $regex:   query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      $options: 'i',
    };

    const messages = await DirectMessage.find(filter)
      .populate('sender receiver', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, messages, count: messages.length });
  } catch (error) {
    console.error('Search messages error:', error);
    res.status(500).json({ success: false, message: 'Failed to search messages' });
  }
});

/* =====================================================================
   PATCH /conversations/:conversationId/pin  — toggle pin
===================================================================== */
router.patch('/conversations/:conversationId/pin', protect, async (req, res) => {
  try {
    const uid  = req.user._id;
    const conv = await Conversation.findOne({
      conversationId: req.params.conversationId,
      participants:   uid,
    });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const pinned = conv.isPinnedFor(uid);
    if (pinned) {
      conv.pinnedBy = conv.pinnedBy.filter((id) => id.toString() !== uid.toString());
    } else {
      conv.pinnedBy.push(uid);
    }
    await conv.save();
    res.json({ success: true, pinned: !pinned });
  } catch (error) {
    console.error('Pin conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to pin conversation' });
  }
});

/* =====================================================================
   PATCH /conversations/:conversationId/mute  — mute/unmute
===================================================================== */
router.patch('/conversations/:conversationId/mute', protect, async (req, res) => {
  try {
    const { duration } = req.body;
    const uid          = req.user._id.toString();

    if (duration === 'unmute') {
      await Conversation.findOneAndUpdate(
        { conversationId: req.params.conversationId, participants: req.user._id },
        { $unset: { [`mutedBy.${uid}`]: '' } }
      );
      return res.json({ success: true, muted: false });
    }

    const until = duration === 'hour' ? new Date(Date.now() + 3_600_000)
      : duration === 'day'  ? new Date(Date.now() + 86_400_000)
      : duration === 'week' ? new Date(Date.now() + 604_800_000)
      : null;

    await Conversation.findOneAndUpdate(
      { conversationId: req.params.conversationId, participants: req.user._id },
      { $set: { [`mutedBy.${uid}`]: { until } } }
    );
    res.json({ success: true, muted: true, until });
  } catch (error) {
    console.error('Mute conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to mute conversation' });
  }
});

/* =====================================================================
   PATCH /conversations/:conversationId/archive  — toggle archive
===================================================================== */
router.patch('/conversations/:conversationId/archive', protect, async (req, res) => {
  try {
    const uid  = req.user._id;
    const conv = await Conversation.findOne({
      conversationId: req.params.conversationId,
      participants:   uid,
    });
    if (!conv) return res.status(404).json({ success: false, message: 'Conversation not found' });

    const archived = conv.isArchivedFor(uid);
    if (archived) {
      conv.archivedBy = conv.archivedBy.filter((id) => id.toString() !== uid.toString());
    } else {
      conv.archivedBy.push(uid);
    }
    await conv.save();
    res.json({ success: true, archived: !archived });
  } catch (error) {
    console.error('Archive conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to archive conversation' });
  }
});

/* =====================================================================
   DELETE /conversations/:conversationId  — clear for me
===================================================================== */
router.delete('/conversations/:conversationId', protect, async (req, res) => {
  try {
    const uid = req.user._id;
    await DirectMessage.updateMany(
      { conversationId: req.params.conversationId, deletedFor: { $ne: uid } },
      { $push: { deletedFor: uid } }
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Delete conversation error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete conversation' });
  }
});

/* =====================================================================
   POST /forward  — forward one or many messages to DM users and/or groups
   Body: { messageId?, messageIds?, recipients: string[], groupIds?: string[] }
===================================================================== */
router.post('/forward', protect, forwardLimiter, forwardMessage);

export default router;