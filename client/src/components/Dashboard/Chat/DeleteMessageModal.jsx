import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, X, Users, User } from 'lucide-react';

/**
 * DeleteMessageModal — light theme, matches V-Meet chat UI
 *
 * Props:
 *  - isOpen      {boolean}
 *  - isOwn       {boolean}
 *  - onClose     {() => void}
 *  - onDeleteMe  {() => void}
 *  - onDeleteAll {() => void}  (only triggered when isOwn)
 */
const DeleteMessageModal = ({ isOpen, isOwn, onClose, onDeleteMe, onDeleteAll }) => {
  const overlayRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position:            'fixed',
        inset:               0,
        zIndex:              9999,
        display:             'flex',
        alignItems:          'center',
        justifyContent:      'center',
        padding:             '16px',
        background:          'rgba(15, 23, 42, 0.38)',
        backdropFilter:      'blur(4px)',
        WebkitBackdropFilter:'blur(4px)',
        animation:           'dmOverlayIn 0.18s ease forwards',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dm-title"
        style={{
          width:        '100%',
          maxWidth:     '360px',
          background:   '#ffffff',
          borderRadius: '20px',
          overflow:     'hidden',
          boxShadow:    '0 24px 64px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.06)',
          animation:    'dmModalIn 0.22s cubic-bezier(0.34,1.56,0.64,1) forwards',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '18px 20px 14px',
          borderBottom:   '1px solid #f1f5f9',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width:          36,
              height:         36,
              borderRadius:   '50%',
              background:     '#fef2f2',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
            }}>
              <Trash2 style={{ width: 16, height: 16, color: '#ef4444' }} />
            </div>
            <span
              id="dm-title"
              style={{
                fontSize:      15,
                fontWeight:    700,
                color:         '#0f172a',
                fontFamily:    '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif',
                letterSpacing: '-0.01em',
              }}
            >
              Delete message?
            </span>
          </div>

          <button
            onClick={onClose}
            style={{
              width:          28,
              height:         28,
              borderRadius:   '50%',
              background:     '#f1f5f9',
              border:         'none',
              cursor:         'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:     0,
              transition:     'background 0.15s ease',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
            aria-label="Close"
          >
            <X style={{ width: 14, height: 14, color: '#64748b' }} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div style={{ padding: '14px 20px 20px' }}>
          <p style={{
            fontSize:     13,
            color:        '#64748b',
            marginBottom: 16,
            lineHeight:   1.55,
            fontFamily:   '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
          }}>
            {isOwn
              ? 'Choose who this message will be deleted for.'
              : 'This message will be removed from your chat only.'}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Delete for Everyone — only when user owns the message */}
            {isOwn && (
              <ActionButton
                icon={<Users style={{ width: 15, height: 15 }} />}
                label="Delete for Everyone"
                sublabel="Removes message for all participants"
                variant="danger"
                onClick={onDeleteAll}
              />
            )}

            {/* Delete for Me */}
            <ActionButton
              icon={<User style={{ width: 15, height: 15 }} />}
              label="Delete for Me"
              sublabel="Only you won't see this message"
              variant={isOwn ? 'secondary' : 'danger'}
              onClick={onDeleteMe}
            />

            {/* Cancel */}
            <button
              onClick={onClose}
              style={{
                width:        '100%',
                padding:      '11px 16px',
                borderRadius: 12,
                border:       '1.5px solid #e2e8f0',
                background:   'transparent',
                color:        '#64748b',
                fontSize:     13,
                fontWeight:   600,
                cursor:       'pointer',
                transition:   'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
                fontFamily:   '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
                marginTop:    2,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background  = '#f8fafc';
                e.currentTarget.style.borderColor = '#cbd5e1';
                e.currentTarget.style.color       = '#334155';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background  = 'transparent';
                e.currentTarget.style.borderColor = '#e2e8f0';
                e.currentTarget.style.color       = '#64748b';
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes dmOverlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes dmModalIn {
          from { opacity: 0; transform: scale(0.88) translateY(14px); }
          to   { opacity: 1; transform: scale(1)    translateY(0px);  }
        }
      `}</style>
    </div>,
    document.body
  );
};

/* ── Reusable action button ─────────────────────────────────────────────── */
const ActionButton = ({ icon, label, sublabel, variant, onClick }) => {
  const isDanger = variant === 'danger';

  const s = isDanger ? {
    bg:        '#fef2f2',
    border:    '#fecaca',
    hoverBg:   '#fee2e2',
    iconBg:    '#fee2e2',
    iconColor: '#ef4444',
    label:     '#dc2626',
    sub:       '#f87171',
  } : {
    bg:        '#f8fafc',
    border:    '#e2e8f0',
    hoverBg:   '#f1f5f9',
    iconBg:    '#e2e8f0',
    iconColor: '#475569',
    label:     '#334155',
    sub:       '#94a3b8',
  };

  return (
    <button
      onClick={onClick}
      style={{
        width:        '100%',
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '12px 14px',
        borderRadius: 12,
        border:       `1.5px solid ${s.border}`,
        background:   s.bg,
        cursor:       'pointer',
        textAlign:    'left',
        transition:   'background 0.15s ease, transform 0.1s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = s.hoverBg;
        e.currentTarget.style.transform  = 'scale(1.01)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = s.bg;
        e.currentTarget.style.transform  = 'scale(1)';
      }}
      onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.98)'; }}
      onMouseUp={e   => { e.currentTarget.style.transform = 'scale(1.01)'; }}
    >
      <div style={{
        width:          34,
        height:         34,
        borderRadius:   10,
        background:     s.iconBg,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        flexShrink:     0,
        color:          s.iconColor,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize:      14,
          fontWeight:    600,
          color:         s.label,
          margin:        0,
          fontFamily:    '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
          letterSpacing: '-0.01em',
        }}>
          {label}
        </p>
        <p style={{
          fontSize:   11.5,
          color:      s.sub,
          margin:     '2px 0 0',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
        }}>
          {sublabel}
        </p>
      </div>
    </button>
  );
};

export default DeleteMessageModal;