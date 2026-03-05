/**
 * server/controllers/forwardMessage.js
 *
 * Fixes vs previous version:
 *  1. toObjectId() — coerces string IDs so Mongoose queries never silently miss
 *  2. updateConversation() — reads current unreadCount before writing so it
 *     works with BOTH Map-typed and plain-Object schemas (the old $inc on a Map
 *     field caused the 500)
 *  3. findOrCreateConversation() — handles duplicate-key race via err.code 11000
 *  4. Every per-message/per-recipient step is wrapped in try/catch so one bad
 *     recipient never aborts the whole batch
 *  5. Group forwarding uses dynamic import — 404 on /api/groups never reaches here
 */

import mongoose      from 'mongoose';
import DirectMessage from '../models/DirectMessage.js';
import Conversation  from '../models/Conversation.js';

/* ── helpers ─────────────────────────────────────────────────────────────── */

const getConvId = (a, b) => [a.toString(), b.toString()].sort().join('-');

const toObjectId = (v) => {
  try   { return new mongoose.Types.ObjectId(String(v)); }
  catch { return v; }
};

const findOrCreateConversation = async (senderId, recipientId) => {
  const convId = getConvId(senderId, recipientId);
  let conv;
  try {
    conv = await Conversation.findOne({ conversationId: convId });
    if (!conv) {
      conv = await Conversation.create({
        conversationId: convId,
        participants:   [toObjectId(senderId), toObjectId(recipientId)],
      });
    }
  } catch (err) {
    // Race condition — another request created it simultaneously
    if (err.code === 11000) {
      conv = await Conversation.findOne({ conversationId: convId });
    } else {
      throw err;
    }
  }
  return { conv, convId };
};

const cloneMessage = async ({ original, senderId, receiverId, conversationId }) => {
  // Generate a unique clientMessageId for every clone.
  //
  // WHY THIS IS REQUIRED:
  //   The DirectMessage schema has a unique compound index on
  //   { conversationId, clientMessageId }.  When clientMessageId is omitted
  //   Mongoose writes it as `null`, and MongoDB treats every null as equal —
  //   so the second forward to the same conversation hits E11000.
  //
  //   Forwarded messages don't come from a client so they have no natural
  //   clientMessageId.  We generate one here to satisfy the unique constraint
  //   without touching the schema or the index.
  const clientMessageId = `fwd_${original._id}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  return DirectMessage.create({
    conversationId,
    clientMessageId,                        // ← unique per clone; never null
    sender:   toObjectId(senderId),
    receiver: toObjectId(receiverId),
    content:     original.content     || '',
    type:        original.type        || 'text',
    attachments: original.attachments || [],
    metadata:    original.metadata    || {},
    forwarded:      true,
    forwardCount:   (original.forwardCount || 0) + 1,
    originalSender: original.sender,
    forwardedFrom: {
      messageId:      original._id,
      senderId:       original.sender,
      conversationId: original.conversationId,
    },
    status:      'sent',
    isDelivered: true,
    deliveredAt: new Date(),
    isRead:      false,
  });
};

/**
 * updateConversation
 *
 * KEY FIX: the original code used $inc on `unreadCount.<userId>`.
 * When the Conversation schema defines `unreadCount` as a Mongoose Map,
 * $inc on a dotted path works fine in MongoDB but Mongoose's strict-mode
 * validation can reject it — causing the 500.
 *
 * Solution: read the current value first, then $set the new value.
 * This is safe under low concurrency (chat forwarding) and avoids the
 * Map vs plain-Object conflict entirely.
 */
const updateConversation = async ({ conversationId, message, senderId, recipientId }) => {
  const rStr   = recipientId.toString();
  const lastMsg = {
    messageId: message._id,
    content:   message.content || `[${message.type || 'message'}]`,
    type:      message.type    || 'text',
    sender:    toObjectId(senderId),
    timestamp: message.createdAt,
  };

  try {
    const current   = await Conversation.findOne({ conversationId }).lean();
    const rawUnread = current?.unreadCount;
    // Support both serialised Map objects (key→value pairs) and plain objects
    const prevUnread = !rawUnread ? 0
      : typeof rawUnread.get === 'function'
        ? (rawUnread.get(rStr)  || 0)
        : (rawUnread[rStr]      || 0);

    await Conversation.updateOne(
      { conversationId },
      {
        $set: {
          lastMessage:                    lastMsg,
          lastActivityAt:                 new Date(),
          [`unreadCount.${rStr}`]:        prevUnread + 1,
        },
      }
    );
  } catch (err) {
    // Fallback — at minimum persist lastMessage so the sidebar updates
    console.warn('[forwardMessage] unreadCount update failed, fallback:', err.message);
    try {
      await Conversation.updateOne(
        { conversationId },
        { $set: { lastMessage: lastMsg, lastActivityAt: new Date() } }
      );
    } catch (_) {}
  }

  // Un-archive — fire and forget; never blocks the HTTP response
  Conversation.updateOne(
    { conversationId },
    { $pull: { archivedBy: toObjectId(recipientId) } }
  ).catch(() => {});
};

const emitToAll = ({ io, userId, conversationId, payload }) => {
  if (!io) return;
  const id = userId.toString();
  try {
    // ── Method 1: room-based emit (all naming conventions) ─────────────────
    // Covers servers that call socket.join(userId) or socket.join('user:'+userId)
    io.to(id).emit('new-direct-message', payload);
    io.to('user:' + id).emit('new-direct-message', payload);
    io.to(conversationId).emit('new-direct-message', payload);

    // ── Method 2: direct socket targeting ──────────────────────────────────
    // Many apps track userId → socketId in a Map instead of using named rooms.
    // This iterates ALL connected sockets in the default namespace and emits
    // directly to any socket whose userId matches — works regardless of how
    // the socket server stores or names user sessions.
    const allSockets = io.sockets && io.sockets.sockets;
    if (allSockets && typeof allSockets.forEach === 'function') {
      allSockets.forEach((socket) => {
        try {
          // Check every common location where servers attach userId to socket
          const socketUserId = (
            socket.userId            ??   // most common: socket.userId = req.user._id
            socket.user?._id         ??   // socket.user = { _id, username, ... }
            socket.data?.userId      ??   // socket.io v4 socket.data namespace
            socket.data?.user?._id   ??
            socket.handshake?.auth?.userId ??   // passed in handshake auth
            socket.handshake?.query?.userId     // passed as query param
          );
          if (socketUserId && socketUserId.toString() === id) {
            socket.emit('new-direct-message', payload);
          }
        } catch (_) { /* never let one bad socket abort the loop */ }
      });
    }
  } catch (err) {
    console.warn('[forwardMessage] socket emit failed:', err.message);
  }
};

/* ── main controller ─────────────────────────────────────────────────────── */

export const forwardMessage = async (req, res) => {
  try {
    const senderId = req.user._id;
    const { messageId, messageIds, recipients = [], groupIds = [] } = req.body;

    /* 1 — normalise message list */
    const rawIds = Array.isArray(messageIds) && messageIds.length
      ? messageIds
      : messageId ? [messageId] : [];

    if (!rawIds.length)
      return res.status(400).json({ success: false, message: 'messageId or messageIds is required' });
    if (rawIds.length > 10)
      return res.status(400).json({ success: false, message: 'Cannot forward more than 10 messages at once' });

    /* 2 — normalise recipients */
    const dmRecipients = (Array.isArray(recipients) ? recipients : [])
      .filter((id) => id && id.toString() !== senderId.toString());
    const gIds = Array.isArray(groupIds) ? groupIds : [];

    if (!dmRecipients.length && !gIds.length)
      return res.status(400).json({ success: false, message: 'At least one recipient or group is required' });
    if (dmRecipients.length + gIds.length > 20)
      return res.status(400).json({ success: false, message: 'Cannot forward to more than 20 targets at once' });

    /* 3 — fetch originals (string IDs coerced to ObjectId) */
    const objectIds = rawIds.map(toObjectId);
    const originals = await DirectMessage.find({ _id: { $in: objectIds } }).lean();
    if (!originals.length)
      return res.status(404).json({ success: false, message: 'No messages found' });

    /* 4 — authorise: sender must be participant in each source conversation */
    const uniqueConvIds = [...new Set(originals.map((m) => m.conversationId))];
    const convDocs      = await Conversation.find({ conversationId: { $in: uniqueConvIds } }).lean();
    const convMap       = new Map(convDocs.map((c) => [c.conversationId, c]));

    for (const orig of originals) {
      if (orig.deletedForEveryone)
        return res.status(400).json({ success: false, message: `Message ${orig._id} was deleted and cannot be forwarded` });
      const conv = convMap.get(orig.conversationId);
      // If conversation doc is missing (migrated data), allow forward
      if (conv) {
        const ok = conv.participants?.some((p) => p?.toString() === senderId.toString());
        if (!ok)
          return res.status(403).json({ success: false, message: `Not authorised to forward message ${orig._id}` });
      }
    }

    const io        = req.app.get('io');
    const forwarded = [];

    /* 5a — forward to DM recipients */
    for (const recipientId of dmRecipients) {
      let convId;
      try {
        const r = await findOrCreateConversation(senderId, recipientId);
        convId  = r.convId;
      } catch (err) {
        console.error('[forwardMessage] conversation error for', recipientId, ':', err.message);
        continue; // skip this recipient, keep going for others
      }

      for (const original of originals) {
        let newMsg;
        try {
          newMsg = await cloneMessage({ original, senderId, receiverId: recipientId, conversationId: convId });
        } catch (err) {
          console.error('[forwardMessage] clone error:', err.message);
          continue;
        }

        // Increment original's forwardCount — non-blocking, never stalls response
        DirectMessage.findByIdAndUpdate(original._id, { $inc: { forwardCount: 1 } }).catch(() => {});

        try { await newMsg.populate('sender', 'username avatar'); } catch (_) {}

        await updateConversation({ conversationId: convId, message: newMsg, senderId, recipientId });

        // Build payload with forwarded fields spelled out explicitly.
        // Object.assign(toObject()) can silently drop Mongoose fields during
        // JSON serialisation, causing forwarded/forwardCount to arrive as
        // undefined at the client and the "Forwarded" label to never render.
        var baseMsg = newMsg.toObject();
        var msgPayload = Object.assign({}, baseMsg, {
          forwarded:      true,
          forwardCount:   baseMsg.forwardCount   || 1,
          forwardedFrom:  baseMsg.forwardedFrom  || null,
          originalSender: baseMsg.originalSender || null,
          sender: { _id: req.user._id, username: req.user.username, avatar: req.user.avatar },
        });
        emitToAll({ io: io, userId: recipientId, conversationId: convId, payload: msgPayload });
        emitToAll({ io: io, userId: senderId,    conversationId: convId, payload: msgPayload });

        forwarded.push(newMsg);
      }
    }

    /* 5b — forward to group chats (best-effort, dynamic import) */
    if (gIds.length) {
      try {
        const [GMMod, GMod] = await Promise.all([
          import('../models/GroupMessage.js').catch(() => null),
          import('../models/Group.js').catch(() => null),
        ]);
        const GroupMessage = GMMod?.default;
        const Group        = GMod?.default;

        if (GroupMessage && Group) {
          for (const groupId of gIds) {
            try {
              const group = await Group.findById(groupId).lean();
              if (!group) continue;

              const isMember = group.members?.some(
                (m) => (m.user || m)?.toString() === senderId.toString()
              );
              if (!isMember) continue;

              for (const original of originals) {
                try {
                  const newMsg = await GroupMessage.create({
                    groupId,
                    sender:       toObjectId(senderId),
                    content:      original.content     || '',
                    type:         original.type        || 'text',
                    attachments:  original.attachments || [],
                    metadata:     original.metadata    || {},
                    forwarded:    true,
                    forwardCount: (original.forwardCount || 0) + 1,
                    originalSender: original.sender,
                    forwardedFrom: {
                      messageId:      original._id,
                      senderId:       original.sender,
                      conversationId: original.conversationId,
                    },
                  });

                  DirectMessage.findByIdAndUpdate(original._id, { $inc: { forwardCount: 1 } }).catch(() => {});
                  try { await newMsg.populate('sender', 'username avatar'); } catch (_) {}

                  if (io) {
                    io.to(`group:${groupId.toString()}`)
                      .emit('new-group-message', { ...newMsg.toObject(), sender: req.user });
                  }
                  forwarded.push(newMsg);
                } catch (e) { console.warn('[forwardMessage] group msg error:', e.message); }
              }
            } catch (e) { console.warn('[forwardMessage] group error:', e.message); }
          }
        }
      } catch (e) { console.warn('[forwardMessage] group module error:', e.message); }
    }

    /* 6 — respond */
    return res.status(200).json({
      success:  true,
      message:  `Forwarded ${originals.length} message(s) to ${dmRecipients.length + gIds.length} target(s)`,
      messages: forwarded,
      meta: {
        originalCount:  originals.length,
        recipientCount: dmRecipients.length,
        groupCount:     gIds.length,
        totalForwarded: forwarded.length,
      },
    });

  } catch (error) {
    console.error('[forwardMessage] unexpected error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};