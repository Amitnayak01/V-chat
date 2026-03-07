import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, LogIn, WifiOff, Server, AlertCircle, Clock } from 'lucide-react';

// ============================================================
//  LOGO FILE LOCATION:  src/assets/logo.png
// ============================================================
import AppLogo from '../../assets/logo.png';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────
const HEALTH_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/health`;
const MAX_RETRIES = 20;
const RETRY_INTERVAL = 2000;

async function waitForServer(onAttempt) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(5000) });
      if (res.ok) return { ok: true };
    } catch { /* still sleeping */ }
    onAttempt(i);
    await new Promise(r => setTimeout(r, RETRY_INTERVAL));
  }
  return { ok: false };
}

function parseError(error) {
  const msg = (error?.message || String(error)).toLowerCase();

  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    return { icon: 'offline', message: 'No connection to the server. Check your internet or try again shortly.' };
  }
  if (msg.includes('timeout') || msg.includes('aborted')) {
    return { icon: 'timeout', message: 'Request timed out. The server may be busy — please try again.' };
  }
  if (msg.includes('invalid') || msg.includes('incorrect') || msg.includes('wrong') || msg.includes('401')) {
    return { icon: 'alert', message: 'Invalid username or password. Please try again.' };
  }
  if (msg.includes('500') || msg.includes('internal server')) {
    return { icon: 'server', message: 'Server error. Please try again in a moment.' };
  }
  if (msg.includes('403')) {
    return { icon: 'alert', message: 'Access denied.' };
  }
  if (error?.message && error.message.length < 120) {
    return { icon: 'alert', message: error.message };
  }
  return { icon: 'alert', message: 'Login failed. Please try again.' };
}

// ─────────────────────────────────────────────────────────────
// Error Banner
// ─────────────────────────────────────────────────────────────
const iconMap = { offline: WifiOff, timeout: Clock, server: Server, alert: AlertCircle };
const colorMap = { offline: 'text-red-500', timeout: 'text-orange-500', server: 'text-red-500', alert: 'text-red-500' };

const ErrorBanner = ({ icon, message }) => {
  const Icon = iconMap[icon] ?? AlertCircle;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in">
      <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${colorMap[icon]}`} />
      <span>{message}</span>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Server waking overlay
// ─────────────────────────────────────────────────────────────
const ServerWakingOverlay = ({ attempt }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
    <div className="flex flex-col items-center gap-4 rounded-2xl bg-white p-8 shadow-2xl max-w-xs w-full text-center mx-4">
      <div className="relative flex items-center justify-center w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-primary-100" />
        <div className="absolute inset-0 rounded-full border-4 border-t-primary-600 animate-spin" />
        <Server className="w-7 h-7 text-primary-600" />
      </div>
      <div>
        <p className="font-semibold text-slate-800 text-lg">Waking up the server…</p>
        <p className="text-slate-500 text-sm mt-1 leading-relaxed">
          The backend is starting. This usually takes 10–30 seconds on a free tier.
        </p>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
        <div
          className="h-full bg-primary-500 transition-all duration-500 rounded-full"
          style={{ width: `${Math.min((attempt / MAX_RETRIES) * 100, 95)}%` }}
        />
      </div>
      <p className="text-xs text-slate-400">Attempt {attempt} of {MAX_RETRIES}</p>
    </div>
  </div>
);


// ═════════════════════════════════════════════════════════════
// Login
// ═════════════════════════════════════════════════════════════
const Login = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState(null);
  const [wakingServer, setWakingServer] = useState(false);
  const [wakeAttempt, setWakeAttempt] = useState(0);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
    if (apiError) setApiError(null);
  };

  const validate = () => {
    const e = {};
    if (!formData.username.trim()) e.username = 'Username is required';
    if (!formData.password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setApiError(null);

    // ── 1. Health check ──────────────────────────────────────
    let serverAlive = false;
    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(4000) });
      serverAlive = res.ok;
    } catch { /* server sleeping */ }

    // ── 2. Wait for server if needed ─────────────────────────
    if (!serverAlive) {
      setWakingServer(true);
      setWakeAttempt(1);
      const result = await waitForServer((attempt) => setWakeAttempt(attempt));
      setWakingServer(false);

      if (!result.ok) {
        setLoading(false);
        setApiError({
          icon: 'server',
          message: 'Server did not respond after 40 seconds. Please wait a moment and try again.',
        });
        return;
      }
    }

    // ── 3. Login ─────────────────────────────────────────────
    try {
      const result = await login(formData);
      if (result.success) {
        const from = location.state?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      } else {
        setApiError(parseError(new Error(result.error || result.message || 'Login failed')));
      }
    } catch (err) {
      setApiError(parseError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {wakingServer && <ServerWakingOverlay attempt={wakeAttempt} />}

      <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">

          {/* Logo */}
          <div className="text-center mb-6 sm:mb-8 animate-slide-up">
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-glow mb-3 sm:mb-4 overflow-hidden">
              <img src={AppLogo} alt="V-Meet Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-2">Welcome to V-Meet</h1>
            <p className="text-sm sm:text-base text-slate-600">Sign in to start collaborating</p>
          </div>

          {/* Form Card */}
          <div className="card p-5 sm:p-8 animate-fade-in">
            <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">

              {/* Error Banner */}
              {apiError && <ErrorBanner icon={apiError.icon} message={apiError.message} />}

              {/* Username */}
              <div>
                <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">Username</label>
                <input
                  type="text" id="username" name="username" value={formData.username}
                  onChange={handleChange} autoComplete="username" placeholder="Enter your username"
                  className={`input text-sm sm:text-base ${errors.username ? 'border-red-500 focus:ring-red-500' : ''}`}
                />
                {errors.username && <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.username}</p>}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5 sm:mb-2">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'} id="password" name="password"
                    value={formData.password} onChange={handleChange} autoComplete="current-password"
                    placeholder="Enter your password"
                    className={`input pr-12 text-sm sm:text-base ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1">
                    {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.password}</p>}
              </div>

              {/* Submit */}
              <button type="submit" disabled={loading}
                className="w-full btn btn-primary flex items-center justify-center space-x-2 py-3 text-sm sm:text-base">
                {loading ? (
                  <><div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /><span>Signing in…</span></>
                ) : (
                  <><LogIn className="w-4 h-4 sm:w-5 sm:h-5" /><span>Sign In</span></>
                )}
              </button>
            </form>

            <div className="mt-5 sm:mt-6 text-center">
              <p className="text-sm sm:text-base text-slate-600">
                Don't have an account?{' '}
                <Link to="/register" className="text-primary-600 hover:text-primary-700 font-semibold">Create one</Link>
              </p>
            </div>
          </div>

          <p className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-slate-500">© 2024 V-Meet. All rights reserved.</p>
        </div>
      </div>
    </>
  );
};

export default Login;