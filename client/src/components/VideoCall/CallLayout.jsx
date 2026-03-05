import { useState, useRef, useCallback, useMemo, memo } from 'react';
import { motion } from 'framer-motion';
import VideoTile from './VideoTile';
import ScreenShareView from './ScreenShareView';

const toMap = (rs) =>
  rs instanceof Map ? rs : new Map(Object.entries(rs ?? {}));

const CallLayout = memo(({
  localStream,
  remoteStreams,
  localUserId,
  localUsername,
  isMuted,
  isVideoOff,
  activeSpeaker,
  participants   = [],
  screenStream    = null,
  presenterUserId = null,
  onStopSharing,
  onControlsReveal,
  hostMutedIds    = new Set(),  // ── MUTE CONTROL: Set of userId muted by host
}) => {
  // ── ALL hooks declared unconditionally at the top ──────────────────────
  const [swapped,  setSwapped]  = useState(false);
  const [pipPos,   setPipPos]   = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const remoteMap = useMemo(() => toMap(remoteStreams), [remoteStreams]);
  const remoteEntries = useMemo(() => Array.from(remoteMap.entries()), [remoteMap]);
  const totalCount = 1 + remoteEntries.length;

  const getUsername = useCallback((uid) => {
    const p = participants.find(p => (p.userId ?? p) === uid);
    return p?.username ?? `User ${String(uid).slice(0, 4)}`;
  }, [participants]);

  const screenInfo = useMemo(() => {
    // ONLY trust the explicit socket-signalled presenterUserId.
    // Never auto-detect via track labels or contentHint — that causes
    // hall-of-mirrors loops when the shared tab IS the video call itself.
    if (!presenterUserId) return null;

    // Local user is sharing — use the dedicated screenStream (not localStream)
    if (presenterUserId === localUserId) {
      if (screenStream) return { stream: screenStream, isLocal: true, name: localUsername };
      return null; // screenStream not yet assigned, wait
    }

    // Remote presenter — their replaced video track arrives in remoteStreams
    const rs = remoteMap.get(presenterUserId);
    if (rs) return { stream: rs, isLocal: false, name: getUsername(presenterUserId) };

    return null;
  }, [presenterUserId, screenStream, localUserId, localUsername, remoteMap, getUsername]);

  const camTiles = useMemo(() => [
    { id: localUserId, stream: localStream, username: localUsername, isMuted, isVideoOff, isLocal: true, isMutedByHost: false },
    ...remoteEntries.map(([id, s]) => ({
      id, stream: s, username: getUsername(id),
      isMuted: hostMutedIds.has(id), isVideoOff: false, isLocal: false,
      isMutedByHost: hostMutedIds.has(id),
    })),
  ], [localUserId, localStream, localUsername, isMuted, isVideoOff, remoteEntries, getUsername, hostMutedIds]);

  // PIP drag handlers — must be declared even when screen sharing
  const onPointerDown = useCallback((e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { mx: e.clientX, my: e.clientY, px: pipPos.x, py: pipPos.y };
  }, [pipPos]);

  const onPointerMove = useCallback((e) => {
    if (!dragging) return;
    const d = dragRef.current;
    setPipPos({ x: d.px + (e.clientX - d.mx), y: d.py + (e.clientY - d.my) });
  }, [dragging]);

  const onPointerUp = useCallback(() => setDragging(false), []);

  // Main/PIP layout computation — must be declared even when screen sharing
  const layout = useMemo(() => {
    if (totalCount <= 1 || totalCount >= 4 || !remoteEntries.length) {
      return { mainId: null, mainStream: null, mainUsername: null, mainIsLocal: false, pipEntries: [] };
    }
    let mId, mStream, mUsername, mIsLocal;
    if (totalCount === 2) {
      if (swapped) {
        mId = localUserId; mStream = localStream; mUsername = localUsername; mIsLocal = true;
      } else {
        [mId, mStream] = remoteEntries[0];
        mUsername = getUsername(mId); mIsLocal = false;
      }
    } else {
      const active = remoteEntries.find(([uid]) => uid === activeSpeaker);
      [mId, mStream] = active ?? remoteEntries[0];
      mUsername = getUsername(mId); mIsLocal = false;
    }
    const pip = totalCount === 2
      ? swapped
        ? [{ id: remoteEntries[0][0], stream: remoteEntries[0][1], isLocal: false }]
        : [{ id: '__local__', stream: localStream, isLocal: true }]
      : [
          { id: '__local__', stream: localStream, isLocal: true },
          ...remoteEntries.filter(([uid]) => uid !== mId).map(([uid, s]) => ({ id: uid, stream: s, isLocal: false })),
        ];
    return { mainId: mId, mainStream: mStream, mainUsername: mUsername, mainIsLocal: mIsLocal, pipEntries: pip };
  }, [totalCount, swapped, localUserId, localStream, localUsername, remoteEntries, getUsername, activeSpeaker]);

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

  if (totalCount === 1) {
    return (
      <div className="w-full h-full relative bg-black">
        <VideoTile stream={localStream} username={localUsername}
          isMuted={isMuted} isVideoOff={isVideoOff} isLocal
          className="w-full h-full rounded-none" />
        <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
      </div>
    );
  }

  if (totalCount >= 4) {
    const cols = 2;
    const rows = Math.ceil(camTiles.length / cols);
    return (
      <div className="w-full h-full bg-black p-1" style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        gap: 4,
      }}>
        {camTiles.map(p => (
          <VideoTile key={p.id} stream={p.stream} username={p.username}
            isMuted={p.isMuted} isVideoOff={p.isVideoOff} isLocal={p.isLocal}
            isMutedByHost={p.isMutedByHost}
            isActive={activeSpeaker === p.id} className="rounded-xl" />
        ))}
      </div>
    );
  }

  const { mainId, mainStream, mainUsername, mainIsLocal, pipEntries } = layout;

  return (
    <div className="w-full h-full relative overflow-hidden bg-black">
      <VideoTile
        stream={mainStream} username={mainUsername}
        isMuted={mainIsLocal ? isMuted : hostMutedIds.has(mainId)}
        isVideoOff={mainIsLocal ? isVideoOff : false}
        isMutedByHost={!mainIsLocal && hostMutedIds.has(mainId)}
        isLocal={mainIsLocal} isActive={activeSpeaker === mainId}
        className="w-full h-full rounded-none"
      />
      <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
      <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />

      <div
        className="absolute z-30 select-none"
        style={{
          bottom: `calc(88px - ${pipPos.y}px)`,
          right: `calc(14px - ${pipPos.x}px)`,
          touchAction: 'none',
          cursor: dragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onControlsReveal}
        onPointerUp={onPointerUp}
      >
        <div className="flex flex-col items-end gap-2">
          {pipEntries.map(p => (
            <motion.div
              key={p.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => totalCount === 2 && setSwapped(v => !v)}
              className="overflow-hidden rounded-2xl shadow-2xl cursor-pointer flex-shrink-0"
              style={{
                width: 'clamp(88px,10vw,118px)',
                height: 'clamp(124px,14vw,166px)',
                border: '2px solid rgba(255,255,255,0.18)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
              }}
            >
              <VideoTile
                stream={p.stream}
                username={p.isLocal ? localUsername : getUsername(p.id)}
                isMuted={p.isLocal ? isMuted : false}
                isVideoOff={p.isLocal ? isVideoOff : false}
                isLocal={p.isLocal} isFloating
                isActive={activeSpeaker === (p.isLocal ? localUserId : p.id)}
                className="w-full h-full rounded-none"
              />
            </motion.div>
          ))}
        </div>
        {totalCount === 2 && (
          <p className="text-center text-white/25 text-[9px] mt-1 tracking-wide">tap to swap</p>
        )}
      </div>
    </div>
  );
});

CallLayout.displayName = 'CallLayout';
export default CallLayout;