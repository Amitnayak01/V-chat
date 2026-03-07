import axios from 'axios';

/* ─────────────────────────────────────────────
   Base Configuration
───────────────────────────────────────────── */

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
});

/* ─────────────────────────────────────────────
   Request Interceptor – Attach Token
───────────────────────────────────────────── */

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

/* ─────────────────────────────────────────────
   Response Interceptor – Handle 401
───────────────────────────────────────────── */

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/* ─────────────────────────────────────────────
   Auth APIs
───────────────────────────────────────────── */

export const authAPI = {
  /** Register a new user */
  register: (data) => api.post('/auth/register', data),

  /** Login with email + password */
  login: (data) => api.post('/auth/login', data),

  /** Get current authenticated user */
  getMe: () => api.get('/auth/me'),

  /** Logout (server-side session invalidation if applicable) */
  logout: () => api.post('/auth/logout'),

  /** Request password reset email */
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),

  /** Reset password with token */
  resetPassword: (token, password) =>
    api.post(`/auth/reset-password/${token}`, { password }),

  /** Verify email with token */
  verifyEmail: (token) => api.get(`/auth/verify-email/${token}`),

  /** Refresh JWT access token */
  refreshToken: () => api.post('/auth/refresh-token'),
};

/* ─────────────────────────────────────────────
   User APIs
───────────────────────────────────────────── */

export const userAPI = {
  /** Get all users */
  getAllUsers: () => api.get('/users'),

  /** Get currently online users */
  getOnlineUsers: () => api.get('/users/online'),

  /** Get a single user by ID */
  getUserById: (id) => api.get(`/users/${id}`),

  /** Update own profile (username, avatar, bio…) */
  updateProfile: (data) => api.put('/users/profile', data),

  /** Update online/away/busy status */
  updateStatus: (status) => api.put('/users/status', { status }),

  /** Upload avatar (multipart/form-data) */
  uploadAvatar: (formData) =>
    api.post('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  /** Search users by username or email */
  searchUsers: (query) =>
    api.get('/users/search', { params: { query } }),

  /** Block a user */
  blockUser: (userId) => api.post(`/users/${userId}/block`),

  /** Unblock a user */
  unblockUser: (userId) => api.delete(`/users/${userId}/block`),

  /** Get list of blocked users */
  getBlockedUsers: () => api.get('/users/blocked'),
};

/* ─────────────────────────────────────────────
   Room / Meeting APIs
───────────────────────────────────────────── */

export const roomAPI = {
  /** Create a new meeting room */
  createRoom: (roomId, options = {}) =>
    api.post('/rooms/create', { roomId, ...options }),

  /** Get paginated meeting history */
  getHistory: (page = 1, limit = 10) =>
    api.get('/rooms/history', { params: { page, limit } }),

  /** Get usage stats for current user */
  getStats: () => api.get('/rooms/stats'),

  /** Delete a meeting room record */
  deleteRoom: (roomId) => api.delete(`/rooms/${roomId}`),

  /** Get details of a specific room */
  getRoomById: (roomId) => api.get(`/rooms/${roomId}`),

  /** Update room settings (name, password, max participants…) */
  updateRoom: (roomId, data) => api.put(`/rooms/${roomId}`, data),

  /** End an active room session */
  endRoom: (roomId) => api.post(`/rooms/${roomId}/end`),

  /** Get participants currently in a room */
  getRoomParticipants: (roomId) =>
    api.get(`/rooms/${roomId}/participants`),

  /** Schedule a future meeting */
  scheduleRoom: (data) => api.post('/rooms/schedule', data),

  /** Get all scheduled meetings for current user */
  getScheduledRooms: () => api.get('/rooms/scheduled'),

  /** Cancel a scheduled meeting */
  cancelScheduledRoom: (roomId) =>
    api.delete(`/rooms/scheduled/${roomId}`),

  /** Get recording list for a room */
  getRecordings: (roomId) =>
    api.get(`/rooms/${roomId}/recordings`),

  /** Delete a specific recording */
  deleteRecording: (roomId, recordingId) =>
    api.delete(`/rooms/${roomId}/recordings/${recordingId}`),
};

/* ─────────────────────────────────────────────
   Direct Message APIs
───────────────────────────────────────────── */

export const directMessageAPI = {
  /** Get all conversations for current user */
  getConversations: () => api.get('/direct-messages/conversations'),

  /** Get paginated messages within a conversation */
  getMessages: (conversationId, page = 1, limit = 30) =>
    api.get(`/direct-messages/conversation/${conversationId}`, {
      params: { page, limit },
    }),

  /** Send a new direct message */
  sendMessage: (data) => api.post('/direct-messages/send', data),

  /** Mark all messages in a conversation as read */
  markAsRead: (conversationId) =>
    api.put(`/direct-messages/read/${conversationId}`),

  /** Delete a specific message */
  deleteMessage: (messageId) =>
    api.delete(`/direct-messages/${messageId}`),

  /** Edit a sent message */
  editMessage: (messageId, content) =>
    api.put(`/direct-messages/${messageId}`, { content }),

  /** Search messages across all conversations */
  searchMessages: (query) =>
    api.get('/direct-messages/search', { params: { query } }),

  /** Get unread message count */
  getUnreadCount: () => api.get('/direct-messages/unread-count'),

  /** Get or create a conversation with a user */
  getOrCreateConversation: (userId) =>
    api.post('/direct-messages/conversation', { userId }),

  /** Delete an entire conversation */
  deleteConversation: (conversationId) =>
    api.delete(`/direct-messages/conversations/${conversationId}`),

  /** Send a file/attachment */
  sendAttachment: (conversationId, formData) =>
    api.post(
      `/direct-messages/conversation/${conversationId}/attachment`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    ),

  /** Add a reaction to a message */
  reactToMessage: (messageId, emoji) =>
    api.post(`/direct-messages/${messageId}/react`, { emoji }),

  /** Remove a reaction from a message */
  removeReaction: (messageId, emoji) =>
    api.delete(`/direct-messages/${messageId}/react`, {
      data: { emoji },
    }),

  /** Star / bookmark a message */
  starMessage: (messageId) =>
    api.post(`/direct-messages/${messageId}/star`),

  /** Get all starred messages */
  getStarredMessages: () => api.get('/direct-messages/starred'),
};

/* ─────────────────────────────────────────────
   Contacts / Friends APIs
───────────────────────────────────────────── */

export const contactsAPI = {
  /** Get contact list */
  getContacts: () => api.get('/contacts'),

  /** Send a contact / friend request */
  sendRequest: (userId) => api.post(`/contacts/request/${userId}`),

  /** Accept a contact request */
  acceptRequest: (requestId) =>
    api.put(`/contacts/request/${requestId}/accept`),

  /** Decline a contact request */
  declineRequest: (requestId) =>
    api.put(`/contacts/request/${requestId}/decline`),

  /** Remove a contact */
  removeContact: (contactId) => api.delete(`/contacts/${contactId}`),

  /** Get pending incoming requests */
  getPendingRequests: () => api.get('/contacts/requests/pending'),

  /** Get sent requests */
  getSentRequests: () => api.get('/contacts/requests/sent'),
};

/* ─────────────────────────────────────────────
   Notifications APIs
───────────────────────────────────────────── */

export const notificationAPI = {
  /** Get all notifications */
  getAll: () => api.get('/notifications'),

  /** Mark a notification as read */
  markRead: (notificationId) =>
    api.put(`/notifications/${notificationId}/read`),

  /** Mark all notifications as read */
  markAllRead: () => api.put('/notifications/read-all'),

  /** Delete a notification */
  delete: (notificationId) =>
    api.delete(`/notifications/${notificationId}`),

  /** Get unread notification count */
  getUnreadCount: () => api.get('/notifications/unread-count'),

  /** Update notification preferences */
  updatePreferences: (prefs) =>
    api.put('/notifications/preferences', prefs),
};

/* ─────────────────────────────────────────────
   Settings APIs
───────────────────────────────────────────── */

export const settingsAPI = {
  /** Get all user settings */
  getSettings: () => api.get('/settings'),

  /** Update general settings */
  updateSettings: (data) => api.put('/settings', data),

  /** Update audio/video device preferences */
  updateDevicePreferences: (data) =>
    api.put('/settings/devices', data),

  /** Update notification settings */
  updateNotifications: (data) =>
    api.put('/settings/notifications', data),

  /** Update privacy settings */
  updatePrivacy: (data) => api.put('/settings/privacy', data),

  /** Delete user account */
  deleteAccount: (password) =>
    api.delete('/settings/account', { data: { password } }),

  /** Export user data */
  exportData: () => api.get('/settings/export', { responseType: 'blob' }),
};

/* ─────────────────────────────────────────────
   Default Export
───────────────────────────────────────────── */

export default api;