import { useState, useRef, memo, useEffect, useCallback } from 'react';
import {
  User, Mail, Phone, MapPin, Briefcase, Calendar,
  Camera, Edit2, Check, X, Loader2, AlertCircle,
  Shield, RefreshCw
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { userAPI, authAPI } from '../../utils/api'; // ✅ Fixed: added authAPI import
import toast from 'react-hot-toast';

/* ═══════════════════════════════════════════════════════════════
   PROFILE IMAGE UPLOAD
═══════════════════════════════════════════════════════════════ */
const ProfileImageUpload = memo(({ currentAvatar, username, onUploadSuccess }) => {
  const [uploading, setUploading]   = useState(false);
  const [preview, setPreview]       = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef                = useRef(null);

  const handleFileSelect = async (file) => {
    if (!file) return;
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Please upload a JPG, PNG, or WebP image');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image must be smaller than 5MB');
      return;
    }

    // Show local preview immediately
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      const res = await userAPI.uploadAvatar(formData);
      if (res.data.success) {
        onUploadSuccess(res.data.avatar, res.data.user);
        toast.success('Profile picture updated!');
        setPreview(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to upload image');
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const avatarSrc = preview || currentAvatar ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar circle */}
      <div className="relative group">
        <div
          className={`relative w-32 h-32 rounded-full overflow-hidden ring-4 transition-all
            ${dragActive ? 'ring-primary-500 scale-105' : 'ring-primary-100'}`}
        >
          <img
            src={avatarSrc}
            alt="Profile"
            className="w-full h-full object-cover"
            onError={(e) => {
              e.target.src = `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
            }}
          />

          {/* Hover overlay */}
          {!uploading && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`absolute inset-0 flex flex-col items-center justify-center gap-1
                bg-black/60 cursor-pointer transition-opacity
                ${dragActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <Camera className="w-7 h-7 text-white" />
              <span className="text-white text-xs font-medium">
                {dragActive ? 'Drop it!' : 'Change'}
              </span>
            </div>
          )}

          {/* Uploading spinner */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>

        {/* Camera badge */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Change profile picture"
          className="absolute bottom-0 right-0 w-9 h-9 bg-primary-600 hover:bg-primary-700
            rounded-full flex items-center justify-center text-white shadow-lg
            transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Camera className="w-4 h-4" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
      />

      {/* Cancel preview */}
      {preview && !uploading && (
        <button
          onClick={() => {
            setPreview(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
          }}
          className="btn btn-secondary text-sm py-1.5 px-3 flex items-center gap-1"
        >
          <X className="w-4 h-4" /> Cancel
        </button>
      )}

      <p className="text-xs text-slate-500 text-center leading-relaxed">
        Click or drag & drop to upload<br />
        <span className="text-slate-400">JPG, PNG or WebP · max 5 MB</span>
      </p>
    </div>
  );
});
ProfileImageUpload.displayName = 'ProfileImageUpload';

/* ═══════════════════════════════════════════════════════════════
   EDITABLE FIELD
═══════════════════════════════════════════════════════════════ */
const EditableField = memo(({
  label, value, type = 'text', icon: Icon,
  onSave, validation, placeholder,
  disabled = false, multiline = false,
  hint
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || '');
  const [error, setError]         = useState('');
  const [saving, setSaving]       = useState(false);
  const inputRef                  = useRef(null);

  // Sync if parent value changes
  useEffect(() => { setEditValue(value || ''); }, [value]);
  useEffect(() => {
    if (isEditing && inputRef.current) inputRef.current.focus();
  }, [isEditing]);

  const startEdit = () => { setIsEditing(true); setError(''); };

  const cancel = () => {
    setIsEditing(false);
    setEditValue(value || '');
    setError('');
  };

  const save = async () => {
    const trimmed = typeof editValue === 'string' ? editValue.trim() : editValue;
    if (validation) {
      const err = validation(trimmed);
      if (err) { setError(err); return; }
    }
    if (trimmed === (value || '').trim()) { setIsEditing(false); return; }

    setSaving(true);
    try {
      await onSave(trimmed);
      setIsEditing(false);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !multiline) { e.preventDefault(); save(); }
    if (e.key === 'Escape') cancel();
  };

  const InputTag = multiline ? 'textarea' : 'input';

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        {label}
      </label>

      {isEditing ? (
        <div className="space-y-1.5">
          <div className="flex items-start gap-2">
            <InputTag
              ref={inputRef}
              type={type}
              value={editValue}
              onChange={(e) => { setEditValue(e.target.value); setError(''); }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={saving}
              rows={multiline ? 3 : undefined}
              className={`input flex-1 text-sm
                ${error ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}
                ${multiline ? 'resize-none' : ''}`}
            />
            <div className="flex flex-col gap-1 pt-0.5">
              <button
                onClick={save}
                disabled={saving}
                title="Save"
                className="w-8 h-8 rounded-lg bg-green-100 hover:bg-green-200 flex items-center justify-center
                  text-green-700 transition-colors disabled:opacity-50"
              >
                {saving
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Check className="w-4 h-4" />}
              </button>
              <button
                onClick={cancel}
                disabled={saving}
                title="Cancel"
                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 flex items-center justify-center
                  text-slate-600 transition-colors disabled:opacity-50"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
            </p>
          )}
          {hint && !error && (
            <p className="text-xs text-slate-400">{hint}</p>
          )}
        </div>
      ) : (
        <div
          className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100
            rounded-lg group transition-colors cursor-default"
        >
          <span className={`text-sm ${value ? 'text-slate-700' : 'text-slate-400'}`}>
            {value || placeholder || 'Not set'}
          </span>
          {!disabled && (
            <button
              onClick={startEdit}
              title={`Edit ${label}`}
              className="opacity-0 group-hover:opacity-100 w-8 h-8 rounded-lg hover:bg-white
                flex items-center justify-center text-slate-500 hover:text-slate-700
                transition-all shadow-none hover:shadow-sm"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
});
EditableField.displayName = 'EditableField';

/* ═══════════════════════════════════════════════════════════════
   STATUS BADGE
═══════════════════════════════════════════════════════════════ */
const statusColors = {
  online:  'bg-green-500',
  away:    'bg-yellow-400',
  busy:    'bg-red-500',
  offline: 'bg-slate-400'
};

const StatusBadge = ({ status }) => (
  <span className="flex items-center gap-1.5 text-sm text-slate-600 capitalize">
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColors[status] || 'bg-slate-400'}`} />
    {status}
  </span>
);

/* ═══════════════════════════════════════════════════════════════
   MAIN PROFILE COMPONENT
═══════════════════════════════════════════════════════════════ */
const Profile = () => {
  const { user, updateUser } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  // ─── Fetch fresh profile from server on mount ────────────────────────────
  // ✅ Fixed: was calling userAPI.getUserById('me') which crashed MongoDB
  //    with a CastError since 'me' is not a valid ObjectId.
  //    Now correctly calls authAPI.getMe() → GET /api/auth/me
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await authAPI.getMe();
        if (res.data.success && res.data.user) updateUser(res.data.user);
      } catch (_) {
        // Silently fail — cached user data still shown
      }
    };
    fetchProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Manual refresh ──────────────────────────────────────────────────────
  // ✅ Fixed: same fix as above — use authAPI.getMe() not getUserById('me')
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const res = await authAPI.getMe();
      if (res.data.success && res.data.user) {
        updateUser(res.data.user);
        toast.success('Profile refreshed');
      }
    } catch (_) {
      toast.error('Could not refresh profile');
    } finally {
      setRefreshing(false);
    }
  };

  /* ── Validators ─────────────────────────────── */
  const validateUsername = (v) => {
    if (!v || v.trim().length < 2)    return 'Username must be at least 2 characters';
    if (v.length > 30)                return 'Username must be 30 characters or fewer';
    if (!/^[a-zA-Z0-9_-]+$/.test(v)) return 'Only letters, numbers, hyphens and underscores';
    return null;
  };
  const validateEmail = (v) => {
    if (!v) return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return 'Enter a valid email address';
    return null;
  };
  const validatePhone = (v) => {
    if (!v) return null;
    if (!/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/.test(v))
      return 'Enter a valid phone number';
    return null;
  };
  const validateBio = (v) => {
    if (v && v.length > 300) return 'Bio must be 300 characters or fewer';
    return null;
  };

  /* ── Save field ─────────────────────────────── */
  const saveField = useCallback(async (field, value) => {
    try {
      const res = await userAPI.updateProfile({ [field]: value });
      if (res.data.success && res.data.user) {
        updateUser(res.data.user);
      } else {
        updateUser({ ...user, [field]: value });
      }
      toast.success('Saved!');
    } catch (err) {
      throw new Error(err.response?.data?.message || 'Failed to save');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  /* ── Avatar upload ──────────────────────────── */
  const handleAvatarUpload = (newAvatar, updatedUser) => {
    updateUser(updatedUser || { ...user, avatar: newAvatar });
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      {/* ── Page Header ─────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">My Profile</h1>
          <p className="text-slate-500 mt-0.5">Manage your personal information</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          title="Refresh profile"
          className="btn btn-secondary flex items-center gap-1.5 text-sm py-2 px-3"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Avatar Card ─────────────────────────── */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <ProfileImageUpload
            currentAvatar={user.avatar}
            username={user.username}
            onUploadSuccess={handleAvatarUpload}
          />
          <div className="text-center sm:text-left space-y-1">
            <h2 className="text-xl font-bold text-slate-900">{user.username}</h2>
            {user.email && <p className="text-slate-500 text-sm">{user.email}</p>}
            {user.bio && <p className="text-slate-600 text-sm max-w-xs">{user.bio}</p>}
            <StatusBadge status={user.status} />
          </div>
        </div>
      </div>

      {/* ── Basic Information ────────────────────── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <User className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-900">Basic Information</h2>
        </div>

        <EditableField
          label="Username"
          value={user.username}
          icon={User}
          placeholder="Enter your username"
          validation={validateUsername}
          onSave={(v) => saveField('username', v)}
          hint="Letters, numbers, hyphens and underscores only"
        />
        <EditableField
          label="Email"
          value={user.email}
          icon={Mail}
          type="email"
          placeholder="Enter your email address"
          validation={validateEmail}
          onSave={(v) => saveField('email', v)}
        />
        <EditableField
          label="Phone"
          value={user.phone}
          icon={Phone}
          type="tel"
          placeholder="Enter your phone number"
          validation={validatePhone}
          onSave={(v) => saveField('phone', v)}
        />
        <EditableField
          label="Bio"
          value={user.bio}
          icon={User}
          placeholder="Tell others a little about yourself…"
          validation={validateBio}
          onSave={(v) => saveField('bio', v)}
          multiline
          hint="Max 300 characters"
        />
      </div>

      {/* ── Additional Information ───────────────── */}
      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Briefcase className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-900">Additional Information</h2>
        </div>

        <EditableField
          label="Location"
          value={user.location}
          icon={MapPin}
          placeholder="City, Country"
          onSave={(v) => saveField('location', v)}
        />
        <EditableField
          label="Company / Organization"
          value={user.company}
          icon={Briefcase}
          placeholder="Where do you work?"
          onSave={(v) => saveField('company', v)}
        />

        {/* Read-only member since */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-600 flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-slate-400" />
            Member Since
          </label>
          <div className="p-3 bg-slate-50 rounded-lg">
            <span className="text-sm text-slate-700">
              {user.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric', month: 'long', day: 'numeric'
                  })
                : 'Unknown'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Account Security (read-only section) ── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-900">Account Security</h2>
        </div>
        <div className="p-3 bg-slate-50 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Password</p>
            <p className="text-xs text-slate-500 mt-0.5">Last changed: unknown</p>
          </div>
          <span className="text-xs bg-slate-200 text-slate-600 px-2 py-1 rounded-full">
            ●●●●●●●●
          </span>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          To change your password, go to <span className="text-primary-500 font-medium">Settings → Security</span>.
        </p>
      </div>

    </div>
  );
};

export default Profile;