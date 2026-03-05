import { useState, useCallback, memo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, Link, Mail, MessageSquare } from 'lucide-react';
import toast from 'react-hot-toast';

const ShareModal = memo(({ isOpen, onClose, roomId, meetingLink }) => {
  const [copied, setCopied] = useState(false);

  // Reset copied on open
  useEffect(() => {
    if (isOpen) setCopied(false);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(meetingLink);
      setCopied(true);
      toast.success('Link copied!');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Failed to copy');
    }
  }, [meetingLink]);

  const shareVia = useCallback((method) => {
    const text = `Join my video call: ${meetingLink}`;
    if (method === 'email') {
      window.open(`mailto:?subject=Join%20my%20video%20call&body=${encodeURIComponent(text)}`);
    } else if (method === 'sms') {
      window.open(`sms:?body=${encodeURIComponent(text)}`);
    } else if (navigator.share) {
      navigator.share({ title: 'Video Call', text, url: meetingLink }).catch(() => {});
    } else {
      copyLink();
    }
  }, [meetingLink, copyLink]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="share-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            key="share-modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{ opacity: 0,    scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            className="fixed inset-x-4 bottom-4 sm:inset-auto sm:top-1/2 sm:left-1/2
                       sm:-translate-x-1/2 sm:-translate-y-1/2 z-[201]
                       bg-slate-900 rounded-2xl shadow-2xl border border-white/12
                       w-auto sm:w-[400px] overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-white/8">
              <div>
                <h2 className="text-white font-semibold text-base">Share this call</h2>
                <p className="text-slate-400 text-xs mt-0.5">Invite others to join</p>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20
                           flex items-center justify-center text-slate-300 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* Room ID chip */}
              <div>
                <p className="text-slate-400 text-xs font-medium mb-1.5">Room ID</p>
                <div className="bg-slate-800 rounded-xl px-4 py-2.5 flex items-center justify-between gap-3">
                  <span className="text-white font-mono text-sm tracking-widest truncate">
                    {roomId}
                  </span>
                </div>
              </div>

              {/* Meeting link */}
              <div>
                <p className="text-slate-400 text-xs font-medium mb-1.5">Meeting Link</p>
                <div className="bg-slate-800 rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <Link className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <span className="flex-1 text-slate-300 text-xs truncate font-mono">
                    {meetingLink}
                  </span>
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={copyLink}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                text-xs font-semibold transition-all
                      ${copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-blue-600 hover:bg-blue-500 text-white'}`}
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy'}
                  </motion.button>
                </div>
              </div>

              {/* Share via */}
              <div>
                <p className="text-slate-400 text-xs font-medium mb-2">Share via</p>
                <div className="grid grid-cols-3 gap-2">
                  <ShareViaBtn
                    icon={<Mail className="w-4 h-4" />}
                    label="Email"
                    onClick={() => shareVia('email')}
                  />
                  <ShareViaBtn
                    icon={<MessageSquare className="w-4 h-4" />}
                    label="SMS"
                    onClick={() => shareVia('sms')}
                  />
                  <ShareViaBtn
                    icon={<span className="text-base">↗</span>}
                    label="More"
                    onClick={() => shareVia('native')}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
});

const ShareViaBtn = ({ icon, label, onClick }) => (
  <motion.button
    whileTap={{ scale: 0.94 }}
    onClick={onClick}
    className="flex flex-col items-center gap-1.5 py-3 rounded-xl bg-slate-800
               hover:bg-slate-700 text-slate-300 transition-all"
  >
    {icon}
    <span className="text-[10px] font-medium">{label}</span>
  </motion.button>
);

ShareModal.displayName = 'ShareModal';
export default ShareModal;