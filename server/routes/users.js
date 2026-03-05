import express from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// ─── Configure Cloudinary directly (guarantees env vars are loaded) ───────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Multer Memory Storage ─────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPG, PNG, and WebP images are allowed'), false);
  }
});

// ─── Helper: upload buffer to Cloudinary ──────────────────────────────────────
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'vmeet/avatars',
        transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(buffer);
  });
};

// ─── GET /api/users ────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id } })
      .select('-password')
      .sort({ status: -1, lastSeen: -1 });
    res.status(200).json({
      success: true,
      users: users.map(user => user.toPublicJSON())
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching users', error: error.message });
  }
});

// ─── GET /api/users/online ─────────────────────────────────────────────────────
router.get('/online', protect, async (req, res) => {
  try {
    const onlineUsers = await User.find({
      status: 'online',
      _id: { $ne: req.user._id }
    }).select('-password');
    res.status(200).json({
      success: true,
      users: onlineUsers.map(user => user.toPublicJSON())
    });
  } catch (error) {
    console.error('Get online users error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching online users', error: error.message });
  }
});

// ─── PUT /api/users/profile ────────────────────────────────────────────────────
router.put('/profile', protect, async (req, res) => {
  try {
    const allowedFields = ['username', 'email', 'bio', 'phone', 'location', 'company'];
    const updates = {};
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    if (updates.username) {
      updates.username = updates.username.toLowerCase();
      const existing = await User.findOne({ username: updates.username, _id: { $ne: req.user._id } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Username already taken' });
      }
    }
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-password');
    res.status(200).json({ success: true, user: user.toPublicJSON() });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Server error updating profile', error: error.message });
  }
});

// ─── PUT /api/users/status ─────────────────────────────────────────────────────
// Must be above /:id to avoid Express treating 'status' as an id param
router.put('/status', protect, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['online', 'offline', 'busy', 'away'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    req.user.status = status;
    req.user.lastSeen = new Date();
    await req.user.save();
    res.status(200).json({ success: true, user: req.user.toPublicJSON() });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ success: false, message: 'Server error updating status', error: error.message });
  }
});

// ─── POST /api/users/avatar ────────────────────────────────────────────────────
router.post('/avatar', protect, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const result = await uploadToCloudinary(req.file.buffer);
    req.user.avatar = result.secure_url;
    await req.user.save();
    res.status(200).json({
      success: true,
      avatar: result.secure_url,
      user: req.user.toPublicJSON()
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
  }
});

// ─── GET /api/users/:id ────────────────────────────────────────────────────────
// Must stay last so named routes above are matched first
router.get('/:id', protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.status(200).json({ success: true, user: user.toPublicJSON() });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Server error fetching user', error: error.message });
  }
});

export default router;