// src/utils/retryFetch.js
// Retries any async API call when the backend is cold-starting (Render free tier, etc.)

export const withRetry = async (
  apiFn,
  {
    retries   = 8,
    delayMs   = 5000,
    onWaiting = () => {},
  } = {}
) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await apiFn();
      return result;
    } catch (err) {
      const isLastAttempt = attempt === retries;

      // Only retry on network/server-down errors — NOT on 4xx user errors
      const isRetryable =
        err?.code === 'ERR_NETWORK'      ||
        err?.code === 'ECONNABORTED'     ||   // axios timeout
        err?.message === 'Network Error' ||
        err?.response?.status === 502    ||   // bad gateway
        err?.response?.status === 503    ||   // service unavailable
        err?.response?.status === 504;        // gateway timeout

      if (isLastAttempt || !isRetryable) throw err;

      onWaiting(attempt, retries);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
};