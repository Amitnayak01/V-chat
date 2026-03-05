/**
 * useRetryQueue.js
 *
 * Manages optimistic message sending with automatic retry.
 * Failed messages are queued and retried with exponential backoff.
 */

import { useState, useCallback, useRef } from 'react';
import { nanoid } from 'nanoid'; // npm install nanoid

const MAX_RETRIES    = 3;
const BACKOFF_BASE   = 1000; // ms

export const useRetryQueue = ({ onSend }) => {
  const [pendingMessages, setPendingMessages] = useState([]);
  const retryTimers = useRef(new Map());

  const scheduleRetry = useCallback(
    (tempId, payload, attempt) => {
      const delay = BACKOFF_BASE * Math.pow(2, attempt);
      const timer = setTimeout(async () => {
        try {
          const result = await onSend(payload);
          // Success: update optimistic message with real data
          setPendingMessages((prev) =>
            prev.map((m) =>
              m.tempId === tempId
                ? { ...m, ...result.message, _tempId: tempId, status: 'sent', sending: false, failed: false }
                : m
            )
          );
          retryTimers.current.delete(tempId);
        } catch (err) {
          if (attempt + 1 < MAX_RETRIES) {
            scheduleRetry(tempId, payload, attempt + 1);
          } else {
            // Give up
            setPendingMessages((prev) =>
              prev.map((m) =>
                m.tempId === tempId
                  ? { ...m, status: 'failed', sending: false, failed: true }
                  : m
              )
            );
          }
        }
      }, delay);

      retryTimers.current.set(tempId, timer);
    },
    [onSend]
  );

  const sendOptimistic = useCallback(
    async (messageData, senderUser) => {
      const tempId          = nanoid();
      const clientMessageId = nanoid();

      // Create optimistic message
      const optimistic = {
        _id:             `temp_${tempId}`,
        tempId,
        clientMessageId,
        content:         messageData.content || '',
        type:            messageData.type || 'text',
        attachments:     messageData.attachments || [],
        replyTo:         messageData.replyTo || null,
        sender:          senderUser,
        receiver:        { _id: messageData.receiverId },
        conversationId:  messageData.conversationId,
        createdAt:       new Date().toISOString(),
        status:          'sending',
        sending:         true,
        failed:          false,
        reactions:       [],
        starredBy:       [],
      };

      setPendingMessages((prev) => [...prev, optimistic]);

      const payload = { ...messageData, clientMessageId, tempId };

      try {
        const result = await onSend(payload);
        // Replace optimistic with real message
        setPendingMessages((prev) => prev.filter((m) => m.tempId !== tempId));
        return { ...result, tempId };
      } catch (err) {
        // Mark failed, schedule retry
        setPendingMessages((prev) =>
          prev.map((m) =>
            m.tempId === tempId
              ? { ...m, status: 'failed', sending: false, failed: true }
              : m
          )
        );
        scheduleRetry(tempId, payload, 0);
        throw err;
      }
    },
    [onSend, scheduleRetry]
  );

  const retryMessage = useCallback(
    (tempId) => {
      setPendingMessages((prev) =>
        prev.map((m) =>
          m.tempId === tempId
            ? { ...m, status: 'sending', sending: true, failed: false }
            : m
        )
      );

      const pending = pendingMessages.find((m) => m.tempId === tempId);
      if (!pending) return;

      const payload = {
        conversationId:  pending.conversationId,
        receiverId:      pending.receiver?._id,
        content:         pending.content,
        type:            pending.type,
        attachments:     pending.attachments,
        replyTo:         pending.replyTo,
        clientMessageId: pending.clientMessageId,
      };

      scheduleRetry(tempId, payload, 0);
    },
    [pendingMessages, scheduleRetry]
  );

  const cancelMessage = useCallback((tempId) => {
    const timer = retryTimers.current.get(tempId);
    if (timer) {
      clearTimeout(timer);
      retryTimers.current.delete(tempId);
    }
    setPendingMessages((prev) => prev.filter((m) => m.tempId !== tempId));
  }, []);

  const clearPending = useCallback(() => {
    retryTimers.current.forEach(clearTimeout);
    retryTimers.current.clear();
    setPendingMessages([]);
  }, []);

  return {
    pendingMessages,
    sendOptimistic,
    retryMessage,
    cancelMessage,
    clearPending,
  };
};