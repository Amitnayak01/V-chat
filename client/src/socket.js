import { io } from "socket.io-client";

const socket = io("https://video-call-961n.onrender.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});
export { socket };
