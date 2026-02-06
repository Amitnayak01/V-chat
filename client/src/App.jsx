import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CallProvider } from "./CallContext"; // 🔥 IMPORT CallProvider
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import VideoCall from "./pages/VideoCall";
import Profile from "./pages/Profile";
import Home from "./pages/Home";
import UserProfile from "./pages/UserProfile";
import GroupCall from "./pages/GroupCall";

const PrivateRoute = ({ children }) =>
  localStorage.getItem("token") ? children : <Navigate to="/login" />;

export default function App() {
  return (
    <BrowserRouter>
      {/* 🌍 WRAP EVERYTHING WITH CallProvider FOR GLOBAL INCOMING CALLS */}
      <CallProvider>
        <Routes>
          <Route path="/profile/:id" element={<PrivateRoute><UserProfile /></PrivateRoute>} />
              <Route path="/group-call/:roomId" element={<GroupCall />} />
          {/* Home page after login */}
          <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />

          {/* Auth pages */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* App pages */}
          <Route path="/call" element={<PrivateRoute><VideoCall /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        </Routes>
      </CallProvider>
    </BrowserRouter>
  );
}