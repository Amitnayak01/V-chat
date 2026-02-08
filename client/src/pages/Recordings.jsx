import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function Recordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadRecordings();
  }, []);

  const loadRecordings = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get("/meetings/recordings", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      setRecordings(response.data);
    } catch (err) {
      console.error("Error loading recordings:", err);
      setError(err.response?.data?.message || "Failed to load recordings");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this recording?")) {
      return;
    }

    try {
      await api.delete(`/meetings/recordings/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      
      // Remove from state
      setRecordings(prev => prev.filter(r => r._id !== id));
    } catch (err) {
      console.error("Error deleting recording:", err);
      alert("Failed to delete recording");
    }
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString();
  };

  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        background: "#1e1e1e",
        color: "white"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #9C27B0",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 20px"
          }}></div>
          <p>Loading recordings...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1e1e1e",
      color: "white",
      padding: "30px"
    }}>
      {/* Header */}
      <div style={{
        maxWidth: "1200px",
        margin: "0 auto"
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "30px"
        }}>
          <div>
            <h1 style={{ margin: "0 0 10px 0" }}>🎥 Meeting Recordings</h1>
            <p style={{ margin: 0, color: "#888" }}>
              View and manage your recorded meetings
            </p>
          </div>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "white",
              padding: "12px 24px",
              borderRadius: "5px",
              border: "none",
              cursor: "pointer",
              fontWeight: "500",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255,255,255,0.2)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255,255,255,0.1)";
            }}
          >
            ← Back to Home
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div style={{
            background: "#ff4444",
            color: "white",
            padding: "15px 20px",
            borderRadius: "8px",
            marginBottom: "20px"
          }}>
            {error}
          </div>
        )}

        {/* Recordings Grid */}
        {recordings.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "80px 20px",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "15px"
          }}>
            <div style={{ fontSize: "64px", marginBottom: "20px" }}>🎬</div>
            <h2 style={{ margin: "0 0 10px 0" }}>No Recordings Yet</h2>
            <p style={{ color: "#888", margin: 0 }}>
              Start recording your meetings to see them here
            </p>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
            gap: "20px"
          }}>
            {recordings.map((recording) => (
              <div
                key={recording._id}
                style={{
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "12px",
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.1)",
                  transition: "all 0.3s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-5px)";
                  e.currentTarget.style.borderColor = "#9C27B0";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
                }}
              >
                {/* Video Preview */}
                <div style={{
                  width: "100%",
                  height: "200px",
                  background: "#000",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative"
                }}>
                  <video
                    src={recording.fileUrl}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }}
                    controls
                  />
                </div>

                {/* Recording Info */}
                <div style={{ padding: "20px" }}>
                  <h3 style={{
                    margin: "0 0 10px 0",
                    fontSize: "16px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                    {recording.fileName}
                  </h3>

                  <div style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    marginBottom: "15px",
                    fontSize: "13px",
                    color: "#888"
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>🕐</span>
                      <span>{formatDuration(recording.duration)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>💾</span>
                      <span>{formatFileSize(recording.fileSize)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>📅</span>
                      <span>{formatDate(recording.createdAt)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span>🆔</span>
                      <span style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap"
                      }}>
                        Room: {recording.meetingId}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div style={{
                    display: "flex",
                    gap: "10px"
                  }}>
                    <a
                      href={recording.fileUrl}
                      download
                      style={{
                        flex: 1,
                        background: "#9C27B0",
                        color: "white",
                        padding: "10px",
                        borderRadius: "5px",
                        textAlign: "center",
                        textDecoration: "none",
                        fontSize: "14px",
                        fontWeight: "500",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = "#7B1FA2";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = "#9C27B0";
                      }}
                    >
                      📥 Download
                    </a>
                    <button
                      onClick={() => handleDelete(recording._id)}
                      style={{
                        background: "#ff4444",
                        color: "white",
                        padding: "10px 15px",
                        borderRadius: "5px",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "14px",
                        fontWeight: "500",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = "#cc0000";
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = "#ff4444";
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}