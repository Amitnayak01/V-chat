import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { socket } from "../socket";

export default function Home() {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [users, setUsers] = useState([]);
  const [showUsers, setShowUsers] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [roomIdInput, setRoomIdInput] = useState("");
  const nav = useNavigate();
  const token = localStorage.getItem("token");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await api.get("/auth/me", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!mounted) return;

        setCurrentUser(res.data);
        
        // Store userId in localStorage for CallContext
        localStorage.setItem("userId", res.data._id);

        // 🔥 TELL SERVER THIS USER IS ONLINE
        socket.emit("user-online", res.data._id);

        // 👀 LISTEN FOR ONLINE USERS LIST
        socket.on("online-users", (users) => {
          if (mounted) {
            setOnlineUsers(users);
            console.log("📊 Online users received:", users);
          }
        });

        await fetchUsers();
      } catch (err) {
        console.error("Failed to load user data:", err);
        if (err.response?.status === 401) {
          handleLogout();
        }
      }
    };

    load();

    return () => {
      mounted = false;
      socket.off("online-users");
    };
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get("/auth/users", {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log("Users data:", res.data);
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load users");
      if (err.response?.status === 401) {
        handleLogout();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    socket.emit("user-offline", currentUser?._id);
    localStorage.removeItem("token");
    localStorage.removeItem("userId");
    nav("/login");
  };

  const refreshUsers = () => {
    fetchUsers();
  };

  // Helper function to get full image URL
  const getImageUrl = (profilePic) => {
    if (!profilePic) return null;
    return profilePic; // Cloudinary URL already full
  };

  const filteredUsers = users.filter(u => {
    // Filter out current user from the list
    if (currentUser && u._id === currentUser._id) return false;
    // Search filter
    return u.username.toLowerCase().includes(search.toLowerCase());
  });

  // 🔥 CALCULATE OTHER ONLINE USERS (excluding current user)
  const otherOnlineUsersCount = currentUser 
    ? onlineUsers.filter(id => id !== currentUser._id).length 
    : onlineUsers.length;

  const handleStartMeeting = () => {
    const roomId = Math.random().toString(36).substring(7);
    nav(`/room/${roomId}`);
  };

  const handleCopyMeetingLink = () => {
    const roomId = Math.random().toString(36).substring(7);
    const meetingLink = `${window.location.origin}/room/${roomId}`;
    navigator.clipboard.writeText(meetingLink).then(() => {
      alert("Meeting link copied to clipboard!");
    }).catch(() => {
      alert("Failed to copy link. Please try again.");
    });
  };

  const handleJoinRoom = () => {
    const roomId = roomIdInput.trim();
    if (roomId) {
      nav(`/room/${roomId}`);
    } else {
      alert("Please enter a room ID");
    }
  };

  if (loading && users.length === 0) {
    return (
      <div style={{ 
        padding: "30px", 
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh"
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{
            width: "40px",
            height: "40px",
            border: "4px solid #f3f3f3",
            borderTop: "4px solid #3498db",
            borderRadius: "50%",
            animation: "spin 1s linear infinite",
            margin: "0 auto 20px"
          }}></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "30px", color: "white", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header Section */}
      <div style={{ 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        marginBottom: "30px",
        flexWrap: "wrap",
        gap: "15px"
      }}>
        <div>
          <h1 style={{ margin: "0 0 10px 0" }}>Welcome to CollabSpace</h1>
          {currentUser && (
            <div style={{ margin: 0, color: "#888", fontSize: "14px" }}>
              <p style={{ margin: "5px 0" }}>
                Logged in as: <strong style={{ color: "#2196F3" }}>{currentUser.username}</strong>
              </p>
              <p style={{ margin: "5px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: "#00ff00",
                  display: "inline-block",
                  animation: "pulse 2s infinite"
                }}></span>
                {/* 🔥 FIXED: Show other users online (excluding yourself) */}
                Online ({otherOnlineUsersCount} {otherOnlineUsersCount === 1 ? 'user' : 'users'} active)
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          background: "#ff4444",
          color: "white",
          padding: "12px 15px",
          borderRadius: "5px",
          marginBottom: "20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}>
          <span>{error}</span>
          <button 
            onClick={() => setError(null)}
            style={{ 
              background: "transparent",
              border: "none",
              color: "white",
              cursor: "pointer",
              fontSize: "20px",
              fontWeight: "bold",
              padding: "0 5px"
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Quick Actions Section */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: "15px",
        padding: "30px",
        marginBottom: "30px",
        border: "1px solid rgba(255,255,255,0.1)"
      }}>
        <h2 style={{ 
          margin: "0 0 20px 0", 
          fontSize: "20px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          fontWeight: "500"
        }}>
          ⚡ Quick Actions
        </h2>

        {/* Start Meeting Button */}
        <button
          onClick={handleStartMeeting}
          style={{
            background: "linear-gradient(135deg, #9C27B0 0%, #E91E63 100%)",
            color: "white",
            padding: "18px 24px",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
            fontWeight: "600",
            fontSize: "16px",
            width: "100%",
            marginBottom: "15px",
            transition: "all 0.3s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px"
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = "translateY(-2px)";
            e.target.style.boxShadow = "0 8px 20px rgba(156, 39, 176, 0.4)";
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = "translateY(0)";
            e.target.style.boxShadow = "none";
          }}
        >
          📹 Start Meeting
        </button>

        {/* Copy Meeting Link Button */}
        <button
          onClick={handleCopyMeetingLink}
          style={{
            background: "rgba(255,255,255,0.1)",
            color: "white",
            padding: "18px 24px",
            borderRadius: "10px",
            border: "2px solid rgba(255,255,255,0.2)",
            cursor: "pointer",
            fontWeight: "500",
            fontSize: "16px",
            width: "100%",
            marginBottom: "25px",
            transition: "all 0.3s",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px"
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "rgba(255,255,255,0.15)";
            e.target.style.borderColor = "rgba(255,255,255,0.3)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "rgba(255,255,255,0.1)";
            e.target.style.borderColor = "rgba(255,255,255,0.2)";
          }}
        >
          📋 Copy Meeting Link
        </button>

        {/* Join by Room ID Section */}
        <div>
          <h3 style={{ 
            margin: "0 0 15px 0", 
            fontSize: "16px",
            fontWeight: "500"
          }}>
            Join by Room ID
          </h3>
          <div style={{ 
            display: "flex", 
            gap: "10px",
            flexWrap: "wrap"
          }}>
            <input
              type="text"
              placeholder="Enter room ID..."
              value={roomIdInput}
              onChange={(e) => setRoomIdInput(e.target.value)}
              style={{
                flex: "1",
                minWidth: "200px",
                padding: "14px 18px",
                borderRadius: "8px",
                border: "2px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                fontSize: "15px",
                outline: "none",
                transition: "all 0.2s"
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "#2196F3";
                e.target.style.background = "rgba(255,255,255,0.08)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(255,255,255,0.2)";
                e.target.style.background = "rgba(255,255,255,0.05)";
              }}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleJoinRoom();
                }
              }}
            />
            <button
              onClick={handleJoinRoom}
              style={{
                background: "#9C27B0",
                color: "white",
                padding: "14px 32px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontWeight: "600",
                fontSize: "15px",
                transition: "all 0.2s",
                whiteSpace: "nowrap"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#7B1FA2";
                e.target.style.transform = "translateY(-1px)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#9C27B0";
                e.target.style.transform = "translateY(0)";
              }}
            >
              Join
            </button>
          </div>
        </div>
      </div>

      {/* Connection Status */}
      <div style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: "10px",
        padding: "15px 20px",
        marginBottom: "30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        border: "1px solid rgba(255,255,255,0.1)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            background: "#00ff00",
            boxShadow: "0 0 10px #00ff00"
          }}></div>
          <span style={{ fontSize: "14px", fontWeight: "500" }}>Connected</span>
        </div>
        <button
          onClick={refreshUsers}
          style={{
            background: "transparent",
            border: "none",
            color: "#888",
            cursor: "pointer",
            fontSize: "18px",
            padding: "5px"
          }}
          title="Refresh"
        >
          🔄
        </button>
      </div>

      {/* Action Buttons */}
      <div style={{ 
        margin: "20px 0",
        display: "flex",
        gap: "10px",
        flexWrap: "wrap"
      }}>
        <button 
          onClick={() => nav("/profile")}
          style={{
            background: "#2196F3",
            color: "white",
            padding: "12px 24px",
            borderRadius: "5px",
            border: "none",
            cursor: "pointer",
            fontWeight: "500",
            transition: "all 0.2s",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
          onMouseEnter={(e) => {
            e.target.style.background = "#0b7dda";
            e.target.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.target.style.background = "#2196F3";
            e.target.style.transform = "translateY(0)";
          }}
        >
          👤 My Profile
        </button>
      </div>

      {/* Peoples Section */}
      <div style={{ marginTop: "40px" }}>
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "15px",
          marginBottom: "20px"
        }}>
          <button
            onClick={() => setShowUsers(!showUsers)}
            style={{
              background: "#9C27B0",
              color: "white",
              padding: "12px 24px",
              borderRadius: "5px",
              border: "none",
              cursor: "pointer",
              fontWeight: "500",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              gap: "8px"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "#7B1FA2";
              e.target.style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "#9C27B0";
              e.target.style.transform = "translateY(0)";
            }}
          >
            {showUsers ? "👥 Hide Users" : "👥 Show Users"}
            {!showUsers && (
              <span style={{
                background: "rgba(255,255,255,0.3)",
                borderRadius: "12px",
                padding: "2px 8px",
                fontSize: "12px"
              }}>
                {filteredUsers.length}
              </span>
            )}
          </button>

          {showUsers && (
            <button
              onClick={refreshUsers}
              disabled={loading}
              style={{
                background: "#607D8B",
                color: "white",
                padding: "12px 20px",
                borderRadius: "5px",
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                fontWeight: "500",
                transition: "all 0.2s",
                opacity: loading ? 0.6 : 1
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.target.style.background = "#455A64";
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#607D8B";
              }}
            >
              🔄 Refresh
            </button>
          )}
        </div>

        {showUsers && (
          <div style={{ 
            background: "rgba(255,255,255,0.05)",
            borderRadius: "10px",
            padding: "20px"
          }}>
            {/* Search Bar */}
            <div style={{ marginBottom: "20px" }}>
              <input
                type="text"
                placeholder="🔍 Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  padding: "12px 15px",
                  width: "100%",
                  maxWidth: "400px",
                  borderRadius: "8px",
                  border: "2px solid #555",
                  background: "#2b2b2b",
                  color: "white",
                  fontSize: "14px",
                  outline: "none",
                  transition: "border 0.2s"
                }}
                onFocus={(e) => e.target.style.borderColor = "#2196F3"}
                onBlur={(e) => e.target.style.borderColor = "#555"}
              />
              <p style={{ 
                marginTop: "10px", 
                color: "#888", 
                fontSize: "13px" 
              }}>
                Found {filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Users Grid */}
            {loading ? (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <div style={{
                  width: "30px",
                  height: "30px",
                  border: "3px solid #f3f3f3",
                  borderTop: "3px solid #3498db",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto"
                }}></div>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div style={{ 
                textAlign: "center", 
                padding: "40px",
                color: "#888"
              }}>
                <p style={{ fontSize: "48px", margin: "0 0 10px 0" }}>👥</p>
                <p>No users found</p>
              </div>
            ) : (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                gap: "20px"
              }}>
                {filteredUsers.map((u, i) => {
                  const profileImageUrl = getImageUrl(u.profilePic);
                  const isOnline = onlineUsers.includes(u._id);
                  
                  return (
                    <div 
                      key={u._id || i}
                      className="user-card"
                      onClick={() => nav(`/profile/${u._id}`)}
                      style={{
                        textAlign: "center",
                        background: "rgba(255,255,255,0.05)",
                        borderRadius: "10px",
                        padding: "15px",
                        transition: "all 0.3s",
                        cursor: "pointer",
                        border: "2px solid transparent",
                        position: "relative"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                        e.currentTarget.style.borderColor = "#2196F3";
                        e.currentTarget.style.transform = "translateY(-5px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                        e.currentTarget.style.borderColor = "transparent";
                        e.currentTarget.style.transform = "translateY(0)";
                      }}
                    >
                      {/* Profile Picture or Initial */}
                      {profileImageUrl ? (
                        <img
                          src={profileImageUrl}
                          alt={u.username}
                          style={{
                            width: "80px",
                            height: "80px",
                            borderRadius: "50%",
                            objectFit: "cover",
                            margin: "0 auto 12px",
                            border: `3px solid ${isOnline ? "#00ff00" : "#2196F3"}`,
                            display: "block"
                          }}
                          onError={(e) => {
                            console.error(`Failed to load image for ${u.username}:`, profileImageUrl);
                            e.target.style.display = "none";
                            e.target.nextElementSibling.style.display = "flex";
                          }}
                        />
                      ) : null}
                      
                      {/* Fallback Avatar */}
                      <div style={{
                        width: "80px",
                        height: "80px",
                        borderRadius: "50%",
                        background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                        display: profileImageUrl ? "none" : "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "32px",
                        fontWeight: "bold",
                        color: "white",
                        margin: "0 auto 12px",
                        border: `3px solid ${isOnline ? "#00ff00" : "#2196F3"}`
                      }}>
                        {u.username.charAt(0).toUpperCase()}
                      </div>

                      {/* 🟢 ONLINE INDICATOR */}
                      <div style={{
                        position: "absolute",
                        top: "20px",
                        right: "20px",
                        width: "14px",
                        height: "14px",
                        borderRadius: "50%",
                        background: isOnline ? "#00ff00" : "#888",
                        border: "2px solid #1e1e1e",
                        boxShadow: isOnline ? "0 0 10px #00ff00" : "none",
                        animation: isOnline ? "pulse 2s infinite" : "none"
                      }} 
                      title={isOnline ? "Online" : "Offline"}
                      />

                      {/* Username */}
                      <div style={{
                        fontWeight: "500",
                        fontSize: "14px",
                        wordBreak: "break-word"
                      }}>
                        {u.username}
                      </div>

                      {/* Email (if available) */}
                      {u.email && (
                        <div style={{
                          fontSize: "11px",
                          color: "#888",
                          marginTop: "8px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap"
                        }}>
                          {u.email}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}