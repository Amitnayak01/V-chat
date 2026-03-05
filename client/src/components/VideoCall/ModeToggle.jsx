import { memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, LayoutGrid } from 'lucide-react';

const ModeToggle = memo(({ mode, onToggle }) => {
  const isCall = mode === 'call';

  return (
    <motion.button
      onClick={onToggle}
      whileTap={{ scale: 0.94 }}
      title={isCall ? 'Switch to Meeting Mode' : 'Switch to Call Mode'}
      className={`
        relative flex items-center gap-2 px-3 py-1.5 rounded-full
        text-xs font-semibold border transition-colors duration-300
        overflow-hidden select-none
        ${isCall
          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/28'
          : 'bg-violet-500/20  border-violet-500/40  text-violet-300  hover:bg-violet-500/28'
        }
      `}
    >
      <AnimatePresence mode="wait">
        {isCall ? (
          <motion.span
            key="call-icon"
            initial={{ opacity: 0, rotate: -20 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 20 }}
            transition={{ duration: 0.15 }}
            className="relative flex-shrink-0"
          >
            <Video className="w-3.5 h-3.5" />
          </motion.span>
        ) : (
          <motion.span
            key="meet-icon"
            initial={{ opacity: 0, rotate: -20 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 20 }}
            transition={{ duration: 0.15 }}
            className="relative flex-shrink-0"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        <motion.span
          key={mode}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -5 }}
          transition={{ duration: 0.14 }}
          className="relative hidden sm:inline"
        >
          {isCall ? 'Call Mode' : 'Meeting Mode'}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
});

ModeToggle.displayName = 'ModeToggle';
export default ModeToggle;