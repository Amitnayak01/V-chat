/**
 * IncomingAudioCall.jsx — no-op shim
 * ────────────────────────────────────
 * The incoming call UI (accept/decline screen) is fully handled inside
 * AudioCallUI.jsx which manages ALL call states:
 *   incoming → calling → connecting → connected
 *
 * This file is kept so existing <IncomingAudioCall /> render sites don't
 * break. It renders nothing. Safe to delete all usages once confirmed.
 */
const IncomingAudioCall = () => null;
export default IncomingAudioCall;