/**
 * directMessageSocket.js
 * Enterprise-grade DM socket handlers.
 * Backward compatible with: new-direct-message, typing-direct, stopped-typing-direct
 * New events: message:new, message:edit, message:delete, message:reaction,
 *             conversation:typing, message:delivered, message:read,
 *             presence-update-direct, batch-read-update-direct
 */

import DirectMessage from '../models/DirectMessage.js';
import Conversation  from '../models/Conversation.js';

/* ─── In-memory typing state ─────────────────────────────────────────────── */
const typingState = new Map(); // Map<conversationId, Map<userId, { username, timer }>>

/* ─── Dedup store (replace with Redis in production) ─────────────────────── */
const sentMessages = new Map(); // Map<clientMessageId, { message, ts }>
const DEDUP_TTL_MS = 60_000;

setInterval(() => {
  const cutoff = Date.now() - DEDUP_TTL_MS;
  for (const [key, val] of sentMessages.entries()) {
    if (val.ts < cutoff) sentMessages.delete(key);
  }
}, 30_000);

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId.toString()}`).emit(event, data);
};

const clearTyping = (io, conversationId, userId, username) => {
  const convTyping = typingState.get(conversationId);
  if (!convTyping?.has(userId)) return;

  const entry = convTyping.get(userId);
  if (entry?.timer) clearTimeout(entry.timer);
  convTyping.delete(userId);

  if (convTyping.size === 0) typingState.delete(conversationId);

  // Emit legacy stopped-typing
  io.to(`conv:${conversationId}`).emit('user-stopped-typing-direct', { conversationId, userId, username });
  // Emit new-style
  io.to(`conv:${conversationId}`).emit('conversation:typing', {
    conversationId, userId, username, isTyping: false,
  });
};

async function getParticipants(conversationId) {
  const conv = await Conversation.findOne({ conversationId }).select('participants').lean();
  return (conv?.participants || []).map((p) => p.toString());
}

/* ─── Main registration ───────────────────────────────────────────────────── */
export const registerDMHandlers = (io, socket) => {
  // userId set by handlers.js after user-online resolves
  const getUserId = () => socket.userId;

  /* ── Join personal room ─────────────────────────────────────────────────── */
  const joinPersonalRoom = () => {
    const uid = getUserId();
    if (uid) socket.join(`user:${uid}`);
  };
  // Called immediately if userId already set, also idempotent
  joinPersonalRoom();

  /* ══════════════════════════════════════════════════════════════════════════
     BACKWARD-COMPAT: send-direct-message (legacy client emit)
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('send-direct-message', async ({ message, receiverId }) => {
    if (!message || !receiverId) return;
    // Relay to recipient using the new-direct-message event (legacy + new)
    emitToUser(io, receiverId, 'new-direct-message', message);
    // Also emit conversation update to recipient
    emitToUser(io, receiverId, 'message:new', {
      message,
      conversationId: message.conversationId,
    });
    // Update delivery status
    try {
      if (message._id) {
        await DirectMessage.findByIdAndUpdate(message._id, {
          $set: { status: 'delivered', isDelivered: true, deliveredAt: new Date() },
        });
        const recipientOnline = io.sockets.adapter.rooms.get(`user:${receiverId}`);
        if (recipientOnline?.size > 0) {
          emitToUser(io, message.sender?._id || getUserId(), 'message:delivered', {
            messageId:      message._id,
            conversationId: message.conversationId,
            deliveredTo:    receiverId,
            deliveredAt:    new Date(),
          });
        }
      }
    } catch (_) {}
  });

  /* ══════════════════════════════════════════════════════════════════════════
     BACKWARD-COMPAT: typing-direct / stopped-typing-direct
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('typing-direct', ({ conversationId, userId: emitUserId }) => {
    const uid = emitUserId || getUserId();
    if (!conversationId || !uid) return;
    socket.to(`conv:${conversationId}`).emit('user-typing-direct', { conversationId, userId: uid });
  });

  socket.on('stopped-typing-direct', ({ conversationId, userId: emitUserId }) => {
    const uid = emitUserId || getUserId();
    if (!conversationId || !uid) return;
    socket.to(`conv:${conversationId}`).emit('user-stopped-typing-direct', { conversationId, userId: uid });
  });

  /* ══════════════════════════════════════════════════════════════════════════
     BACKWARD-COMPAT: message-read-direct
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('message-read-direct', ({ conversationId, readBy }) => {
    const uid = readBy || getUserId();
    if (!conversationId || !uid) return;
    socket.to(`conv:${conversationId}`).emit('batch-read-update-direct', {
      conversationId, readBy: uid, readAt: new Date(),
    });
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: message:send  (preferred over REST for real-time optimistic flow)
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('message:send', async (payload, ack) => {
    try {
      const uid = getUserId();
      if (!uid) return ack?.({ success: false, error: 'Not authenticated' });

      const {
        conversationId, receiverId, content, type = 'text',
        attachments = [], replyTo = null, clientMessageId,
        metadata = {}, tempId,
      } = payload || {};

      if (!conversationId || !receiverId) {
        return ack?.({ success: false, error: 'Missing conversationId or receiverId' });
      }

      // Idempotency
      if (clientMessageId) {
        const cached = sentMessages.get(clientMessageId);
        if (cached) return ack?.({ success: true, message: cached.message, duplicate: true, tempId });
      }

      const cleanContent = typeof content === 'string'
        ? content.replace(/<[^>]+>/g, '').trim().slice(0, 65536)
        : '';

      if (type === 'text' && !cleanContent) {
        return ack?.({ success: false, error: 'Content cannot be empty' });
      }

      // Reply snapshot
      let replySnapshot = null;
      if (replyTo?.messageId) {
        try {
          const orig = await DirectMessage.findById(replyTo.messageId)
            .select('content type sender').populate('sender', 'username');
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

      let message;
      try {
        message = await DirectMessage.create({
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
      } catch (dbErr) {
        if (dbErr.code === 11000) {
          const dup = await DirectMessage.findOne({ conversationId, clientMessageId })
            .populate('sender receiver', 'username avatar');
          return ack?.({ success: true, message: dup, duplicate: true, tempId });
        }
        throw dbErr;
      }

      await message.populate('sender receiver', 'username avatar');

      if (clientMessageId) sentMessages.set(clientMessageId, { message, ts: Date.now() });

      await Conversation.findOneAndUpdate(
        { conversationId },
        {
          $set: {
            conversationId,
            participants:   [uid, receiverId],
            lastMessage: {
              messageId: message._id,
              content:   cleanContent || `[${type}]`,
              type, sender: uid,
              timestamp: message.createdAt,
            },
            lastActivityAt: new Date(),
          },
          $inc:  { [`unreadCount.${receiverId}`]: 1 },
          $pull: { archivedBy: receiverId },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      clearTyping(io, conversationId, uid, socket.username || '');

      // ACK sender with confirmed message
      ack?.({ success: true, message, tempId });

      // Deliver to recipient — both legacy and new events
      emitToUser(io, receiverId, 'new-direct-message', message);
      emitToUser(io, receiverId, 'message:new', { message, conversationId });

      // Delivery confirmation if recipient is online
      const recipientRoom = io.sockets.adapter.rooms.get(`user:${receiverId}`);
      if (recipientRoom?.size > 0) {
        emitToUser(io, uid, 'message:delivered', {
          messageId: message._id, conversationId, deliveredTo: receiverId, deliveredAt: new Date(),
        });
      }

    } catch (error) {
      console.error('[DM] message:send error:', error);
      ack?.({ success: false, error: 'Failed to send message' });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: message:edit
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('message:edit', async (payload, ack) => {
    try {
      const uid = getUserId();
      const { messageId, content, conversationId } = payload || {};
      if (!messageId || !content) return ack?.({ success: false, error: 'Missing fields' });

      const message = await DirectMessage.findById(messageId);
      if (!message) return ack?.({ success: false, error: 'Message not found' });
      if (message.sender.toString() !== uid.toString()) return ack?.({ success: false, error: 'Not authorized' });
      if (!message.canEditOrDelete(uid, 15 * 60 * 1000)) return ack?.({ success: false, error: 'Edit window expired' });

      message.editHistory.push({ content: message.content, editedAt: new Date() });
      message.content  = content.replace(/<[^>]+>/g, '').trim().slice(0, 65536);
      message.edited   = true;
      message.editedAt = new Date();
      message.version  = (message.version || 1) + 1;
      await message.save();
      await message.populate('sender receiver', 'username avatar');

      ack?.({ success: true, message });

      const recipientId = message.receiver.toString() === uid.toString()
        ? message.sender.toString()
        : message.receiver.toString();

      // Legacy event
      emitToUser(io, recipientId, 'message-edited-direct', {
        messageId, conversationId: message.conversationId,
        content: message.content, editedAt: message.editedAt,
      });
      // New event
      emitToUser(io, recipientId, 'message:edit', {
        messageId, conversationId: message.conversationId,
        content: message.content, editedAt: message.editedAt, version: message.version,
      });

    } catch (error) {
      console.error('[DM] message:edit error:', error);
      ack?.({ success: false, error: 'Edit failed' });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: message:delete
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('message:delete', async (payload, ack) => {
    try {
      const uid = getUserId();
      const { messageId, everyone = false } = payload || {};
      if (!messageId) return ack?.({ success: false, error: 'Missing messageId' });

      const message = await DirectMessage.findById(messageId);
      if (!message) return ack?.({ success: false, error: 'Message not found' });

      const isOwner = message.sender.toString() === uid.toString();

      if (everyone) {
        if (!isOwner) return ack?.({ success: false, error: 'Not authorized' });
        if (!message.canEditOrDelete(uid, 60 * 60 * 1000)) {
          return ack?.({ success: false, error: 'Delete-for-everyone window expired' });
        }
        message.deletedForEveryone = true;
        message.content            = '';
        message.attachments        = [];
        await message.save();

        ack?.({ success: true });
        const participants = await getParticipants(message.conversationId);
        participants.forEach((pid) => {
          emitToUser(io, pid, 'message-deleted-direct', {
            messageId, conversationId: message.conversationId, deletedForEveryone: true,
          });
          emitToUser(io, pid, 'message:delete', {
            messageId, conversationId: message.conversationId, deletedForEveryone: true,
          });
        });
      } else {
        if (!message.deletedFor.includes(uid)) {
          message.deletedFor.push(uid);
          await message.save();
        }
        ack?.({ success: true, deletedForMe: true });
      }
    } catch (error) {
      console.error('[DM] message:delete error:', error);
      ack?.({ success: false, error: 'Delete failed' });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: message:reaction:add / remove
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('message:reaction:add', async (payload, ack) => {
    try {
      const uid = getUserId();
      const { messageId, emoji } = payload || {};
      if (!messageId || !emoji) return ack?.({ success: false, error: 'Missing fields' });

      const VALID_EMOJI = /^(\p{Emoji}|\p{Emoji_Presentation}){1,4}$/u;
      if (!VALID_EMOJI.test(emoji)) return ack?.({ success: false, error: 'Invalid emoji' });

      const message = await DirectMessage.findById(messageId);
      if (!message || message.deletedForEveryone) return ack?.({ success: false, error: 'Message not found' });

      const existing = message.reactions.find((r) => r.emoji === emoji);
      if (existing) {
        if (!existing.userIds.some((id) => id.toString() === uid.toString())) {
          existing.userIds.push(uid);
        }
      } else {
        if (message.reactions.length >= 8) return ack?.({ success: false, error: 'Max reaction types reached' });
        message.reactions.push({ emoji, userIds: [uid] });
      }
      await message.save();

      ack?.({ success: true, reactions: message.reactions });

      const participants = await getParticipants(message.conversationId);
      participants.forEach((pid) => {
        emitToUser(io, pid, 'message-reaction-direct', {
          messageId, conversationId: message.conversationId,
          reactions: message.reactions, actorId: uid, emoji, action: 'add',
        });
        emitToUser(io, pid, 'message:reaction', {
          messageId, conversationId: message.conversationId,
          reactions: message.reactions, actorId: uid, emoji, action: 'add',
        });
      });
    } catch (error) {
      console.error('[DM] reaction:add error:', error);
      ack?.({ success: false, error: 'Reaction failed' });
    }
  });

  socket.on('message:reaction:remove', async (payload, ack) => {
    try {
      const uid = getUserId();
      const { messageId, emoji } = payload || {};
      const message = await DirectMessage.findById(messageId);
      if (!message) return ack?.({ success: false, error: 'Message not found' });

      const entry = message.reactions.find((r) => r.emoji === emoji);
      if (entry) {
        entry.userIds = entry.userIds.filter((id) => id.toString() !== uid.toString());
        if (entry.userIds.length === 0) {
          message.reactions = message.reactions.filter((r) => r.emoji !== emoji);
        }
        await message.save();
      }

      ack?.({ success: true, reactions: message.reactions });

      const participants = await getParticipants(message.conversationId);
      participants.forEach((pid) => {
        emitToUser(io, pid, 'message-reaction-direct', {
          messageId, conversationId: message.conversationId,
          reactions: message.reactions, actorId: uid, emoji, action: 'remove',
        });
        emitToUser(io, pid, 'message:reaction', {
          messageId, conversationId: message.conversationId,
          reactions: message.reactions, actorId: uid, emoji, action: 'remove',
        });
      });
    } catch (error) {
      console.error('[DM] reaction:remove error:', error);
      ack?.({ success: false, error: 'Remove reaction failed' });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: message:read
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('message:read', async (payload) => {
    try {
      const uid = getUserId();
      const { conversationId, lastMessageId } = payload || {};
      if (!conversationId || !uid) return;

      const now = new Date();
      const updateResult = await DirectMessage.updateMany(
        { conversationId, receiver: uid, status: { $in: ['sent', 'delivered'] }, deletedForEveryone: { $ne: true } },
        { $set: { status: 'read', readAt: now, isRead: true } }
      );

      await Conversation.findOneAndUpdate(
        { conversationId },
        { $set: { [`unreadCount.${uid}`]: 0, [`lastReadAt.${uid}`]: now } }
      );

      // Always notify the sender, even if modifiedCount === 0.
      // Reason: the client fires both REST markAsRead AND this socket event at the same
      // time. The REST call usually wins the race and updates the DB first, making
      // modifiedCount === 0 here — which used to silently skip the notification and
      // leave the sender's ticks permanently grey.
      const conv = await Conversation.findOne({ conversationId }).select('participants').lean();
      const senderId = conv?.participants?.find((p) => p.toString() !== uid.toString())?.toString();
      if (senderId) {
        emitToUser(io, senderId, 'message:read', { conversationId, readBy: uid, readAt: now, lastMessageId });
        emitToUser(io, senderId, 'batch-read-update-direct', { conversationId, readBy: uid, readAt: now });
      }
    } catch (error) {
      console.error('[DM] message:read error:', error);
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: conversation:join / leave
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('conversation:join', async (payload) => {
    try {
      const uid = getUserId();
      const { conversationId } = payload || {};
      if (!conversationId || !uid) return;
      const conv = await Conversation.findOne({ conversationId, participants: uid }).lean();
      if (!conv) return;
      socket.join(`conv:${conversationId}`);
    } catch (_) {}
  });

  socket.on('conversation:leave', ({ conversationId }) => {
    if (conversationId) socket.leave(`conv:${conversationId}`);
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: conversation:typing  (debounced by client)
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('conversation:typing', async (payload) => {
    try {
      const uid = getUserId();
      const { conversationId, isTyping, username } = payload || {};
      if (!conversationId || !uid) return;

      if (!isTyping) {
        clearTyping(io, conversationId, uid, username || '');
        return;
      }

      const convTyping = typingState.get(conversationId) || new Map();
      const existing   = convTyping.get(uid);
      if (existing?.timer) clearTimeout(existing.timer);

      const timer = setTimeout(() => clearTyping(io, conversationId, uid, username || ''), 5000);
      convTyping.set(uid, { username: username || '', timer });
      typingState.set(conversationId, convTyping);

      const conv = await Conversation.findOne({ conversationId, participants: uid }).select('participants').lean();
      if (!conv) return;

      conv.participants.forEach((p) => {
        if (p.toString() !== uid.toString()) {
          emitToUser(io, p.toString(), 'user-typing-direct', { conversationId, userId: uid });
          emitToUser(io, p.toString(), 'conversation:typing', {
            conversationId, userId: uid, username: username || '', isTyping: true,
          });
        }
      });
    } catch (error) {
      console.error('[DM] conversation:typing error:', error);
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: conversation:pin / mute / archive (socket shortcuts for instant feedback)
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('conversation:pin', async ({ conversationId }, ack) => {
    try {
      const uid  = getUserId();
      const conv = await Conversation.findOne({ conversationId, participants: uid });
      if (!conv) return ack?.({ success: false });
      const pinned = conv.isPinnedFor(uid);
      if (pinned) {
        conv.pinnedBy = conv.pinnedBy.filter((id) => id.toString() !== uid.toString());
      } else {
        conv.pinnedBy.push(uid);
      }
      await conv.save();
      ack?.({ success: true, pinned: !pinned });
      emitToUser(io, uid, 'conversation-pinned', { conversationId, pinned: !pinned });
    } catch (_) {
      ack?.({ success: false });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════════
     NEW: presence-update-direct  — emit to conversation partner on connect
  ══════════════════════════════════════════════════════════════════════════ */
  socket.on('presence:subscribe', async ({ conversationId }) => {
    try {
      const uid  = getUserId();
      if (!uid || !conversationId) return;
      const conv = await Conversation.findOne({ conversationId, participants: uid })
        .select('participants').lean();
      if (!conv) return;
      const otherId = conv.participants.find((p) => p.toString() !== uid.toString())?.toString();
      if (!otherId) return;
      emitToUser(io, otherId, 'presence-update-direct', {
        userId: uid, status: 'online', conversationId,
      });
    } catch (_) {}
  });
};

/* ─── Cleanup on disconnect ─────────────────────────────────────────────── */
export const cleanupDMUser = (io, userId) => {
  for (const [convId, convTyping] of typingState.entries()) {
    if (convTyping.has(userId)) {
      const entry = convTyping.get(userId);
      if (entry?.timer) clearTimeout(entry.timer);
      convTyping.delete(userId);
      if (convTyping.size === 0) typingState.delete(convId);

      io.to(`conv:${convId}`).emit('user-stopped-typing-direct', {
        conversationId: convId, userId, username: entry?.username || '', isTyping: false,
      });
      io.to(`conv:${convId}`).emit('conversation:typing', {
        conversationId: convId, userId, username: entry?.username || '', isTyping: false,
      });
    }
  }

  // Broadcast offline presence to all DM partners listening
  io.emit('presence-update-direct', { userId, status: 'offline' });
};