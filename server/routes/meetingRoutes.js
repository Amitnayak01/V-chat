const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");

// Import controller functions
const {
  getMessages,
  saveMessage,
  uploadFile,
  uploadRecording,
  getRecordings,
  getRecordingById,
  deleteRecording
} = require("../controllers/meetingController");

// Try to import auth middleware, if it doesn't exist, create a simple one
let protect;
try {
  const authMiddleware = require("../middleware/authMiddleware");
  protect = authMiddleware.protect || authMiddleware;
} catch (err) {
  console.warn("Auth middleware not found, using simple JWT verification");
  const jwt = require("jsonwebtoken");
  
  protect = (req, res, next) => {
    try {
      const token = req.headers.authorization?.replace("Bearer ", "");
      if (!token) {
        return res.status(401).json({ message: "Not authorized" });
      }
      
      const decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ message: "Not authorized, token failed" });
    }
  };
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow images, videos, and documents
    const allowedTypes = /jpeg|jpg|png|gif|mp4|webm|pdf|doc|docx|txt|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  }
});

// Chat routes
router.get("/messages/:roomId", protect, getMessages);
router.post("/messages", protect, saveMessage);
router.post("/upload-file", protect, upload.single("file"), uploadFile);

// Recording routes
router.post("/upload-recording", protect, upload.single("recording"), uploadRecording);
router.get("/recordings", protect, getRecordings);
router.get("/recordings/:id", protect, getRecordingById);
router.delete("/recordings/:id", protect, deleteRecording);

module.exports = router;