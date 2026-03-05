import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema({
  url:      { type: String, required: true },
  name:     { type: String, default: 'file' },
  size:     { type: Number, default: 0 },
  mimeType: { type: String, default: 'application/octet-stream' },
  width:    Number,
  height:   Number,
  duration: Number,
}, { _id: false });

const reactionSchema = new mongoose.Schema({
  emoji:   { type: String, required: true },
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
}, { _id: false });

const deliveryStatusSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status:    { type: String, enum: ['delivered', 'read'], required: true },
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const editHistorySchema = new mongoose.Schema({
  content:  { type: String, required: true },
  editedAt: { type: Date, default: Date.now },
}, { _id: false });

const replySnapshotSchema = new mongoose.Schema({
  messageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'DirectMessage' },
  content:        String,
  senderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  senderUsername: String,
  type:           String,
  attachmentUrl:  String,
}, { _id: false });

const directMessageSchema = new mongoose.Schema({
  conversationId: {
    type:     String,
    required: true,
    index:    true,
  },
  clientMessageId: {
    type:   String,
    sparse: true,
  },
  sender: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  receiver: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  },
  content: {
    type:    String,
    default: '',
    trim:    true,
  },
  type: {
    type:    String,
    enum:    ['text', 'image', 'file', 'audio', 'video', 'video-call', 'location', 'sticker'],
    default: 'text',
  },
  attachments: {
    type:    [attachmentSchema],
    default: [],
  },

  // Legacy fields (kept for backward compat)
  fileUrl:  String,
  fileName: String,

  // Status
  status: {
    type:    String,
    enum:    ['sending', 'sent', 'delivered', 'read', 'failed'],
    default: 'sent',
    index:   true,
  },
  isRead:      { type: Boolean, default: false, index: true },
  readAt:      Date,
  isDelivered: { type: Boolean, default: false },
  deliveredAt: Date,
  deliveryStatuses: {
    type:    [deliveryStatusSchema],
    default: [],
  },

  // Reactions
  reactions: {
    type:    [reactionSchema],
    default: [],
  },

  // Editing
  edited:      { type: Boolean, default: false },
  editedAt:    Date,
  editHistory: {
    type:    [editHistorySchema],
    default: [],
  },
  version: { type: Number, default: 1 },

  // Reply
  replyTo: replySnapshotSchema,

  // ── Forwarding ────────────────────────────────────────────────────────────
  // forwardedFrom: legacy sub-doc — kept for backward compat
  forwardedFrom: {
    messageId:      { type: mongoose.Schema.Types.ObjectId, ref: 'DirectMessage' },
    senderId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    senderUsername: String,
    conversationId: String,
  },
  // Top-level forward fields
  forwarded:      { type: Boolean,                              default: false },
  originalSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // forwardCount: total number of times this message (or its ancestor) has been forwarded.
  // Incremented on the ORIGINAL each time it is forwarded; also copied (+1) into every clone
  // so the chain count is always visible without a DB lookup.
  forwardCount:   { type: Number,                               default: 0 },
  // ─────────────────────────────────────────────────────────────────────────

  // Soft delete
  deletedFor:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  deletedForEveryone: { type: Boolean, default: false, index: true },

  // Starred
  starredBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Mentions
  mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Optional metadata
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

// ── Indexes ───────────────────────────────────────────────────────────────
directMessageSchema.index({ conversationId: 1, createdAt: -1 });
directMessageSchema.index({ conversationId: 1, _id: -1 });           // cursor pagination
directMessageSchema.index({ sender: 1, receiver: 1 });
directMessageSchema.index({ conversationId: 1, clientMessageId: 1 }, { unique: true, sparse: true });
directMessageSchema.index({ starredBy: 1 });
directMessageSchema.index({ content: 'text' });                       // full-text search

// ── Instance methods ──────────────────────────────────────────────────────
directMessageSchema.methods.canEditOrDelete = function (userId, windowMs = 900_000) {
  if (this.sender.toString() !== userId.toString()) return false;
  return Date.now() - this.createdAt.getTime() < windowMs;
};

directMessageSchema.methods.isVisibleTo = function (userId) {
  if (this.deletedForEveryone) return false;
  return !this.deletedFor.some((id) => id.toString() === userId.toString());
};

// ── Static helpers ────────────────────────────────────────────────────────
directMessageSchema.statics.getConversationId = function (userId1, userId2) {
  return [userId1.toString(), userId2.toString()].sort().join('-');
};

export default mongoose.model('DirectMessage', directMessageSchema);