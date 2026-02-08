const mongoose = require("mongoose");

const meetingMessageSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true
    // Removed index: true to avoid duplicate with schema.index() below
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  senderName: {
    type: String,
    required: true
  },
  receiverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null // null means message is for everyone in the room
  },
  text: {
    type: String,
    default: ""
  },
  file: {
    name: String,
    url: String,
    type: String,
    size: Number
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries (only one index definition)
meetingMessageSchema.index({ meetingId: 1, timestamp: 1 });

module.exports = mongoose.model("MeetingMessage", meetingMessageSchema);