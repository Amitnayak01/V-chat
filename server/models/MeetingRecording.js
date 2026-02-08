const mongoose = require("mongoose");

const meetingRecordingSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    index: true
  },
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  hostName: {
    type: String,
    required: true
  },
  filePath: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  duration: {
    type: Number, // in seconds
    default: 0
  },
  participants: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    username: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
meetingRecordingSchema.index({ hostId: 1, createdAt: -1 });
meetingRecordingSchema.index({ meetingId: 1 });

module.exports = mongoose.model("MeetingRecording", meetingRecordingSchema);