import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";

import path from "path";

import { connectDB } from "./lib/db.js";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { app, server } from "./lib/socket.js";

dotenv.config();

const PORT = process.env.PORT || 5001; // Added a fallback port just in case
const __dirname = path.resolve();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CLIENT_API,
    credentials: true,
}));

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// Must be "production" for Render deployment
if (process.env.NODE_ENV === "production") {
  // Look directly inside the client/dist folder from the root
  app.use(express.static(path.join(__dirname, "client", "dist")));

  // FIX: Using a RegExp /.*/ catches all routes safely in Express 5
  app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
  });
}

// FIX 2: Changed app.listen to server.listen so Socket.io works properly
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    connectDB();
});