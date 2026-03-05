import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Bell, Lock, Key, Eye, EyeOff, Loader2, AlertCircle,
  Trash2, Download, Monitor, Activity, Sun, Moon, Volume2,
  VolumeX, Wifi, BellRing, Smartphone, Mail, Calendar,
  X, User, CheckCircle2, Settings as SettingsIcon,
} from 'lucide-react';
import { useAuth }     from '../../context/AuthContext';
import { settingsAPI } from '../../utils/api';
import toast           from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

/* ─── DESIGN TOKENS ──────────────────────────────── */
const C = {
  bg:       '#F0F2F5',
  surface:  '#FFFFFF',
  surfaceEl:'#F8F9FB',
  border:   '#E4E7EC',
  borderSub:'#EEF0F4',
  ink:      '#0D1117',
  inkSub:   '#3D4451',
  muted:    '#6C7789',
  dim:      '#9AA3B2',
  accent:   '#2563EB',
  accentH:  '#1D4ED8',
  accentL:  '#EFF6FF',
  accentLH: '#DBEAFE',
  red:      '#DC2626',
  redBg:    '#FFF5F5',
  redLine:  '#FECACA',
  green:    '#16A34A',
  greenBg:  '#F0FDF4',
  greenLn:  '#BBF7D0',
  amber:    '#D97706',
  amberBg:  '#FFFBEB',
  purple:   '#7C3AED',
  purpleBg: '#F5F3FF',
  teal:     '#0369A1',
  tealBg:   '#E0F2FE',
};

const SPR  = { type: 'spring', stiffness: 480, damping: 36 };
const EASE = { duration: 0.22, ease: [0.4, 0, 0.2, 1] };
const UP   = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: EASE } };
const STG  = { show: { transition: { staggerChildren: 0.055 } } };

/* ─── NAV ────────────────────────────────────────── */
const NAV = [
  { id: 'sec-password',    label: 'Password',     icon: Lock,     group: 'Security'    },
  { id: 'sec-sessions',    label: 'Sessions',      icon: Activity, group: 'Security'    },
  { id: 'sec-export',      label: 'Data Export',   icon: Download, group: 'Security'    },
  { id: 'sec-danger',      label: 'Danger Zone',   icon: Trash2,   group: 'Security'    },
  { id: 'pref-appearance', label: 'Appearance',    icon: Sun,      group: 'Preferences' },
  { id: 'pref-notif',      label: 'Notifications', icon: Bell,     group: 'Preferences' },
  { id: 'pref-av',         label: 'Audio & Video', icon: Volume2,  group: 'Preferences' },
];

/* ─── HOOKS ──────────────────────────────────────── */
function useActiveSection() {
  const [active, setActive] = useState(NAV[0].id);
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-12% 0px -68% 0px' },
    );
    NAV.forEach(({ id }) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);
  return active;
}

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

const scrollTo = id => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

/* ─── TOGGLE ─────────────────────────────────────── */
const Toggle = ({ id, checked, onChange }) => (
  <button
    id={id} role="switch" aria-checked={checked}
    onClick={() => onChange(!checked)}
    onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onChange(!checked); } }}
    style={{
      position: 'relative', flexShrink: 0, width: 44, height: 24,
      borderRadius: 99, border: 'none', cursor: 'pointer',
      background: checked ? C.accent : '#D1D5DB',
      outline: 'none', transition: 'background .22s cubic-bezier(.4,0,.2,1)',
      boxShadow: checked ? `0 0 0 3px ${C.accentLH}` : 'none',
    }}
  >
    <motion.span
      animate={{ x: checked ? 22 : 3 }}
      transition={SPR}
      style={{
        position: 'absolute', top: 3, width: 18, height: 18, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.20)',
      }}
    />
  </button>
);

/* ─── TOGGLE ROW ─────────────────────────────────── */
const TR = ({ label, description, value, onChange, icon: Icon }) => (
  <div
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
      padding: '14px 0', borderBottom: `1px solid ${C.borderSub}`,
      transition: 'background .15s',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
      {Icon && (
        <div style={{
          width: 34, height: 34, borderRadius: 8, background: C.surfaceEl,
          border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon style={{ width: 14, height: 14, color: C.muted }} />
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <label
          htmlFor={`t-${label.replace(/\s/g, '-').toLowerCase()}`}
          style={{ display: 'block', fontSize: 13.5, fontWeight: 500, color: C.inkSub, cursor: 'pointer', lineHeight: 1.3 }}
        >
          {label}
        </label>
        {description && (
          <p style={{ fontSize: 12, color: C.dim, marginTop: 2, lineHeight: 1.5 }}>
            {description}
          </p>
        )}
      </div>
    </div>
    <Toggle id={`t-${label.replace(/\s/g, '-').toLowerCase()}`} checked={value} onChange={onChange} />
  </div>
);

/* ─── CARD ───────────────────────────────────────── */
const Card = ({ id, children, danger = false }) => (
  <motion.section
    id={id}
    variants={UP}
    style={{
      background: C.surface,
      borderRadius: 16,
      overflow: 'hidden',
      border: `1px solid ${danger ? C.redLine : C.border}`,
      boxShadow: danger
        ? '0 1px 3px rgba(220,38,38,.07), 0 4px 16px rgba(220,38,38,.04)'
        : '0 1px 3px rgba(0,0,0,.04), 0 4px 16px rgba(0,0,0,.04)',
      scrollMarginTop: 32,
    }}
  >
    {children}
  </motion.section>
);

/* ─── CARD HEAD ──────────────────────────────────── */
const CH = ({ icon: Icon, title, subtitle, iColor, iBg }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 14, padding: '16px 22px',
    borderBottom: `1px solid ${C.borderSub}`, background: C.surfaceEl,
  }}>
    <div style={{
      width: 38, height: 38, borderRadius: 10, background: iBg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      boxShadow: `0 0 0 1px ${iBg}`,
    }}>
      <Icon style={{ width: 16, height: 16, color: iColor }} />
    </div>
    <div>
      <h3 style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, margin: 0, lineHeight: 1.25, letterSpacing: '-.01em' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>{subtitle}</p>}
    </div>
  </div>
);

/* ─── SECTION LABEL ──────────────────────────────── */
const SectionLabel = ({ label }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '36px 0 16px' }}>
    <span style={{
      fontSize: 10.5, fontWeight: 700, color: C.dim, textTransform: 'uppercase',
      letterSpacing: '.1em', whiteSpace: 'nowrap',
    }}>{label}</span>
    <div style={{ flex: 1, height: 1, background: C.border }} />
  </div>
);

/* ─── PASSWORD FIELD ─────────────────────────────── */
const PF = ({ label, value, onChange, show, onToggle, error, placeholder, fRef }) => (
  <div>
    <label style={{
      display: 'block', fontSize: 11, fontWeight: 600, color: C.muted,
      textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 7,
    }}>{label}</label>
    <div style={{ position: 'relative' }}>
      <input
        ref={fRef}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        style={{
          width: '100%', height: 44, padding: '0 44px 0 14px', borderRadius: 10,
          border: `1.5px solid ${error ? C.red : C.border}`,
          background: error ? C.redBg : C.surfaceEl,
          fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit',
          transition: 'all .18s', boxSizing: 'border-box',
        }}
        onFocus={e => {
          e.target.style.background = '#fff';
          e.target.style.borderColor = error ? C.red : C.accent;
          e.target.style.boxShadow = error ? '0 0 0 3px rgba(220,38,38,.1)' : '0 0 0 3px rgba(37,99,235,.12)';
        }}
        onBlur={e => {
          e.target.style.background = error ? C.redBg : C.surfaceEl;
          e.target.style.borderColor = error ? C.red : C.border;
          e.target.style.boxShadow = 'none';
        }}
      />
      <button
        type="button"
        onClick={onToggle}
        style={{
          position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer', color: C.dim, padding: 4,
          borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {show ? <EyeOff style={{ width: 15, height: 15 }} /> : <Eye style={{ width: 15, height: 15 }} />}
      </button>
    </div>
    <AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -4, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.red, marginTop: 6 }}
        >
          <AlertCircle style={{ width: 12, height: 12, flexShrink: 0 }} />{error}
        </motion.p>
      )}
    </AnimatePresence>
  </div>
);

/* ─── CHANGE PASSWORD MODAL ──────────────────────── */
const PasswordModal = ({ onClose }) => {
  const [form,   setForm]   = useState({ current: '', newPass: '', confirm: '' });
  const [show,   setShow]   = useState({ current: false, newPass: false, confirm: false });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const fRef = useRef(null);

  useEffect(() => { fRef.current?.focus(); }, []);
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const validate = () => {
    const e = {};
    if (!form.current)                e.current = 'Current password is required';
    if (form.newPass.length < 8)      e.newPass = 'Must be at least 8 characters';
    if (form.newPass !== form.confirm) e.confirm = 'Passwords do not match';
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await settingsAPI.changePassword({ currentPassword: form.current, newPassword: form.newPass });
      toast.success('Password changed successfully!');
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally { setSaving(false); }
  };

  const score = [
    form.newPass.length >= 8,
    /[A-Z]/.test(form.newPass),
    /[0-9]/.test(form.newPass),
    /[^A-Za-z0-9]/.test(form.newPass),
  ].filter(Boolean).length;

  const SM = [null,
    { label: 'Weak',   color: '#EF4444' },
    { label: 'Fair',   color: '#F97316' },
    { label: 'Good',   color: '#3B82F6' },
    { label: 'Strong', color: '#22C55E' },
  ][score];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: .2 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, display: 'flex',
        alignItems: 'flex-end', justifyContent: 'center',
        background: 'rgba(10,14,22,.55)', backdropFilter: 'blur(6px)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={{ type: 'spring', stiffness: 400, damping: 34 }}
        role="dialog" aria-modal="true" aria-labelledby="m-title"
        className="pw-modal"
        style={{
          width: '100%', maxWidth: 480, background: C.surface,
          borderRadius: '22px 22px 0 0',
          boxShadow: '0 -12px 60px rgba(0,0,0,.22)',
          overflow: 'hidden', fontFamily: "'DM Sans', system-ui, sans-serif",
          maxHeight: '92vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: C.border }} />
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 22px 14px', borderBottom: `1px solid ${C.borderSub}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, background: C.accentL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Key style={{ width: 16, height: 16, color: C.accent }} />
            </div>
            <div>
              <h3 id="m-title" style={{ fontSize: 15.5, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: '-.02em' }}>
                Change Password
              </h3>
              <p style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Update your account credentials</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 34, height: 34, borderRadius: 9, border: 'none',
              background: C.surfaceEl, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: C.muted, transition: 'background .15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.border; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.surfaceEl; }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>

        <div style={{ padding: '22px 22px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Current */}
          <PF
            label="Current Password" value={form.current} fRef={fRef}
            onChange={e => { setForm(f => ({ ...f, current: e.target.value })); setErrors(er => ({ ...er, current: '' })); }}
            show={show.current} onToggle={() => setShow(s => ({ ...s, current: !s.current }))}
            error={errors.current} placeholder="Enter current password"
          />
          {/* New */}
          <div>
            <PF
              label="New Password" value={form.newPass}
              onChange={e => { setForm(f => ({ ...f, newPass: e.target.value })); setErrors(er => ({ ...er, newPass: '' })); }}
              show={show.newPass} onToggle={() => setShow(s => ({ ...s, newPass: !s.newPass }))}
              error={errors.newPass} placeholder="Minimum 8 characters"
            />
            <AnimatePresence>
              {form.newPass && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} style={{ marginTop: 10 }}
                >
                  <div style={{ display: 'flex', gap: 5, marginBottom: 5 }}>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} style={{ height: 3, flex: 1, borderRadius: 99, background: C.border, overflow: 'hidden' }}>
                        <motion.div
                          initial={{ scaleX: 0 }} animate={{ scaleX: i <= score ? 1 : 0 }}
                          transition={{ duration: .25, delay: i * .04 }}
                          style={{ height: '100%', transformOrigin: 'left', background: SM?.color || C.border }}
                        />
                      </div>
                    ))}
                  </div>
                  {SM && <p style={{ fontSize: 11, fontWeight: 600, color: SM.color }}>{SM.label} password</p>}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {/* Confirm */}
          <PF
            label="Confirm Password" value={form.confirm}
            onChange={e => { setForm(f => ({ ...f, confirm: e.target.value })); setErrors(er => ({ ...er, confirm: '' })); }}
            show={show.confirm} onToggle={() => setShow(s => ({ ...s, confirm: !s.confirm }))}
            error={errors.confirm} placeholder="Re-enter new password"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '22px 22px 36px' }}>
          <button
            onClick={handleSubmit} disabled={saving}
            style={{
              width: '100%', height: 48, borderRadius: 12,
              background: saving ? C.accentH : C.accent,
              color: '#fff', fontSize: 15, fontWeight: 600, border: 'none',
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              fontFamily: 'inherit', transition: 'all .18s',
              boxShadow: '0 2px 12px rgba(37,99,235,.35)',
            }}
            onMouseEnter={e => { if (!saving) { e.currentTarget.style.background = C.accentH; e.currentTarget.style.boxShadow = '0 4px 18px rgba(37,99,235,.45)'; } }}
            onMouseLeave={e => { if (!saving) { e.currentTarget.style.background = C.accent; e.currentTarget.style.boxShadow = '0 2px 12px rgba(37,99,235,.35)'; } }}
          >
            {saving ? <Loader2 style={{ width: 16, height: 16, animation: 'spin 1s linear infinite' }} /> : <Lock style={{ width: 16, height: 16 }} />}
            {saving ? 'Saving…' : 'Update Password'}
          </button>
          <button
            onClick={onClose} disabled={saving}
            style={{
              width: '100%', height: 44, borderRadius: 12, background: C.surfaceEl,
              color: C.muted, fontSize: 14, fontWeight: 500,
              border: `1.5px solid ${C.border}`, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.border}
            onMouseLeave={e => e.currentTarget.style.background = C.surfaceEl}
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

/* ══════════════════════════════════════════════════════
   MAIN SETTINGS COMPONENT
══════════════════════════════════════════════════════ */
export default function Settings() {
  const { logout }  = useAuth();
  const navigate    = useNavigate();
  const active      = useActiveSection();
  const winW        = useWindowWidth();
  const isMobile    = winW < 768;
  const mobileNavRef = useRef(null);

  const [showDelConfirm, setShowDelConfirm] = useState(false);
  const [delPass,        setDelPass]        = useState('');
  const [deleting,       setDeleting]       = useState(false);
  const [showPwModal,    setShowPwModal]    = useState(false);

  const [notif, setNotif] = useState({
    incomingCalls: true, chatMessages: true, userOnline: false,
    meetingReminders: true, emailNotifs: false, soundEnabled: true, desktopNotifs: true,
  });
  const [av, setAv] = useState({
    theme: 'system', autoJoinAudio: true, autoJoinVideo: false,
    mirrorVideo: true, noiseSuppression: true, echoCancel: true,
  });

  useEffect(() => {
    if (!isMobile || !mobileNavRef.current) return;
    const el = mobileNavRef.current.querySelector(`[data-id="${active}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [active, isMobile]);

  const handleDeleteAccount = async () => {
    if (!delPass) { toast.error('Please enter your password'); return; }
    setDeleting(true);
    try {
      await settingsAPI.deleteAccount(delPass);
      toast.success('Account deleted successfully');
      logout(); navigate('/login');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete account');
    } finally { setDeleting(false); }
  };

  const handleExportData = async () => {
    try {
      const res  = await settingsAPI.exportData();
      const url  = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href  = url;
      link.setAttribute('download', `vmeet-data-${Date.now()}.json`);
      document.body.appendChild(link); link.click(); link.remove();
      toast.success('Data exported successfully');
    } catch { toast.error('Failed to export data'); }
  };

  const un = (k, v) => setNotif(p => ({ ...p, [k]: v }));
  const ua = (k, v) => setAv(p => ({ ...p, [k]: v }));
  const groups = [...new Set(NAV.map(n => n.group))];

  const THEMES = [
    { id: 'light',  label: 'Light',  icon: Sun,     note: 'Always on' },
    { id: 'dark',   label: 'Dark',   icon: Moon,    note: 'Always on' },
    { id: 'system', label: 'System', icon: Monitor, note: 'Follows OS' },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { -webkit-tap-highlight-color: transparent; }
        .vs { font-family: 'DM Sans', system-ui, -apple-system, sans-serif; font-size: 14px; color: #0D1117; }
        @keyframes spin  { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

        .nb-btn { transition: all .16s; }
        .nb-btn:hover { background: #EFF6FF !important; color: #2563EB !important; }
        .sb-btn:hover { background: #F0F2F5 !important; }
        .db-btn:hover { background: #FEE2E2 !important; }
        .ac-btn:hover { background: #1D4ED8 !important; box-shadow: 0 4px 18px rgba(37,99,235,.45) !important; }

        .tr-row:last-child { border-bottom: none !important; }

        @media(min-width: 480px) {
          .pw-modal { border-radius: 20px !important; max-height: 88vh; }
          .pw-backdrop { align-items: center !important; }
        }

        .settings-layout { display: flex; gap: 36px; align-items: flex-start; }
        .settings-sidebar {
          width: 220px; flex-shrink: 0;
          position: sticky; top: 28px;
          max-height: calc(100vh - 56px); overflow-y: auto;
        }
        .settings-main { flex: 1; min-width: 0; }

        @media(max-width: 767px) {
          .settings-layout  { flex-direction: column; gap: 0; }
          .settings-sidebar { display: none; }
          .settings-main    { width: 100%; }
        }

        .mobile-nav {
          display: none;
          overflow-x: auto; white-space: nowrap;
          padding: 12px 16px 10px; gap: 8px;
          -webkit-overflow-scrolling: touch; scrollbar-width: none;
          position: sticky; top: 0; z-index: 50;
          background: rgba(240,242,245,.97);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid #E4E7EC;
        }
        .mobile-nav::-webkit-scrollbar { display: none; }
        @media(max-width: 767px) { .mobile-nav { display: flex; } }

        @media(max-width: 767px) {
          .page-wrap   { padding: 0 0 40px !important; }
          .page-inner  { padding: 20px 16px 0 !important; }
        }
        @media(max-width: 480px) {
          .card-body  { padding: 18px !important; }
          .card-head  { padding: 14px 18px !important; }
          .tgl-wrap   { padding: 8px 18px 20px !important; }
          .theme-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <div className="vs" style={{ minHeight: '100vh', background: C.bg }}>

        {/* ══ MOBILE NAV ══ */}
        <div className="mobile-nav" ref={mobileNavRef}>
          {NAV.map(({ id, label, icon: Icon }) => {
            const on = active === id;
            return (
              <button
                key={id} data-id={id}
                onClick={() => scrollTo(id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                  padding: '6px 14px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: on ? 600 : 500, fontFamily: 'inherit',
                  background: on ? C.accent : '#FFFFFF',
                  color: on ? '#fff' : C.muted,
                  boxShadow: on ? '0 2px 8px rgba(37,99,235,.3)' : '0 1px 3px rgba(0,0,0,.08)',
                  transition: 'all .18s',
                }}
              >
                <Icon style={{ width: 12, height: 12 }} />
                {label}
              </button>
            );
          })}
        </div>

        {/* ══ PAGE WRAP ══ */}
        <div className="page-wrap" style={{ maxWidth: 1000, margin: '0 auto', padding: '44px 28px 60px' }}>
          <div className="page-inner settings-layout">

            {/* ── SIDEBAR ── */}
            <aside className="settings-sidebar">
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 32 }}>
                <div style={{
                  width: 38, height: 38, borderRadius: 11, background: C.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 3px 10px rgba(0,0,0,.28)', flexShrink: 0,
                }}>
                  <SettingsIcon style={{ width: 16, height: 16, color: '#fff' }} />
                </div>
                <div>
                  <p style={{ fontSize: 14.5, fontWeight: 700, color: C.ink, lineHeight: 1, letterSpacing: '-.02em' }}>Settings</p>
                  <p style={{ fontSize: 11, color: C.dim, marginTop: 3 }}>V-Meet account</p>
                </div>
              </div>

              {groups.map(group => (
                <div key={group} style={{ marginBottom: 24 }}>
                  <p style={{
                    fontSize: 10, fontWeight: 700, color: C.dim, textTransform: 'uppercase',
                    letterSpacing: '.1em', marginBottom: 5, padding: '0 10px',
                  }}>{group}</p>
                  {NAV.filter(n => n.group === group).map(({ id, label, icon: Icon }) => {
                    const on = active === id;
                    return (
                      <button
                        key={id}
                        className="nb-btn"
                        onClick={() => scrollTo(id)}
                        style={{
                          position: 'relative', width: '100%', display: 'flex', alignItems: 'center',
                          gap: 9, padding: '8px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                          marginBottom: 2, fontSize: 13, fontWeight: on ? 600 : 500, fontFamily: 'inherit',
                          textAlign: 'left', background: on ? C.accentL : 'transparent',
                          color: on ? C.accent : C.muted,
                        }}
                      >
                        {on && (
                          <motion.div
                            layoutId="nav-bar"
                            transition={SPR}
                            style={{
                              position: 'absolute', left: 0, top: 4, bottom: 4, width: 3,
                              borderRadius: '0 3px 3px 0', background: C.accent,
                            }}
                          />
                        )}
                        <Icon style={{ width: 13, height: 13, flexShrink: 0, color: on ? C.accent : C.dim }} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </aside>

            {/* ── MAIN ── */}
            <motion.main className="settings-main" variants={STG} initial="hidden" animate="show">

              <motion.div variants={UP} style={{ marginBottom: 28 }}>
                <h1 style={{
                  fontSize: isMobile ? 22 : 25, fontWeight: 700, color: C.ink,
                  letterSpacing: '-.03em', lineHeight: 1.2,
                }}>Account Settings</h1>
                <p style={{ fontSize: 13.5, color: C.muted, marginTop: 6, lineHeight: 1.65 }}>
                  {isMobile
                    ? 'Manage your security and preferences'
                    : 'Manage your security, preferences, and account data in one place'}
                </p>
              </motion.div>

              {/* ══ SECURITY ══ */}
              <SectionLabel label="Security" />

              {/* Password */}
              <Card id="sec-password">
                <CH icon={Lock} title="Password" subtitle="Manage your login credentials" iColor={C.accent} iBg={C.accentL} />
                <div className="card-body" style={{ padding: '22px' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px',
                    background: C.greenBg, border: `1px solid ${C.greenLn}`, borderRadius: 10, marginBottom: 20,
                  }}>
                    <CheckCircle2 style={{ width: 15, height: 15, color: C.green, flexShrink: 0 }} />
                    <p style={{ fontSize: 13, color: '#166534' }}>
                      Password last changed: <strong>Unknown</strong>
                    </p>
                  </div>
                  <button
                    onClick={() => setShowPwModal(true)}
                    className="ac-btn"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8,
                      height: isMobile ? 46 : 40, padding: '0 20px', borderRadius: 10,
                      background: C.accent, color: '#fff', fontSize: isMobile ? 14 : 13.5, fontWeight: 600,
                      border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all .18s',
                      boxShadow: '0 2px 10px rgba(37,99,235,.3)',
                      width: isMobile ? '100%' : 'auto', justifyContent: 'center',
                    }}
                  >
                    <Key style={{ width: 15, height: 15 }} /> Change Password
                  </button>
                </div>
              </Card>

              {/* Sessions */}
              <div style={{ marginTop: 12 }}>
                <Card id="sec-sessions">
                  <CH icon={Activity} title="Active Sessions" subtitle="Devices signed into your account" iColor={C.purple} iBg={C.purpleBg} />
                  <div className="card-body" style={{ padding: '22px' }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '14px 16px', background: C.surfaceEl,
                      border: `1px solid ${C.border}`, borderRadius: 12, gap: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                        <div style={{
                          width: 40, height: 40, background: C.surface, border: `1px solid ${C.border}`,
                          borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          boxShadow: '0 1px 3px rgba(0,0,0,.06)', flexShrink: 0,
                        }}>
                          <Monitor style={{ width: 16, height: 16, color: C.muted }} />
                        </div>
                        <div>
                          <p style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>This device</p>
                          <p style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>Web Browser · Active now</p>
                        </div>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                        background: C.greenBg, border: `1px solid ${C.greenLn}`, borderRadius: 99,
                      }}>
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%', background: C.green,
                          display: 'inline-block', animation: 'pulse 2s infinite',
                        }} />
                        <span style={{ fontSize: 11.5, fontWeight: 600, color: C.green }}>Current</span>
                      </div>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Export */}
              <div style={{ marginTop: 12 }}>
                <Card id="sec-export">
                  <CH icon={Download} title="Data Export" subtitle="Download a full copy of your data" iColor={C.teal} iBg={C.tealBg} />
                  <div className="card-body" style={{ padding: '22px' }}>
                    <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 20, lineHeight: 1.7 }}>
                      Includes profile, meeting history, chat logs, and settings exported as a{' '}
                      <strong style={{ color: C.inkSub }}>JSON file</strong>.
                    </p>
                    <button
                      onClick={handleExportData}
                      className="sb-btn"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        height: isMobile ? 46 : 40, padding: '0 20px', borderRadius: 10,
                        background: C.surface, border: `1.5px solid ${C.border}`, color: C.inkSub,
                        fontSize: isMobile ? 14 : 13.5, fontWeight: 500, cursor: 'pointer',
                        fontFamily: 'inherit', transition: 'all .18s',
                        boxShadow: '0 1px 3px rgba(0,0,0,.06)',
                        width: isMobile ? '100%' : 'auto', justifyContent: 'center',
                      }}
                    >
                      <Download style={{ width: 15, height: 15 }} /> Export Data
                    </button>
                  </div>
                </Card>
              </div>

              {/* Danger Zone */}
              <div style={{ marginTop: 12 }}>
                <Card id="sec-danger" danger>
                  <CH icon={Trash2} title="Danger Zone" subtitle="Permanent, irreversible actions" iColor={C.red} iBg={C.redBg} />
                  <div className="card-body" style={{ padding: '22px' }}>
                    <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 20, lineHeight: 1.7 }}>
                      Deleting your account will permanently remove all your data.{' '}
                      <strong style={{ color: C.red }}>This cannot be undone.</strong>
                    </p>
                    <AnimatePresence mode="wait">
                      {!showDelConfirm ? (
                        <motion.div key="btn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                          <button
                            onClick={() => setShowDelConfirm(true)}
                            className="db-btn"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              height: isMobile ? 46 : 40, padding: '0 20px', borderRadius: 10,
                              background: C.redBg, border: `1.5px solid ${C.redLine}`, color: C.red,
                              fontSize: isMobile ? 14 : 13.5, fontWeight: 500, cursor: 'pointer',
                              fontFamily: 'inherit', transition: 'all .18s',
                              width: isMobile ? '100%' : 'auto', justifyContent: 'center',
                            }}
                          >
                            <Trash2 style={{ width: 15, height: 15 }} /> Delete Account
                          </button>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                          transition={{ duration: .2 }}
                          style={{
                            padding: 18, background: C.redBg, border: `1.5px solid ${C.redLine}`,
                            borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 16,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                            <AlertCircle style={{ width: 16, height: 16, color: C.red, flexShrink: 0, marginTop: 2 }} />
                            <p style={{ fontSize: 13.5, fontWeight: 500, color: '#991B1B', lineHeight: 1.6 }}>
                              Enter your password to permanently delete your account
                            </p>
                          </div>
                          <input
                            type="password" value={delPass}
                            onChange={e => setDelPass(e.target.value)}
                            placeholder="Your current password"
                            style={{
                              width: '100%', height: 46, padding: '0 16px', borderRadius: 10,
                              border: `1.5px solid ${C.redLine}`, background: '#fff',
                              fontSize: 14, color: C.ink, outline: 'none', fontFamily: 'inherit', transition: 'all .15s',
                            }}
                            onFocus={e => { e.target.style.borderColor = C.red; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,.1)'; }}
                            onBlur={e => { e.target.style.borderColor = C.redLine; e.target.style.boxShadow = 'none'; }}
                          />
                          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 10 }}>
                            <button
                              onClick={handleDeleteAccount}
                              disabled={deleting || !delPass}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                height: 46, padding: '0 20px', borderRadius: 10, background: C.red,
                                color: '#fff', fontSize: 14, fontWeight: 600, border: 'none',
                                cursor: deleting || !delPass ? 'not-allowed' : 'pointer',
                                opacity: deleting || !delPass ? .55 : 1, fontFamily: 'inherit',
                                transition: 'all .18s', flex: isMobile ? 'none' : 1,
                                boxShadow: '0 2px 8px rgba(220,38,38,.35)',
                              }}
                              onMouseEnter={e => { if (!deleting && delPass) e.currentTarget.style.background = '#B91C1C'; }}
                              onMouseLeave={e => { e.currentTarget.style.background = C.red; }}
                            >
                              {deleting
                                ? <Loader2 style={{ width: 15, height: 15, animation: 'spin 1s linear infinite' }} />
                                : <Trash2 style={{ width: 15, height: 15 }} />}
                              {deleting ? 'Deleting…' : 'Confirm Delete'}
                            </button>
                            <button
                              onClick={() => { setShowDelConfirm(false); setDelPass(''); }}
                              disabled={deleting}
                              className="sb-btn"
                              style={{
                                height: 46, padding: '0 20px', borderRadius: 10, background: C.surface,
                                border: `1.5px solid ${C.border}`, color: C.muted, fontSize: 14,
                                fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', transition: 'background .15s',
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Card>
              </div>

              {/* ══ PREFERENCES ══ */}
              <SectionLabel label="Preferences" />

              {/* Appearance */}
              <Card id="pref-appearance">
                <CH icon={Sun} title="Appearance" subtitle="Choose your preferred color scheme" iColor={C.amber} iBg={C.amberBg} />
                <div className="card-body" style={{ padding: '22px' }}>
                  <div
                    className="theme-grid"
                    style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}
                  >
                    {THEMES.map(({ id, label, icon: Icon, note }) => {
                      const on = av.theme === id;
                      return (
                        <button
                          key={id}
                          onClick={() => ua('theme', id)}
                          style={{
                            position: 'relative', display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 11, padding: '18px 12px', borderRadius: 12,
                            border: `2px solid ${on ? C.accent : C.border}`,
                            background: on ? C.accentL : C.surface,
                            cursor: 'pointer', textAlign: 'center', outline: 'none',
                            boxShadow: on ? '0 0 0 4px rgba(37,99,235,.09)' : '0 1px 3px rgba(0,0,0,.04)',
                            transition: 'all .18s', fontFamily: 'inherit',
                          }}
                          onMouseEnter={e => { if (!on) { e.currentTarget.style.borderColor = '#93C5FD'; e.currentTarget.style.background = '#FAFBFC'; } }}
                          onMouseLeave={e => { if (!on) { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.surface; } }}
                        >
                          <div style={{
                            width: 40, height: 40, borderRadius: 11,
                            background: on ? C.accent : C.surfaceEl,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background .18s',
                          }}>
                            <Icon style={{ width: 17, height: 17, color: on ? '#fff' : C.muted }} />
                          </div>
                          <div>
                            <p style={{ fontSize: 13, fontWeight: 600, color: on ? C.accent : C.inkSub }}>{label}</p>
                            <p style={{ fontSize: 11, color: C.dim, marginTop: 2 }}>{note}</p>
                          </div>
                          {on && (
                            <motion.div
                              layoutId="theme-tick"
                              transition={SPR}
                              style={{
                                position: 'absolute', top: 9, right: 9, width: 20, height: 20,
                                borderRadius: '50%', background: C.accent,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 1px 4px rgba(37,99,235,.4)',
                              }}
                            >
                              <CheckCircle2 style={{ width: 12, height: 12, color: '#fff' }} />
                            </motion.div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </Card>

              {/* Notifications */}
              <div style={{ marginTop: 12 }}>
                <Card id="pref-notif">
                  <CH icon={Bell} title="Notifications" subtitle="Control when and how you're notified" iColor={C.purple} iBg={C.purpleBg} />
                  <div className="tgl-wrap" style={{ padding: '8px 22px 22px' }}>
                    <TR label="Incoming Calls"        description="Get notified when someone calls you"       value={notif.incomingCalls}    onChange={v => un('incomingCalls', v)}    icon={Smartphone} />
                    <TR label="Chat Messages"         description="Notifications for new chat messages"       value={notif.chatMessages}     onChange={v => un('chatMessages', v)}     icon={BellRing} />
                    <TR label="User Online"           description="When a contact comes online"               value={notif.userOnline}       onChange={v => un('userOnline', v)}       icon={Wifi} />
                    <TR label="Meeting Reminders"     description="Reminders for scheduled meetings"          value={notif.meetingReminders} onChange={v => un('meetingReminders', v)} icon={Calendar} />
                    <TR label="Email Notifications"   description="Receive notifications via email"           value={notif.emailNotifs}      onChange={v => un('emailNotifs', v)}      icon={Mail} />
                    <TR label="Sound Effects"         description="Play sounds for notifications and events"  value={notif.soundEnabled}     onChange={v => un('soundEnabled', v)}     icon={Volume2} />
                    <TR label="Desktop Notifications" description="Show desktop pop-up notifications"         value={notif.desktopNotifs}    onChange={v => un('desktopNotifs', v)}    icon={Monitor} />
                  </div>
                </Card>
              </div>

              {/* Audio & Video */}
              <div style={{ marginTop: 12, paddingBottom: 40 }}>
                <Card id="pref-av">
                  <CH icon={Activity} title="Audio & Video" subtitle="Default settings for meetings" iColor={C.teal} iBg={C.tealBg} />
                  <div className="tgl-wrap" style={{ padding: '8px 22px 22px' }}>
                    <TR label="Auto-join Audio"   description="Automatically join with audio enabled"  value={av.autoJoinAudio}    onChange={v => ua('autoJoinAudio', v)}    icon={Volume2} />
                    <TR label="Auto-join Video"   description="Automatically join with camera enabled" value={av.autoJoinVideo}    onChange={v => ua('autoJoinVideo', v)}    icon={User} />
                    <TR label="Mirror My Video"   description="Mirror your own camera preview"         value={av.mirrorVideo}      onChange={v => ua('mirrorVideo', v)}      icon={Monitor} />
                    <TR label="Noise Suppression" description="Reduce background noise during calls"   value={av.noiseSuppression} onChange={v => ua('noiseSuppression', v)} icon={VolumeX} />
                    <TR label="Echo Cancellation" description="Cancel audio echo during meetings"      value={av.echoCancel}       onChange={v => ua('echoCancel', v)}       icon={Volume2} />
                  </div>
                </Card>
              </div>

            </motion.main>
          </div>
        </div>
      </div>

      {/* ─── Password Modal ─── */}
      <AnimatePresence>
        {showPwModal && <PasswordModal onClose={() => setShowPwModal(false)} />}
      </AnimatePresence>
    </>
  );
}