import React, { useState, useEffect, useRef } from "react";
import { socket } from "../../socket";

export default function ChatSidebar({ roomId, onClose }) {
  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const currentUserId = localStorage.getItem("userId");
  const currentUsername = localStorage.getItem("username") || "Anonymous";

  useEffect(() => {
    // Load chat messages
    loadMessages();

    // Socket listeners
    socket.on("meeting-receive-message", (message) => {
      setMessages(prev => [...prev, message]);
    });

    socket.on("meeting-typing", ({ userId, username, isTyping }) => {
      if (userId !== currentUserId) {
        if (isTyping) {
          setTypingUsers(prev => [...new Set([...prev, username])]);
        } else {
          setTypingUsers(prev => prev.filter(u => u !== username));
        }
      }
    });

    socket.on("meeting-file-uploaded", (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => {
      socket.off("meeting-receive-message");
      socket.off("meeting-typing");
      socket.off("meeting-file-uploaded");
    };
  }, [roomId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    try {
      const response = await fetch(`/api/meetings/messages/${roomId}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (err) {
      console.error("Error loading messages:", err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    
    if (!messageText.trim()) return;

    const message = {
      roomId,
      senderId: currentUserId,
      senderName: currentUsername,
      text: messageText,
      timestamp: new Date()
    };

    socket.emit("meeting-send-message", message);
    setMessageText("");
    handleStopTyping();
  };

  const handleTyping = () => {
    if (!isTyping) {
      setIsTyping(true);
      socket.emit("meeting-typing", {
        roomId,
        userId: currentUserId,
        username: currentUsername,
        isTyping: true
      });
    }

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(handleStopTyping, 1000);
  };

  const handleStopTyping = () => {
    setIsTyping(false);
    socket.emit("meeting-typing", {
      roomId,
      userId: currentUserId,
      username: currentUsername,
      isTyping: false
    });
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("roomId", roomId);
    formData.append("senderId", currentUserId);
    formData.append("senderName", currentUsername);

    try {
      const response = await fetch("/api/meetings/upload-file", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`
        },
        body: formData
      });

      if (response.ok) {
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    } catch (err) {
      console.error("Error uploading file:", err);
    }
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div
      style={{
        width: "350px",
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
        <h3 style={{ margin: 0, fontSize: "18px" }}>💬 Chat</h3>
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

      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "15px"
        }}
      >
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#888", marginTop: "40px" }}>
            <p style={{ fontSize: "48px", margin: 0 }}>💬</p>
            <p>No messages yet</p>
            <p style={{ fontSize: "12px" }}>Start the conversation!</p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isOwnMessage = msg.senderId === currentUserId;
            
            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: isOwnMessage ? "flex-end" : "flex-start"
                }}
              >
                {!isOwnMessage && (
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "4px" }}>
                    {msg.senderName}
                  </div>
                )}
                
                <div
                  style={{
                    background: isOwnMessage 
                      ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
                      : "rgba(255,255,255,0.1)",
                    padding: "10px 15px",
                    borderRadius: "15px",
                    maxWidth: "80%",
                    wordBreak: "break-word"
                  }}
                >
                  {msg.file ? (
                    <div>
                      {msg.file.type?.startsWith("image/") ? (
                        <img
                          src={msg.file.url}
                          alt="Shared file"
                          style={{
                            maxWidth: "100%",
                            borderRadius: "8px",
                            marginBottom: "8px"
                          }}
                        />
                      ) : (
                        <a
                          href={msg.file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: "#2196F3",
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px"
                          }}
                        >
                          📎 {msg.file.name}
                        </a>
                      )}
                      {msg.text && <p style={{ margin: "8px 0 0 0" }}>{msg.text}</p>}
                    </div>
                  ) : (
                    <p style={{ margin: 0 }}>{msg.text}</p>
                  )}
                </div>
                
                <div style={{ fontSize: "10px", color: "#666", marginTop: "4px" }}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            );
          })
        )}
        
        {/* Typing Indicator */}
        {typingUsers.length > 0 && (
          <div style={{ color: "#888", fontSize: "12px", fontStyle: "italic" }}>
            {typingUsers.join(", ")} {typingUsers.length === 1 ? "is" : "are"} typing...
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div
        style={{
          padding: "20px",
          borderTop: "1px solid rgba(255,255,255,0.1)"
        }}
      >
        <form onSubmit={handleSendMessage}>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                color: "white",
                cursor: "pointer",
                fontSize: "20px",
                padding: "10px 15px",
                borderRadius: "8px"
              }}
              title="Attach file"
            >
              📎
            </button>
            
            <input
              type="text"
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => {
                setMessageText(e.target.value);
                handleTyping();
              }}
              style={{
                flex: 1,
                padding: "12px 15px",
                borderRadius: "8px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.05)",
                color: "white",
                fontSize: "14px",
                outline: "none"
              }}
            />
            
            <button
              type="submit"
              disabled={!messageText.trim()}
              style={{
                background: messageText.trim() 
                  ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" 
                  : "rgba(255,255,255,0.1)",
                border: "none",
                color: "white",
                cursor: messageText.trim() ? "pointer" : "not-allowed",
                fontSize: "20px",
                padding: "10px 20px",
                borderRadius: "8px",
                transition: "all 0.2s"
              }}
            >
              📤
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}