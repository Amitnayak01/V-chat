import { useState, useMemo, memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VideoTile from './VideoTile';
import ScreenShareView from './ScreenShareView';

const toMap = (rs) =>
  rs instanceof Map ? rs : new Map(Object.entries(rs ?? {}));

const gridCols = (n) => {
  if (n <= 1) return 1;
  if (n <= 4) return 2;
  if (n <= 9) return 3;
  return 4;
};

const FullscreenOverlay = memo(({ participant, activeSpeaker, onClose }) => (
  <motion.div
    key="fullscreen"
    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    className="fixed inset-0 z-[100] bg-black"
    onClick={onClose}
  >
    <VideoTile
      stream={participant.stream} username={participant.username}
      isMuted={participant.isMuted} isVideoOff={participant.isVideoOff}
      isLocal={participant.isLocal} isActive={activeSpeaker === participant.id}
      className="w-full h-full rounded-none"
    />
    <button onClick={onClose}
      className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white
                 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-sm transition-all">
      ✕ Exit
    </button>
  </motion.div>
));
FullscreenOverlay.displayName = 'FullscreenOverlay';

const MeetingLayout = memo(({
  localStream,
  remoteStreams,
  localUserId,
  localUsername,
  isMuted,
  isVideoOff,
  activeSpeaker,
  participants    = [],
  viewMode        = 'grid',
  pinnedUserId    = null,
  onPin,
  screenStream    = null,
  presenterUserId = null,
  onStopSharing,
  onControlsReveal,
  forceMutedIds   = new Set(),   // ← Set of userIds force-muted by host
}) => {
  // ── ALL hooks declared unconditionally at the top ──────────────────────
  const [fullscreenId, setFullscreenId] = useState(null);

  const remoteMap = useMemo(() => toMap(remoteStreams), [remoteStreams]);
  const remoteEntries = useMemo(() => Array.from(remoteMap.entries()), [remoteMap]);

  const getUsername = useCallback((uid) => {
    const p = participants.find(p => (p.userId ?? p) === uid);
    return p?.username ?? `User ${String(uid).slice(0, 4)}`;
  }, [participants]);

  const allParticipants = useMemo(() => [
    { id: localUserId, stream: localStream, username: localUsername, isMuted, isVideoOff, isLocal: true },
    ...remoteEntries.map(([id, s]) => ({
      id, stream: s, username: getUsername(id),
      isMuted: forceMutedIds.has(id),   // show muted icon if host force-muted them
      isVideoOff: false,
      isLocal: false,
    })),
  ], [localUserId, localStream, localUsername, isMuted, isVideoOff, remoteEntries, getUsername, forceMutedIds]);

  const screenInfo = useMemo(() => {
    // ONLY trust the explicit socket-signalled presenterUserId.
    // Never auto-detect via track labels — causes hall-of-mirrors when
    // the shared content is this tab itself.
    if (!presenterUserId) return null;

    if (presenterUserId === localUserId) {
      if (screenStream) return { stream: screenStream, isLocal: true, name: localUsername };
      return null;
    }

    const rs = remoteMap.get(presenterUserId);
    if (rs) return { stream: rs, isLocal: false, name: getUsername(presenterUserId) };

    return null;
  }, [presenterUserId, screenStream, localUserId, localUsername, remoteMap, getUsername]);

  const total       = allParticipants.length;
  const desktopCols = useMemo(() => gridCols(total), [total]);
  const desktopRows = useMemo(() => Math.ceil(total / desktopCols), [total, desktopCols]);
  const mobileCols  = total <= 2 ? 1 : 2;

  const fullscreenP = useMemo(
    () => fullscreenId ? allParticipants.find(p => p.id === fullscreenId) : null,
    [fullscreenId, allParticipants]
  );

  // Speaker view data — computed even when not in speaker view
  const speakerLayout = useMemo(() => {
    const mainId  = pinnedUserId ?? activeSpeaker ?? (remoteEntries[0]?.[0] ?? localUserId);
    const main    = allParticipants.find(p => p.id === mainId) ?? allParticipants[0];
    const sidebar = allParticipants.filter(p => p.id !== main?.id);
    return { main, sidebar };
  }, [pinnedUserId, activeSpeaker, remoteEntries, localUserId, allParticipants]);

  // ── Conditional renders AFTER all hooks ───────────────────────────────

  if (screenInfo) {
    return (
      <ScreenShareView
        screenStream={screenInfo.stream}
        isLocalSharing={screenInfo.isLocal}
        presenterName={screenInfo.name}
        onStopSharing={screenInfo.isLocal ? onStopSharing : undefined}
        onControlsReveal={onControlsReveal}
      />
    );
  }

  if (viewMode === 'speaker') {
    const { main, sidebar } = speakerLayout;
    return (
      <div className="w-full h-full flex flex-col sm:flex-row bg-black overflow-hidden">
        <div className="flex-1 relative min-h-0 min-w-0">
          <VideoTile
            stream={main.stream} username={main.username}
            isMuted={main.isMuted} isVideoOff={main.isVideoOff}
            isLocal={main.isLocal} isActive={activeSpeaker === main.id}
            isPinned={pinnedUserId === main.id}
            onPin={() => onPin?.(main.id)} onMaximize={() => setFullscreenId(main.id)}
            className="w-full h-full rounded-none"
          />
        </div>
        {sidebar.length > 0 && (
          <>
            <div className="flex sm:hidden flex-shrink-0 gap-1.5 overflow-x-auto
                            items-center px-1.5 py-1.5 bg-slate-950"
              style={{ height: 90, scrollbarWidth: 'none' }}>
              {sidebar.map(p => (
                <div key={p.id} className="flex-shrink-0 rounded-xl overflow-hidden cursor-pointer"
                  style={{ width: 64, height: '100%' }} onClick={() => onPin?.(p.id)}>
                  <VideoTile stream={p.stream} username={p.username}
                    isMuted={p.isMuted} isVideoOff={p.isVideoOff}
                    isLocal={p.isLocal} isActive={activeSpeaker === p.id}
                    isFloating className="w-full h-full rounded-none" />
                </div>
              ))}
            </div>
            <div className="hidden sm:flex w-[176px] flex-col gap-1 overflow-y-auto p-1 flex-shrink-0 bg-slate-950/60">
              {sidebar.map(p => (
                <div key={p.id} className="flex-shrink-0" style={{ height: 110 }}>
                  <VideoTile stream={p.stream} username={p.username}
                    isMuted={p.isMuted} isVideoOff={p.isVideoOff}
                    isLocal={p.isLocal} isActive={activeSpeaker === p.id}
                    isPinned={pinnedUserId === p.id}
                    onPin={() => onPin?.(p.id)} onMaximize={() => setFullscreenId(p.id)}
                    className="w-full h-full rounded-xl cursor-pointer"
                    onDoubleClick={() => onPin?.(p.id)} />
                </div>
              ))}
            </div>
          </>
        )}
        <AnimatePresence>
          {fullscreenP && (
            <FullscreenOverlay participant={fullscreenP} activeSpeaker={activeSpeaker} onClose={() => setFullscreenId(null)} />
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Grid view
  return (
    <>
      {/* Mobile */}
      <div className="sm:hidden w-full h-full overflow-y-auto bg-black"
        style={{ display: 'grid', gridTemplateColumns: `repeat(${mobileCols}, 1fr)`, gap: 2 }}>
        {allParticipants.map(p => (
          <div key={p.id} className="relative w-full"
            style={{ paddingBottom: total <= 2 ? '56.25%' : '100%' }}>
            <div className="absolute inset-0">
              <VideoTile stream={p.stream} username={p.username}
                isMuted={p.isMuted} isVideoOff={p.isVideoOff}
                isLocal={p.isLocal} isActive={activeSpeaker === p.id}
                isPinned={pinnedUserId === p.id}
                onPin={() => onPin?.(p.id)} onMaximize={() => setFullscreenId(p.id)}
                className="w-full h-full rounded-none" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop */}
      <div className="hidden sm:block absolute inset-0 bg-slate-950 p-1">
        <div style={{
          display: 'grid', width: '100%', height: '100%',
          gridTemplateColumns: `repeat(${desktopCols}, 1fr)`,
          gridTemplateRows: `repeat(${desktopRows}, 1fr)`,
          gap: 4,
        }}>
          {allParticipants.map(p => (
            <VideoTile key={p.id} stream={p.stream} username={p.username}
              isMuted={p.isMuted} isVideoOff={p.isVideoOff}
              isLocal={p.isLocal} isActive={activeSpeaker === p.id}
              isPinned={pinnedUserId === p.id}
              onPin={() => onPin?.(p.id)} onMaximize={() => setFullscreenId(p.id)}
              className="rounded-2xl min-h-0" />
          ))}
        </div>
      </div>

      <AnimatePresence>
        {fullscreenP && (
          <FullscreenOverlay participant={fullscreenP} activeSpeaker={activeSpeaker} onClose={() => setFullscreenId(null)} />
        )}
      </AnimatePresence>
    </>
  );
});

MeetingLayout.displayName = 'MeetingLayout';
export default MeetingLayout;