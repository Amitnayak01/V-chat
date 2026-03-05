import { memo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import CallLayout    from './CallLayout';
import MeetingLayout from './MeetingLayout';

/**
 * VideoGrid
 * Pure router — passes all props to the appropriate layout.
 * Animated crossfade on mode switch.
 */
const VideoGrid = memo(({
  mode            = 'call',   // 'call' | 'meeting'
  localStream,
  remoteStreams,
  localUserId,
  localUsername,
  isMuted,
  isVideoOff,
  activeSpeaker,
  participants    = [],
  meetingViewMode = 'grid',
  pinnedUserId    = null,
  onPin,
  screenStream    = null,
  presenterUserId = null,
  onStopSharing,
  onControlsReveal,
}) => {
  const sharedProps = {
    localStream,
    remoteStreams,
    localUserId,
    localUsername,
    isMuted,
    isVideoOff,
    activeSpeaker,
    participants,
    screenStream,
    presenterUserId,
    onStopSharing,
    onControlsReveal,
  };

  return (
    <div className="w-full h-full relative overflow-hidden">
      <AnimatePresence mode="wait">
        {mode === 'call' ? (
          <motion.div
            key="call"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0"
          >
            <CallLayout {...sharedProps} />
          </motion.div>
        ) : (
          <motion.div
            key="meeting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0"
          >
            <MeetingLayout
              {...sharedProps}
              viewMode={meetingViewMode}
              pinnedUserId={pinnedUserId}
              onPin={onPin}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

VideoGrid.displayName = 'VideoGrid';
export default VideoGrid;