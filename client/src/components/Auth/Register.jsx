import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Eye, EyeOff, UserPlus, Upload, Loader2, AlertCircle, ServerCrash } from 'lucide-react';
import { withRetry } from '../../utils/retryFetch';

// ============================================================
//  LOGO FILE LOCATION:  src/assets/logo.png
// ============================================================
import AppLogo from '../../assets/logo.png';

const Register = () => {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
    avatar: ''
  });
  const [showPassword, setShowPassword]               = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading]                         = useState(false);
  const [wakingUp, setWakingUp]                       = useState(false);  // ← NEW
  const [retryInfo, setRetryInfo]                     = useState('');     // ← NEW
  const [errors, setErrors]                           = useState({});

  const { register } = useAuth();
  const navigate = useNavigate();

  // ── unchanged ──────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

  const generateAvatar = () => {
    const seed = formData.username || Math.random().toString(36).substr(2, 9);
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`;
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.username.trim()) newErrors.username = 'Username is required';
    else if (formData.username.length < 3)  newErrors.username = 'Username must be at least 3 characters';
    else if (formData.username.length > 30) newErrors.username = 'Username cannot exceed 30 characters';
    if (!formData.password) newErrors.password = 'Password is required';
    else if (formData.password.length < 6)  newErrors.password = 'Password must be at least 6 characters';
    if (!formData.confirmPassword) newErrors.confirmPassword = 'Please confirm your password';
    else if (formData.password !== formData.confirmPassword) newErrors.confirmPassword = 'Passwords do not match';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getPasswordStrength = () => {
    const password = formData.password;
    if (!password) return { strength: 0, label: '', color: '' };
    let strength = 0;
    if (password.length >= 6)  strength++;
    if (password.length >= 10) strength++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password))        strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    const labels = ['Weak', 'Fair', 'Good', 'Strong', 'Very Strong'];
    const colors  = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-emerald-500'];
    return {
      strength: Math.min(strength, 5),
      label: labels[Math.min(strength - 1, 4)] || '',
      color: colors[Math.min(strength - 1, 4)] || ''
    };
  };
  // ───────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    setWakingUp(false);
    setRetryInfo('');
    setErrors({});

    const registerData = {
      ...formData,
      avatar: formData.avatar || generateAvatar()
    };

    try {
      let registerResult;

      await withRetry(
        async () => {
          registerResult = await register(registerData);

          // AuthContext returns { success, message } instead of throwing on 4xx
          // Manually throw so withRetry knows NOT to retry real errors (e.g. username taken)
          if (!registerResult.success) {
            const err = new Error(registerResult.message || 'Registration failed');
            err.isAuthError = true;   // mark as non-retryable
            throw err;
          }
        },
        {
          retries: 8,
          delayMs: 5000,
          onWaiting: (attempt, total) => {
            setWakingUp(true);
            setRetryInfo(`Attempt ${attempt} of ${total} — please wait…`);
          },
        }
      );

      // Success
      navigate('/dashboard');

    } catch (err) {
      if (err.isAuthError) {
        // Real registration failure (username taken, validation, etc.)
        setErrors({ form: err.message });
      } else {
        // Network completely down after all retries exhausted
        setErrors({ form: 'Unable to reach the server. Please check your connection and try again.' });
      }
    } finally {
      setLoading(false);
      setWakingUp(false);
      setRetryInfo('');
    }
  };

  const passwordStrength = getPasswordStrength();
  const avatarUrl = formData.avatar || (formData.username ? generateAvatar() : '');

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-accent-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo and Title */}
        <div className="text-center mb-6 sm:mb-8 animate-slide-up">
          {/* ── LOGO SLOT — file: src/assets/logo.png ── */}
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl shadow-glow mb-3 sm:mb-4 overflow-hidden">
            <img src={AppLogo} alt="V-Meet Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold text-slate-900 mb-2">
            Join V-Meet
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            Create your account to get started
          </p>
        </div>

        {/* ── Waking-up Banner ── */}
        {wakingUp && (
          <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-sm animate-fade-in">
            <ServerCrash className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold">Server is waking up…</p>
              <p className="text-xs text-amber-600 mt-0.5">{retryInfo} This can take up to 30 seconds on first use.</p>
            </div>
          </div>
        )}

        {/* ── Form-level Error Banner ── */}
        {errors.form && (
          <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm animate-fade-in">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>{errors.form}</p>
          </div>
        )}

        {/* Register Form */}
        <div className="card p-5 sm:p-8 animate-fade-in">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">

            {/* Avatar Preview */}
            {avatarUrl && (
              <div className="flex justify-center">
                <div className="relative">
                  <img src={avatarUrl} alt="Avatar Preview" className="w-20 h-20 sm:w-24 sm:h-24 avatar" />
                  <div className="absolute -bottom-2 -right-2 w-7 h-7 sm:w-8 sm:h-8 bg-primary-600 rounded-full flex items-center justify-center">
                    <Upload className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                  </div>
                </div>
              </div>
            )}

            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1.5">
                Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleChange}
                className={`input text-sm sm:text-base ${errors.username ? 'border-red-500 focus:ring-red-500' : ''}`}
                placeholder="Choose a username"
                autoComplete="username"
              />
              {errors.username && <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.username}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`input pr-12 text-sm sm:text-base ${errors.password ? 'border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.password}</p>}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex items-center space-x-2">
                    <div className="flex-1 h-1.5 sm:h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${passwordStrength.color} transition-all duration-300`}
                        style={{ width: `${(passwordStrength.strength / 5) * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-medium text-slate-600 flex-shrink-0">{passwordStrength.label}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`input pr-12 text-sm sm:text-base ${errors.confirmPassword ? 'border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="Confirm your password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4 sm:w-5 sm:h-5" /> : <Eye className="w-4 h-4 sm:w-5 sm:h-5" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="mt-1 text-xs sm:text-sm text-red-600">{errors.confirmPassword}</p>}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary flex items-center justify-center space-x-2 py-3 text-sm sm:text-base disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  <span>{wakingUp ? 'Waiting for server…' : 'Creating account…'}</span>
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Create Account</span>
                </>
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-5 sm:mt-6 text-center">
            <p className="text-sm sm:text-base text-slate-600">
              Already have an account?{' '}
              <Link to="/login" className="text-primary-600 hover:text-primary-700 font-semibold">
                Sign in
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-slate-500">
          © 2024 V-Meet. All rights reserved.
        </p>
      </div>
    </div>
  );
};

export default Register;