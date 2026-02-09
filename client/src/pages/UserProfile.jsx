import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../api";

export default function UserProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showFullImage, setShowFullImage] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      nav("/login");
      return;
    }
    fetchCurrentUser();
    fetchUser();
  }, [id]);

  const fetchCurrentUser = async () => {
    try {
      const res = await api.get("/auth/me", {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCurrentUser(res.data);
    } catch (err) {
      console.error("Failed to fetch current user:", err);
    }
  };

  const fetchUser = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get(`/auth/user/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to load user profile");
      if (err.response?.status === 401) {
        nav("/login");
      } else if (err.response?.status === 404) {
        setError("User not found");
      }
    } finally {
      setLoading(false);
    }
  };

const startVideoCall = () => {
  if (!user?._id) {
    alert("Cannot start call with this user");
    return;
  }
  nav(`/call?userId=${user._id}&username=${user.username}`);
};


  const sendMessage = () => {
    // Navigate to messaging page (you can implement this)
    alert("Messaging feature coming soon!");
    // nav(`/messages/${user._id}`);
  };

  const handleImageClick = () => {
    if (user?.profilePic) {
      setShowFullImage(true);
    }
  };

  const closeFullImage = (e) => {
    if (e.target.id === "modal-overlay" || e.target.id === "close-button") {
      setShowFullImage(false);
    }
  };

  // Helper function to get full image URL
  const getImageUrl = (profilePic) => {
    if (!profilePic) return null;
    
    if (profilePic.startsWith('http://') || profilePic.startsWith('https://')) {
      return profilePic;
    }
    
    const baseUrl = 'https://v-chat-itn7.onrender.com';
    const cleanPath = profilePic.startsWith('/') ? profilePic : `/${profilePic}`;
    return `${baseUrl}${cleanPath}`;
  };

  const isOwnProfile = currentUser && user && currentUser._id === user._id;

  if (loading) {
    return (
      <div className="center" style={{ minHeight: "100vh" }}>
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
          <p style={{ color: "white" }}>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="center" style={{ minHeight: "100vh" }}>
        <div style={{ 
          textAlign: "center",
          background: "rgba(255,255,255,0.05)",
          padding: "40px",
          borderRadius: "10px",
          maxWidth: "400px"
        }}>
          <p style={{ fontSize: "48px", margin: "0 0 20px 0" }}>😕</p>
          <h2 style={{ color: "#ff4444", margin: "0 0 20px 0" }}>{error}</h2>
          <button 
            onClick={() => nav(-1)}
            style={{
              background: "#2196F3",
              color: "white",
              padding: "12px 24px",
              borderRadius: "5px",
              border: "none",
              cursor: "pointer",
              fontWeight: "500",
              transition: "all 0.2s"
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
            ⬅ Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const profileImageUrl = getImageUrl(user.profilePic);

  return (
    <div className="center" style={{ 
      minHeight: "100vh",
      padding: "30px"
    }}>
      <div style={{
        background: "rgba(255,255,255,0.05)",
        borderRadius: "15px",
        padding: "40px",
        maxWidth: "500px",
        width: "100%",
        boxShadow: "0 8px 32px rgba(0,0,0,0.3)"
      }}>
        {/* Back Button */}
        <button 
          onClick={() => nav(-1)}
          style={{
            background: "transparent",
            color: "#888",
            padding: "8px 16px",
            borderRadius: "5px",
            border: "1px solid #555",
            cursor: "pointer",
            fontWeight: "500",
            transition: "all 0.2s",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "8px"
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = "#2196F3";
            e.target.style.color = "#2196F3";
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = "#555";
            e.target.style.color = "#888";
          }}
        >
          ⬅ Back
        </button>

        {/* Profile Header */}
        <h2 style={{ 
          margin: "0 0 30px 0",
          textAlign: "center",
          color: "white"
        }}>
          {isOwnProfile ? "Your Profile" : `${user.username}'s Profile`}
        </h2>

        {/* Profile Picture */}
        <div style={{ 
          display: "flex",
          justifyContent: "center",
          marginBottom: "30px"
        }}>
          {profileImageUrl ? (
            <img
              src={profileImageUrl}
              alt={user.username}
              onClick={handleImageClick}
              style={{ 
                width: 150, 
                height: 150, 
                borderRadius: "50%",
                objectFit: "cover",
                cursor: "pointer",
                border: "4px solid #2196F3",
                transition: "transform 0.2s, box-shadow 0.2s",
                boxShadow: "0 4px 16px rgba(0,0,0,0.3)"
              }}
              onMouseEnter={(e) => {
                e.target.style.transform = "scale(1.05)";
                e.target.style.boxShadow = "0 6px 24px rgba(33, 150, 243, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = "scale(1)";
                e.target.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
              }}
              onError={(e) => {
                e.target.style.display = "none";
                e.target.nextElementSibling.style.display = "flex";
              }}
            />
          ) : null}
          
          <div style={{
            width: 150,
            height: 150,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            display: profileImageUrl ? "none" : "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "64px",
            fontWeight: "bold",
            color: "white",
            border: "4px solid #2196F3",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
            textTransform: "uppercase"
          }}>
            {user.username.charAt(0)}
          </div>
        </div>

        {profileImageUrl && (
          <p style={{ 
            fontSize: "12px", 
            color: "#888", 
            textAlign: "center",
            marginTop: "-20px",
            marginBottom: "20px",
            fontStyle: "italic"
          }}>
            💡 Click image to view fullsize
          </p>
        )}

        {/* User Info */}
        <div style={{
          background: "rgba(255,255,255,0.03)",
          borderRadius: "10px",
          padding: "20px",
          marginBottom: "25px"
        }}>
          <div style={{ marginBottom: user.bio || user.createdAt ? "15px" : "0" }}>
            <p style={{ 
              margin: "0 0 5px 0", 
              color: "#888",
              fontSize: "12px",
              textTransform: "uppercase"
            }}>
              Username
            </p>
            <p style={{ 
              margin: 0, 
              color: "white",
              fontSize: "18px",
              fontWeight: "500"
            }}>
              {user.username}
            </p>
          </div>

          {user.bio && (
            <div style={{ marginBottom: user.createdAt ? "15px" : "0" }}>
              <p style={{ 
                margin: "0 0 5px 0", 
                color: "#888",
                fontSize: "12px",
                textTransform: "uppercase"
              }}>
                Bio
              </p>
              <p style={{ 
                margin: 0, 
                color: "white",
                fontSize: "14px",
                lineHeight: "1.5"
              }}>
                {user.bio}
              </p>
            </div>
          )}

          {user.createdAt && (
            <div style={{ 
              marginTop: user.bio ? "15px" : "0",
              paddingTop: user.bio ? "15px" : "0", 
              borderTop: user.bio ? "1px solid rgba(255,255,255,0.1)" : "none" 
            }}>
              <p style={{ 
                margin: "0", 
                color: "#888",
                fontSize: "12px"
              }}>
                Member since: {new Date(user.createdAt).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        {!isOwnProfile && (
          <div style={{ 
            display: "flex",
            gap: "10px",
            flexWrap: "wrap"
          }}>
            <button 
              onClick={startVideoCall}
              style={{
                background: "#4CAF50",
                color: "white",
                padding: "14px 24px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontWeight: "500",
                transition: "all 0.2s",
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "15px"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#45a049";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 4px 12px rgba(76, 175, 80, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#4CAF50";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "none";
              }}
            >
              📹 Start Video Call
            </button>

            <button 
              onClick={sendMessage}
              style={{
                background: "#2196F3",
                color: "white",
                padding: "14px 24px",
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                fontWeight: "500",
                transition: "all 0.2s",
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                fontSize: "15px"
              }}
              onMouseEnter={(e) => {
                e.target.style.background = "#0b7dda";
                e.target.style.transform = "translateY(-2px)";
                e.target.style.boxShadow = "0 4px 12px rgba(33, 150, 243, 0.4)";
              }}
              onMouseLeave={(e) => {
                e.target.style.background = "#2196F3";
                e.target.style.transform = "translateY(0)";
                e.target.style.boxShadow = "none";
              }}
            >
              💬 Send Message
            </button>
          </div>
        )}

        {isOwnProfile && (
          <button 
            onClick={() => nav("/profile")}
            style={{
              background: "#2196F3",
              color: "white",
              padding: "14px 24px",
              borderRadius: "8px",
              border: "none",
              cursor: "pointer",
              fontWeight: "500",
              transition: "all 0.2s",
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              fontSize: "15px"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "#0b7dda";
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 4px 12px rgba(33, 150, 243, 0.4)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "#2196F3";
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "none";
            }}
          >
            ✏️ Edit Profile
          </button>
        )}
      </div>

      {/* Fullsize Image Modal */}
      {showFullImage && profileImageUrl && (
        <div
          id="modal-overlay"
          onClick={closeFullImage}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0, 0, 0, 0.95)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            zIndex: 1000,
            animation: "fadeIn 0.3s ease-in"
          }}
        >
          <button
            id="close-button"
            onClick={closeFullImage}
            style={{
              position: "absolute",
              top: "20px",
              right: "30px",
              background: "rgba(255, 255, 255, 0.2)",
              border: "2px solid white",
              borderRadius: "50%",
              color: "white",
              width: "50px",
              height: "50px",
              fontSize: "30px",
              cursor: "pointer",
              zIndex: 1001,
              fontWeight: "bold",
              transition: "all 0.2s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onMouseEnter={(e) => {
              e.target.style.background = "rgba(255, 255, 255, 0.4)";
              e.target.style.transform = "rotate(90deg)";
            }}
            onMouseLeave={(e) => {
              e.target.style.background = "rgba(255, 255, 255, 0.2)";
              e.target.style.transform = "rotate(0deg)";
            }}
          >
            ×
          </button>
          
          <div style={{
            textAlign: "center",
            maxWidth: "95%",
            maxHeight: "95%"
          }}>
            <img
              src={profileImageUrl}
              alt={`${user.username} fullsize`}
              style={{
                maxWidth: "90vw",
                maxHeight: "90vh",
                objectFit: "contain",
                borderRadius: "8px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
                animation: "zoomIn 0.3s ease-in"
              }}
            />
            <p style={{
              color: "white",
              marginTop: "15px",
              fontSize: "14px",
              opacity: "0.8"
            }}>
              Press ESC or click outside to close
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        
        @keyframes zoomIn {
          from {
            transform: scale(0.8);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}