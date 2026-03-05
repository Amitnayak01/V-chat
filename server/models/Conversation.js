import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  conversationId: {
    type:     String,
    required: true,
    unique:   true,
    index:    true,
  },
  participants: [{
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'User',
    required: true,
  }],
  lastMessage: {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'DirectMessage' },
    content:   String,
    type:      { type: String, default: 'text' },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  'User',
    },
    timestamp: Date,
  },
  unreadCount: {
    type:    Map,
    of:      Number,
    default: {},
  },
  // Last read tracking per user (Map<userId, Date>)
  lastReadAt: {
    type:    Map,
    of:      Date,
    default: {},
  },
  // Last read message per user (Map<userId, ObjectId>)
  lastReadMessageId: {
    type:    Map,
    of:      mongoose.Schema.Types.ObjectId,
    default: {},
  },
  // Pinned by userId set
  pinnedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  }],
  // Muted: Map<userId, { until: Date|null }>
  mutedBy: {
    type:    Map,
    of:      new mongoose.Schema({ until: Date }, { _id: false }),
    default: {},
  },
  // Archived: Set of userIds
  archivedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  }],
  // Blocked: Set of userIds
  blockedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref:  'User',
  }],
  // Explicit activity timestamp (separate from updatedAt)
  lastActivityAt: {
    type:    Date,
    default: Date.now,
    index:   true,
  },
}, {
  timestamps: true,
});

// Indexes
conversationSchema.index({ participants: 1, lastActivityAt: -1 });
conversationSchema.index({ participants: 1, updatedAt: -1 });

// Instance helpers
conversationSchema.methods.isPinnedFor = function (userId) {
  return this.pinnedBy.some((id) => id.toString() === userId.toString());
};

conversationSchema.methods.isMutedFor = function (userId) {
  const entry = this.mutedBy?.get(userId.toString());
  if (!entry) return false;
  if (entry.until === null) return true;
  return entry.until > new Date();
};

conversationSchema.methods.isArchivedFor = function (userId) {
  return this.archivedBy.some((id) => id.toString() === userId.toString());
};

conversationSchema.methods.isBlockedBy = function (userId) {
  return this.blockedBy.some((id) => id.toString() === userId.toString());
};

export default mongoose.model('Conversation', conversationSchema);