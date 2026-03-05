import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  roomId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  name: {
    type: String,
    default: 'Unnamed Room'
  },
  description: {
    type: String,
    maxlength: 500
  },
  type: {
    type: String,
    enum: ['direct', 'group', 'scheduled'],
    default: 'group'
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  coHosts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date
    },
    duration: {
      type: Number, // seconds they were in the call
      default: 0
    },
    isMuted: {
      type: Boolean,
      default: false
    },
    isVideoOff: {
      type: Boolean,
      default: false
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  maxParticipants: {
    type: Number,
    default: 10,
    min: 2,
    max: 100
  },
  
  // Recording
  recordingUrl: {
    type: String
  },
  isRecording: {
    type: Boolean,
    default: false
  },
  recordings: [{
    url: String,
    startedAt: Date,
    endedAt: Date,
    duration: Number, // seconds
    size: Number, // bytes
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // Time tracking
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number // in seconds
  },
  scheduledAt: {
    type: Date
  },
  scheduledDuration: {
    type: Number // expected duration in minutes
  },
  
  // Privacy & Security
  isPrivate: {
    type: Boolean,
    default: false
  },
  password: {
    type: String,
    select: false // Don't include in queries by default
  },
  waitingRoom: {
    enabled: {
      type: Boolean,
      default: false
    },
    participants: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      requestedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },
  allowedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  blockedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    blockedAt: {
      type: Date,
      default: Date.now
    },
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String
  }],
  
  // Room Settings
  settings: {
    audioEnabled: {
      type: Boolean,
      default: true
    },
    videoEnabled: {
      type: Boolean,
      default: true
    },
    chatEnabled: {
      type: Boolean,
      default: true
    },
    screenShareEnabled: {
      type: Boolean,
      default: true
    },
    allowParticipantScreenShare: {
      type: Boolean,
      default: true
    },
    muteParticipantsOnEntry: {
      type: Boolean,
      default: false
    },
    disableVideoOnEntry: {
      type: Boolean,
      default: false
    },
    autoRecording: {
      type: Boolean,
      default: false
    },
    backgroundBlur: {
      type: Boolean,
      default: false
    },
    noiseSuppression: {
      type: Boolean,
      default: true
    },
    videoQuality: {
      type: String,
      enum: ['low', 'medium', 'high', 'hd'],
      default: 'medium'
    },
    maxVideoBitrate: {
      type: Number,
      default: 2500000 // 2.5 Mbps
    },
    maxAudioBitrate: {
      type: Number,
      default: 128000 // 128 Kbps
    },
    layout: {
      type: String,
      enum: ['grid', 'spotlight', 'sidebar'],
      default: 'grid'
    }
  },
  
  // Analytics & Stats
  stats: {
    totalParticipants: {
      type: Number,
      default: 0
    },
    peakParticipants: {
      type: Number,
      default: 0
    },
    totalMessages: {
      type: Number,
      default: 0
    },
    totalDuration: {
      type: Number, // total seconds all participants spent
      default: 0
    },
    averageParticipants: {
      type: Number,
      default: 0
    },
    participantJoins: {
      type: Number,
      default: 0
    },
    participantLeaves: {
      type: Number,
      default: 0
    }
  },
  
  // Metadata
  tags: [String],
  category: {
    type: String,
    enum: ['meeting', 'webinar', 'social', 'education', 'interview', 'other'],
    default: 'meeting'
  },
  language: {
    type: String,
    default: 'en'
  },
  timezone: {
    type: String
  },
  
  // External Integration
  externalMeetingId: {
    type: String // For calendar/third-party integrations
  },
  calendarEventId: {
    type: String
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['scheduled', 'waiting', 'active', 'ended', 'cancelled'],
    default: 'active'
  },
  cancelledAt: {
    type: Date
  },
  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  cancellationReason: {
    type: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ─── Indexes for efficient queries ────────────────────────────────────────────

roomSchema.index({ isActive: 1, createdAt: -1 });
roomSchema.index({ host: 1, isActive: 1 });
roomSchema.index({ 'participants.user': 1 });
roomSchema.index({ status: 1, scheduledAt: 1 });
roomSchema.index({ type: 1, isActive: 1 });
roomSchema.index({ roomId: 1, isActive: 1 });

// ─── Virtual Properties ───────────────────────────────────────────────────────

// Get current active participants count
roomSchema.virtual('activeParticipantsCount').get(function() {
  return this.participants.filter(p => !p.leftAt).length;
});

// Check if room is full
roomSchema.virtual('isFull').get(function() {
  return this.activeParticipantsCount >= this.maxParticipants;
});

// Calculate actual duration if room is still active
roomSchema.virtual('actualDuration').get(function() {
  if (this.startedAt && !this.endedAt) {
    return Math.floor((Date.now() - this.startedAt.getTime()) / 1000);
  }
  return this.duration || 0;
});

// Check if host is present
roomSchema.virtual('isHostPresent').get(function() {
  return this.participants.some(p => 
    p.user.toString() === this.host.toString() && !p.leftAt
  );
});

// Check if room is scheduled in future
roomSchema.virtual('isScheduled').get(function() {
  return this.scheduledAt && this.scheduledAt > new Date();
});

// ─── Instance Methods ─────────────────────────────────────────────────────────

// Add participant to room
roomSchema.methods.addParticipant = function(userId) {
  const existing = this.participants.find(p => 
    p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (existing) {
    return { success: false, message: 'User already in room' };
  }
  
  if (this.isFull) {
    return { success: false, message: 'Room is full' };
  }
  
  this.participants.push({ user: userId, joinedAt: new Date() });
  this.stats.participantJoins += 1;
  this.stats.totalParticipants += 1;
  
  // Update peak participants
  const currentCount = this.activeParticipantsCount;
  if (currentCount > this.stats.peakParticipants) {
    this.stats.peakParticipants = currentCount;
  }
  
  return { success: true };
};

// Remove participant from room
roomSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (!participant) {
    return { success: false, message: 'User not in room' };
  }
  
  participant.leftAt = new Date();
  
  // Calculate duration for this participant
  if (participant.joinedAt) {
    participant.duration = Math.floor(
      (participant.leftAt - participant.joinedAt) / 1000
    );
    this.stats.totalDuration += participant.duration;
  }
  
  this.stats.participantLeaves += 1;
  
  return { success: true };
};

// Add co-host
roomSchema.methods.addCoHost = function(userId) {
  if (!this.coHosts.includes(userId)) {
    this.coHosts.push(userId);
    return { success: true };
  }
  return { success: false, message: 'User is already a co-host' };
};

// Check if user is host or co-host
roomSchema.methods.isHostOrCoHost = function(userId) {
  return this.host.toString() === userId.toString() || 
         this.coHosts.some(id => id.toString() === userId.toString());
};

// Check if user can join
roomSchema.methods.canUserJoin = function(userId) {
  // Check if blocked
  const isBlocked = this.blockedUsers.some(b => 
    b.user.toString() === userId.toString()
  );
  if (isBlocked) {
    return { allowed: false, reason: 'User is blocked from this room' };
  }
  
  // Check if private and not allowed
  if (this.isPrivate && this.allowedUsers.length > 0) {
    const isAllowed = this.allowedUsers.some(id => 
      id.toString() === userId.toString()
    );
    if (!isAllowed && !this.isHostOrCoHost(userId)) {
      return { allowed: false, reason: 'Room is private' };
    }
  }
  
  // Check if full
  if (this.isFull && !this.isHostOrCoHost(userId)) {
    return { allowed: false, reason: 'Room is full' };
  }
  
  return { allowed: true };
};

// Add to waiting room
roomSchema.methods.addToWaitingRoom = function(userId) {
  if (!this.waitingRoom.enabled) {
    return { success: false, message: 'Waiting room is not enabled' };
  }
  
  const existing = this.waitingRoom.participants.find(p => 
    p.user.toString() === userId.toString()
  );
  
  if (existing) {
    return { success: false, message: 'User already in waiting room' };
  }
  
  this.waitingRoom.participants.push({ user: userId });
  return { success: true };
};

// Admit from waiting room
roomSchema.methods.admitFromWaitingRoom = function(userId) {
  const index = this.waitingRoom.participants.findIndex(p => 
    p.user.toString() === userId.toString()
  );
  
  if (index === -1) {
    return { success: false, message: 'User not in waiting room' };
  }
  
  this.waitingRoom.participants.splice(index, 1);
  return this.addParticipant(userId);
};

// End room
roomSchema.methods.endRoom = function() {
  if (!this.isActive) {
    return { success: false, message: 'Room already ended' };
  }
  
  this.isActive = false;
  this.status = 'ended';
  this.endedAt = new Date();
  
  // Calculate duration
  if (this.startedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  
  // Mark all active participants as left
  this.participants.forEach(p => {
    if (!p.leftAt) {
      p.leftAt = this.endedAt;
      if (p.joinedAt) {
        p.duration = Math.floor((p.leftAt - p.joinedAt) / 1000);
        this.stats.totalDuration += p.duration;
      }
    }
  });
  
  // Calculate average participants
  if (this.stats.participantJoins > 0) {
    this.stats.averageParticipants = this.stats.totalParticipants / this.stats.participantJoins;
  }
  
  return { success: true };
};

// ─── Static Methods ───────────────────────────────────────────────────────────

// Get active rooms for a user
roomSchema.statics.getActiveRoomsForUser = function(userId) {
  return this.find({
    'participants.user': userId,
    'participants.leftAt': { $exists: false },
    isActive: true
  }).populate('host', 'username avatar');
};

// Get room statistics
roomSchema.statics.getRoomStats = async function(roomId) {
  const room = await this.findOne({ roomId }).lean();
  if (!room) return null;
  
  return {
    roomId: room.roomId,
    totalParticipants: room.stats.totalParticipants,
    peakParticipants: room.stats.peakParticipants,
    totalMessages: room.stats.totalMessages,
    duration: room.duration,
    averageParticipants: room.stats.averageParticipants,
    recordings: room.recordings.length
  };
};

// Clean up old ended rooms (can be run as a cron job)
roomSchema.statics.cleanupOldRooms = function(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);
  
  return this.deleteMany({
    isActive: false,
    endedAt: { $lt: cutoffDate }
  });
};

// ─── Middleware ───────────────────────────────────────────────────────────────

// Pre-save: Set startedAt if becoming active
roomSchema.pre('save', function(next) {
  if (this.isModified('isActive') && this.isActive && !this.startedAt) {
    this.startedAt = new Date();
    this.status = 'active';
  }
  next();
});

// Pre-save: Calculate duration when ending
roomSchema.pre('save', function(next) {
  if (this.isModified('isActive') && !this.isActive && this.startedAt && !this.endedAt) {
    this.endedAt = new Date();
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  next();
});

const Room = mongoose.model('Room', roomSchema);

export default Room;