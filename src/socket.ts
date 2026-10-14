// import { Server } from "socket.io";
// import type { Server as HttpServer } from "http";
// import jwt from "jsonwebtoken";
// import {User} from "./models/User";

// let io: Server;

// export function initSocket(httpServer: HttpServer) {
//   io = new Server(httpServer, {
//     cors: { origin: process.env.CLIENT_URL, credentials: true },
//   });

//   // Token se auth: socket connect hote hi user pehchan lo
//   io.use(async (socket:any, next:any) => {
//     try {
//       const token = socket.handshake.auth?.token;
//       if (!token) return next(new Error("No token"));
//       const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
//       const user = await User.findById(decoded.id).select("role");
//       if (!user) return next(new Error("User not found"));
//       socket.data.userId = String(user._id);
//       socket.data.role = user.role;
//       next();
//     } catch {
//       next(new Error("Unauthorized"));
//     }
//   });

//   io.on("connection", (socket:any) => {
//     socket.join(`user:${socket.data.userId}`);        // har user ka apna room
//     if (socket.data.role === "admin") socket.join("admins"); // saare admin ek room me
//   });

//   return io;
// }

// export const getIO = () => io;



import { Server } from "socket.io";
import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { User, Role } from "./models/User";

let io: Server;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL, credentials: true },
  });

  io.use(async (socket: any, next: any) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token"));
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
      const user = await User.findById(decoded.id).select("role");
      if (!user) return next(new Error("User not found"));
      socket.data.userId = String(user._id);
      socket.data.role = user.role;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket: any) => {
    socket.join(`user:${socket.data.userId}`); 
    if (socket.data.role === Role.ADMIN) socket.join("admins"); 
    if (socket.data.role === Role.DELIVERY_PARTNER) socket.join("delivery_partners");
  });

  return io;
}

export const getIO = () => io;