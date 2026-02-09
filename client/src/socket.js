import { io } from "socket.io-client";

const socket = io("https://v-chat-itn7.onrender.com", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});
export { socket };