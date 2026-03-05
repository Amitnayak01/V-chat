/**
 * useDMSocket.js
 *
 * Centralised hook that registers all DM socket listeners and returns
 * stable dispatch helpers. Components never touch socket directly.
 */

import { useEffect, useCallback, useRef } from 'react';
import { useSocket } from '../context/SocketContext';

export const useDMSocket = ({
  conversationId,
  currentUserId,
  onNewMessage,
  onMessageEdit,
  onMessageDelete,
  onMessageReaction,
  onMessageDelivered,
  onMessageRead,
  onTyping,
}) => {
  const { socket, emit } = useSocket();
  const conversationRef  = useRef(conversationId);

  useEffect(() => {
    conversationRef.current = conversationId;
  }, [conversationId]);

  // Join / leave conversation room
  useEffect(() => {
    if (!socket || !conversationId) return;

    emit('conversation:join', { conversationId });
    return () => {
      emit('conversation:leave', { conversationId });
    };
  }, [socket, conversationId, emit]);

  // Register event listeners
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (payload) => {
      if (payload.conversationId === conversationRef.current) {
        onNewMessage?.(payload.message);
      } else {
        // Still notify for badge update on other convs
        onNewMessage?.(payload.message, true /* isBackground */);
      }
    };

    const handleMessageEdit = (payload) => {
      if (payload.conversationId === conversationRef.current) {
        onMessageEdit?.(payload);
      }
    };

    const handleMessageDelete = (payload) => {
      if (payload.conversationId === conversationRef.current) {
        onMessageDelete?.(payload);
      }
    };

    const handleMessageReaction = (payload) => {
      if (payload.conversationId === conversationRef.current) {
        onMessageReaction?.(payload);
      }
    };

    const handleDelivered = (payload) => {
      if (payload.conversationId === conversationRef.current) {
        onMessageDelivered?.(payload);
      }
    };

    const handleRead = (payload) => {
      if (payload.conversationId === conversationRef.current) {
        onMessageRead?.(payload);
      }
    };

    const handleTyping = (payload) => {
      if (
        payload.conversationId === conversationRef.current &&
        payload.userId !== currentUserId
      ) {
        onTyping?.(payload);
      }
    };

    socket.on('message:new',       handleNewMessage);
    socket.on('message:edit',      handleMessageEdit);
    socket.on('message:delete',    handleMessageDelete);
    socket.on('message:reaction',  handleMessageReaction);
    socket.on('message:delivered', handleDelivered);
    socket.on('message:read',      handleRead);
    socket.on('conversation:typing', handleTyping);

    return () => {
      socket.off('message:new',       handleNewMessage);
      socket.off('message:edit',      handleMessageEdit);
      socket.off('message:delete',    handleMessageDelete);
      socket.off('message:reaction',  handleMessageReaction);
      socket.off('message:delivered', handleDelivered);
      socket.off('message:read',      handleRead);
      socket.off('conversation:typing', handleTyping);
    };
  }, [
    socket,
    currentUserId,
    onNewMessage,
    onMessageEdit,
    onMessageDelete,
    onMessageReaction,
    onMessageDelivered,
    onMessageRead,
    onTyping,
  ]);

  /* ── Emit helpers ────────────────────────────────────────────────────── */

  const sendMessage = useCallback(
    (payload) =>
      new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Socket not connected'));
        socket.emit('message:send', payload, (ack) => {
          if (ack?.success) resolve(ack);
          else reject(new Error(ack?.error || 'Send failed'));
        });
      }),
    [socket]
  );

  const editMessage = useCallback(
    (messageId, content) =>
      new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Not connected'));
        socket.emit('message:edit', { messageId, content, conversationId }, (ack) => {
          if (ack?.success) resolve(ack);
          else reject(new Error(ack?.error || 'Edit failed'));
        });
      }),
    [socket, conversationId]
  );

  const deleteMessage = useCallback(
    (messageId, everyone = false) =>
      new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Not connected'));
        socket.emit('message:delete', { messageId, everyone, conversationId }, (ack) => {
          if (ack?.success) resolve(ack);
          else reject(new Error(ack?.error || 'Delete failed'));
        });
      }),
    [socket, conversationId]
  );

  const addReaction = useCallback(
    (messageId, emoji) =>
      new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Not connected'));
        socket.emit('message:reaction:add', { messageId, emoji, conversationId }, (ack) => {
          if (ack?.success) resolve(ack);
          else reject(new Error(ack?.error || 'Reaction failed'));
        });
      }),
    [socket, conversationId]
  );

  const removeReaction = useCallback(
    (messageId, emoji) =>
      new Promise((resolve, reject) => {
        if (!socket) return reject(new Error('Not connected'));
        socket.emit('message:reaction:remove', { messageId, emoji, conversationId }, (ack) => {
          if (ack?.success) resolve(ack);
          else reject(new Error(ack?.error || 'Remove reaction failed'));
        });
      }),
    [socket, conversationId]
  );

  const sendTyping = useCallback(
    (isTyping, username) => {
      if (!socket || !conversationId) return;
      socket.emit('conversation:typing', { conversationId, isTyping, username });
    },
    [socket, conversationId]
  );

  const markRead = useCallback(
    (lastMessageId) => {
      if (!socket || !conversationId) return;
      socket.emit('message:read', { conversationId, lastMessageId });
    },
    [socket, conversationId]
  );

  return {
    sendMessage,
    editMessage,
    deleteMessage,
    addReaction,
    removeReaction,
    sendTyping,
    markRead,
  };
};