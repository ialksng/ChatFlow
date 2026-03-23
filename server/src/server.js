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

const PORT = process.env.PORT;
const __dirname = path.resolve();

app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CLIENT_API,
    credentials: true,
}));

app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

if (process.env.NODE_ENV === "production") {
  // FIX 1: Removed "../" because __dirname is already the root of your project
  app.use(express.static(path.join(__dirname, "client", "dist")));

  app.get(/.*/, (req, res) => {
    // FIX 1: Also removed "../" here
    res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
  });
};

// FIX 2: Changed app.listen to server.listen so Socket.io works properly
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    connectDB();
});