import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider }  from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { WebRTCProvider } from './context/WebRTCContext';
import ProtectedRoute    from './components/Common/ProtectedRoute';
import Login             from './components/Auth/Login';
import Register          from './components/Auth/Register';
import Dashboard         from './components/Dashboard/Dashboard';
import VideoRoom         from './components/VideoCall/VideoRoom';
import UserProfilePage   from './components/Dashboard/UserProfilePage';

import { AudioCallProvider } from './context/AudioCallContext';     // ← NEW
import IncomingAudioCall from'./components/AudioCall/IncomingAudioCall';                 // ← NEW
import AudioCallUI from './components/AudioCall/AudioCallUI';       // ← NEW
const JoinRedirect = () => {
  const { meetingCode } = useParams();
  return <Navigate to={`/room/${meetingCode}`} replace />;
};

function App() {
return (
  <AuthProvider>
    <SocketProvider>
      <WebRTCProvider>
        <AudioCallProvider>                       {/* ← NEW */}
          <Router>
            <Routes>

              <Route path="/login"    element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route path="/dashboard/*" element={
                <ProtectedRoute><Dashboard /></ProtectedRoute>
              } />

              <Route path="/join/:meetingCode" element={
                <ProtectedRoute><JoinRedirect /></ProtectedRoute>
              } />

              <Route path="/room/:roomId" element={
                <ProtectedRoute><VideoRoom /></ProtectedRoute>
              } />

              <Route path="/user/:id" element={
                <ProtectedRoute><UserProfilePage /></ProtectedRoute>
              } />

              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />

            </Routes>

            {/* ── Global audio-call overlays ──────────────────────── */}
            <IncomingAudioCall />                  {/* ← NEW */}
            <AudioCallUI />                        {/* ← NEW */}

            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3000,
                style: {
                  background:   '#1e293b',
                  color:        '#fff',
                  borderRadius: '0.75rem',
                  padding:      '1rem',
                  fontSize:     '0.875rem',
                  fontWeight:   '500',
                },
                success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
                error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
              }}
            />
          </Router>
        </AudioCallProvider>                      {/* ← NEW */}
      </WebRTCProvider>
    </SocketProvider>
  </AuthProvider>
);
}

export default App;