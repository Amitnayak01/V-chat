import React, { useState, useEffect } from "react";
import api from "../api";
import { useNavigate, Link } from "react-router-dom";
import "./Auth.css";

export default function Login() {
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    if (localStorage.getItem("token")) {
      nav("/call");
    }
  }, []);

  const login = async () => {
    setLoading(true);
    try {
      const res = await api.post("/auth/login", { username: u, password: p });
      localStorage.setItem("token", res.data.token);
      nav("/");
    } catch (error) {
      alert("Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      login();
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <h1 className="auth-title">Welcome Back</h1>
          <p className="auth-subtitle">Sign in to continue to Video Call App</p>
        </div>

        <div className="auth-form">
          <div className="input-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              placeholder="Enter your username"
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
                placeholder="Enter your password"
                value={p}
                onChange={(e) => setP(e.target.value)}
                onKeyPress={handleKeyPress}
                className="auth-input"
                autoComplete="current-password"
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

          <button
            onClick={login}
            disabled={loading}
            className="auth-button primary"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

          <div className="auth-footer">
            <p>
              Don't have an account?{" "}
              <Link to="/signup" className="auth-link">
                Sign up
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