import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  avatar: {
    type: String,
    default: 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'
  },
  status: {
    type: String,
    enum: ['online', 'offline', 'busy', 'away'],
    default: 'offline'
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  socketId: {
    type: String,
    default: null
  },
  // ✅ Added: fields used by Profile.jsx
  email: {
    type: String,
    default: null,
    trim: true
  },
  bio: {
    type: String,
    maxlength: [300, 'Bio cannot exceed 300 characters'],
    default: null
  },
  phone: {
    type: String,
    default: null,
    trim: true
  },
  location: {
    type: String,
    default: null,
    trim: true
  },
  company: {
    type: String,
    default: null,
    trim: true
  }
}, {
  timestamps: true
});

// ─── Hash password before saving ──────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ─── Compare passwords ─────────────────────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// ─── Public profile (exclude password) ────────────────────────────────────────
// ✅ Added: email, bio, phone, location, company so Profile.jsx can display them
userSchema.methods.toPublicJSON = function () {
  return {
    _id: this._id,
    username: this.username,
    avatar: this.avatar,
    status: this.status,
    lastSeen: this.lastSeen,
    createdAt: this.createdAt,
    email: this.email,
    bio: this.bio,
    phone: this.phone,
    location: this.location,
    company: this.company
  };
};

const User = mongoose.model('User', userSchema);
export default User;