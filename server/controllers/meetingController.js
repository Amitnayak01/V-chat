const MeetingMessage = require("../models/MeetingMessage");
const MeetingRecording = require("../models/MeetingRecording");
const fs = require("fs");
const path = require("path");

// Try to load cloudinary, if not available use local storage
let cloudinary;
let useCloudinary = false;

try {
  cloudinary = require("../cloudinary");
  useCloudinary = true;
  console.log("✅ Cloudinary configured for meeting files");
} catch (err) {
  console.warn("⚠️  Cloudinary not found, using local file storage");
  // Create uploads directory if it doesn't exist
  const uploadsDir = path.join(__dirname, "../uploads/meeting-files");
  const recordingsDir = path.join(__dirname, "../uploads/meeting-recordings");
  
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(recordingsDir)) {
    fs.mkdirSync(recordingsDir, { recursive: true });
  }
}

// Get messages for a meeting room
exports.getMessages = async (req, res) => {
  try {
    const { roomId } = req.params;

    const messages = await MeetingMessage.find({ meetingId: roomId })
      .sort({ timestamp: 1 })
      .limit(500); // Limit to last 500 messages

    res.json(messages);
  } catch (err) {
    console.error("Error fetching messages:", err);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
};

// Save a message
exports.saveMessage = async (req, res) => {
  try {
    const { meetingId, senderId, senderName, receiverId, text, file } = req.body;

    const message = new MeetingMessage({
      meetingId,
      senderId,
      senderName,
      receiverId: receiverId || null,
      text: text || "",
      file: file || null
    });

    await message.save();

    res.status(201).json(message);
  } catch (err) {
    console.error("Error saving message:", err);
    res.status(500).json({ message: "Failed to save message" });
  }
};

// Upload file to chat
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { roomId, senderId, senderName } = req.body;
    let fileUrl;
    let filePath = req.file.path;

    if (useCloudinary) {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "meeting-files",
        resource_type: "auto"
      });
      fileUrl = result.secure_url;
      
      // Delete local file after cloudinary upload
      fs.unlinkSync(req.file.path);
    } else {
      // Use local storage
      const newPath = path.join(__dirname, "../uploads/meeting-files", req.file.filename);
      fs.renameSync(req.file.path, newPath);
      fileUrl = `/uploads/meeting-files/${req.file.filename}`;
      filePath = newPath;
    }

    // Create message with file
    const message = new MeetingMessage({
      meetingId: roomId,
      senderId,
      senderName,
      file: {
        name: req.file.originalname,
        url: fileUrl,
        type: req.file.mimetype,
        size: req.file.size
      }
    });

    await message.save();

    // Emit socket event (handled in socket handler)
    const io = req.app.get("io");
    if (io) {
      io.to(roomId).emit("meeting-file-uploaded", message);
    }

    res.status(201).json(message);
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).json({ message: "Failed to upload file" });
  }
};

// Upload recording
exports.uploadRecording = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No recording file uploaded" });
    }

    const { roomId, userId } = req.body;
    const user = req.user; // From auth middleware
    let fileUrl;
    let filePath;
    let duration = 0;

    if (useCloudinary) {
      // Upload to Cloudinary
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "meeting-recordings",
        resource_type: "video"
      });
      fileUrl = result.secure_url;
      filePath = result.public_id;
      duration = result.duration || 0;
      
      // Delete local file
      fs.unlinkSync(req.file.path);
    } else {
      // Use local storage
      const newPath = path.join(__dirname, "../uploads/meeting-recordings", req.file.filename);
      fs.renameSync(req.file.path, newPath);
      fileUrl = `/uploads/meeting-recordings/${req.file.filename}`;
      filePath = newPath;
    }

    // Create recording record
    const recording = new MeetingRecording({
      meetingId: roomId,
      hostId: userId,
      hostName: user.username || "Unknown",
      filePath: filePath,
      fileUrl: fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      duration: Math.floor(duration)
    });

    await recording.save();

    res.status(201).json({
      message: "Recording uploaded successfully",
      recording
    });
  } catch (err) {
    console.error("Error uploading recording:", err);
    res.status(500).json({ message: "Failed to upload recording" });
  }
};

// Get user's recordings
exports.getRecordings = async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;

    const recordings = await MeetingRecording.find({ hostId: userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(recordings);
  } catch (err) {
    console.error("Error fetching recordings:", err);
    res.status(500).json({ message: "Failed to fetch recordings" });
  }
};

// Get recording by ID
exports.getRecordingById = async (req, res) => {
  try {
    const { id } = req.params;

    const recording = await MeetingRecording.findById(id);

    if (!recording) {
      return res.status(404).json({ message: "Recording not found" });
    }

    res.json(recording);
  } catch (err) {
    console.error("Error fetching recording:", err);
    res.status(500).json({ message: "Failed to fetch recording" });
  }
};

// Delete recording
exports.deleteRecording = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id || req.user.id;

    const recording = await MeetingRecording.findById(id);

    if (!recording) {
      return res.status(404).json({ message: "Recording not found" });
    }

    // Check if user is the host
    if (recording.hostId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this recording" });
    }

    if (useCloudinary) {
      // Delete from Cloudinary
      try {
        await cloudinary.uploader.destroy(recording.filePath, { resource_type: "video" });
      } catch (err) {
        console.error("Error deleting from cloudinary:", err);
      }
    } else {
      // Delete local file
      try {
        if (fs.existsSync(recording.filePath)) {
          fs.unlinkSync(recording.filePath);
        }
      } catch (err) {
        console.error("Error deleting local file:", err);
      }
    }

    // Delete from database
    await MeetingRecording.findByIdAndDelete(id);

    res.json({ message: "Recording deleted successfully" });
  } catch (err) {
    console.error("Error deleting recording:", err);
    res.status(500).json({ message: "Failed to delete recording" });
  }
};