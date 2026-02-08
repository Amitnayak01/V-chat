import React from "react";

export default function ParticipantsList({ participants, onClose }) {
  return (
    <div
      style={{
        width: "300px",
        height: "100vh",
        background: "rgba(0,0,0,0.95)",
        borderLeft: "1px solid rgba(255,255,255,0.1)",
        display: "flex",
        flexDirection: "column"
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "20px",
          borderBottom: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <h3 style={{ margin: 0, fontSize: "18px" }}>
          👥 Participants ({participants.length})
        </h3>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "white",
            cursor: "pointer",
            fontSize: "24px",
            padding: "0"
          }}
        >
          ×
        </button>
      </div>

      {/* Participants List */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "10px"
        }}
      >
        {participants.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", marginTop: "40px" }}>
            <p style={{ fontSize: "48px", margin: 0 }}>👥</p>
            <p>No participants yet</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            {participants.map((participant, index) => (
              <div
                key={participant.userId || index}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "15px",
                  padding: "15px",
                  background: "rgba(255,255,255,0.05)",
                  borderRadius: "10px",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: "45px",
                    height: "45px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: "white",
                    flexShrink: 0
                  }}
                >
                  {participant.username?.charAt(0).toUpperCase() || "?"}
                </div>

                {/* User Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontWeight: "500",
                    fontSize: "14px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap"
                  }}>
                    {participant.username || "Unknown User"}
                    {participant.userId === localStorage.getItem("userId") && (
                      <span style={{
                        marginLeft: "8px",
                        background: "#2196F3",
                        padding: "2px 6px",
                        borderRadius: "3px",
                        fontSize: "10px"
                      }}>
                        YOU
                      </span>
                    )}
                  </div>
                  <div style={{
                    fontSize: "12px",
                    color: "#888",
                    marginTop: "4px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <span style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      background: "#00ff00",
                      display: "inline-block"
                    }} />
                    Active
                  </div>
                </div>

                {/* Action Menu (Optional) */}
                <div style={{ position: "relative" }}>
                  {participant.userId !== localStorage.getItem("userId") && (
                    <button
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#888",
                        cursor: "pointer",
                        fontSize: "18px",
                        padding: "5px"
                      }}
                      title="More options"
                    >
                      ⋮
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div
        style={{
          padding: "15px 20px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          fontSize: "12px",
          color: "#888"
        }}
      >
        <p style={{ margin: 0 }}>
          💡 Tip: Click on a participant to view more options
        </p>
      </div>
    </div>
  );
}