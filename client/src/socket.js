import { io } from "socket.io-client";

const socket = io("http://localhost:5000/", {
  transports: ["websocket"],
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000
});
export { socket };