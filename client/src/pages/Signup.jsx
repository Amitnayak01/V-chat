import React, { useState } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import "./Auth.css";

export default function Signup() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [c, setC] = useState("");
  const [loading, setLoading] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const nav = useNavigate();

const submit = async () => {
  if (p !== c) {
    alert("Passwords mismatch");
    return;
  }

  setLoading(true);

  try {
    const res = await api.post("/auth/signup", { username: u, password: p });

    // 🔐 Save login session
    localStorage.setItem("token", res.data.token);
    localStorage.setItem("userId", res.data.user._id);

    // 🚀 Redirect to Home
    nav("/");
  } catch (error) {
    alert(error.response?.data?.msg || "Signup failed");
  } finally {
    setLoading(false);
  }
};

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      submit();
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Join Video Call App today</p>
        </div>

        <div className="auth-form">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Choose a username"
              value={u}
              onChange={(e) => setU(e.target.value)}
              onKeyPress={handleKeyPress}
              className="auth-input"
            />
          </div>

      <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Create a password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                onKeyPress={handleKeyPress}
                className="auth-input"
                autoComplete="new-password"
              />
              <span
                className="toggle-pass"
                onClick={() => setShowPassword(!showPassword)}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "🙈" : "👁"}
              </span>
            </div>
          </div>

        <div className="input-group">
            <label htmlFor="confirm">Confirm Password</label>
            <div className="password-wrapper">
              <input
                id="confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm your password"
                value={c}
                onChange={(e) => setC(e.target.value)}
                onKeyPress={handleKeyPress}
                className="auth-input"
                autoComplete="new-password"
              />
              <span
                className="toggle-pass"
                onClick={() => setShowConfirm(!showConfirm)}
                title={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? "🙈" : "👁"}
              </span>
            </div>
          </div>
          <button
            onClick={submit}
            disabled={loading}
            className="auth-button primary"
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>

          <div className="auth-footer">
            <p>
              Already have an account?{" "}
              <Link to="/" className="auth-link">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div className="auth-background">
        <div className="gradient-orb orb-1"></div>
        <div className="gradient-orb orb-2"></div>
        <div className="gradient-orb orb-3"></div>
      </div>
    </div>
  );
}