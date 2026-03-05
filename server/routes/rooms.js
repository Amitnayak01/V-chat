import express from 'express';
import Room from '../models/Room.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// GET /api/rooms/history  — paginated meeting history for current user
router.get('/history', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const skip   = (page - 1) * limit;

    const filter = { $or: [{ host: userId }, { 'participants.user': userId }] };

    const [rooms, total] = await Promise.all([
      Room.find(filter)
        .populate('host', 'username avatar')
        .populate('participants.user', 'username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Room.countDocuments(filter)
    ]);

    const enriched = rooms.map(room => {
      // compute duration if not stored
      let duration = room.duration ?? null;
      if (!duration && room.startedAt && room.endedAt) {
        duration = Math.round((new Date(room.endedAt) - new Date(room.startedAt)) / 1000);
      }

      // deduplicate participants
      const seen = new Set();
      const uniqueParticipants = (room.participants || [])
        .filter(p => p.user)
        .filter(p => { const id = p.user._id?.toString(); if (seen.has(id)) return false; seen.add(id); return true; })
        .map(p => p.user);

      return {
        _id:              room._id,
        roomId:           room.roomId,
        name:             room.name,
        host:             room.host,
        isActive:         room.isActive,
        startedAt:        room.startedAt || room.createdAt,
        endedAt:          room.endedAt,
        duration,
        participantCount: uniqueParticipants.length,
        participants:     uniqueParticipants.slice(0, 5),
        hasRecording:     !!room.recordingUrl,
        recordingUrl:     room.recordingUrl || null,
        createdAt:        room.createdAt,
      };
    });

    res.json({ success: true, rooms: enriched, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('Meeting history error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching history' });
  }
});

// GET /api/rooms/stats
router.get('/stats', protect, async (req, res) => {
  try {
    const userId = req.user._id;
    const filter = { $or: [{ host: userId }, { 'participants.user': userId }] };

    const [total, hosted, durationResult] = await Promise.all([
      Room.countDocuments(filter),
      Room.countDocuments({ host: userId }),
      Room.aggregate([
        { $match: { ...filter, duration: { $exists: true, $ne: null } } },
        { $group: { _id: null, total: { $sum: '$duration' } } }
      ])
    ]);

    const totalSec = durationResult[0]?.total || 0;
    res.json({
      success: true,
      stats: {
        totalMeetings:        total,
        hostedMeetings:       hosted,
        joinedMeetings:       total - hosted,
        totalDurationSeconds: totalSec,
        totalDurationHours:   Math.round(totalSec / 3600 * 10) / 10,
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
});

// DELETE /api/rooms/:roomId  — host only
router.delete('/:roomId', protect, async (req, res) => {
  try {
    const room = await Room.findOne({ roomId: req.params.roomId });
    if (!room) return res.status(404).json({ success: false, message: 'Meeting not found' });
    if (room.host.toString() !== req.user._id.toString())
      return res.status(403).json({ success: false, message: 'Not authorized' });
    await Room.findOneAndDelete({ roomId: req.params.roomId });
    res.json({ success: true, message: 'Removed from history' });
  } catch (err) {
    console.error('Delete room error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;