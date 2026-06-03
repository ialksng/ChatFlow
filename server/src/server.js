import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.route.js";
import messageRoutes from "./routes/message.route.js";
import { app, server } from "./lib/socket.js";

dotenv.config();

// Default to 5002 to match your assigned ecosystem port mapping
const PORT = process.env.PORT || 5002;

// Absolute path resolution relative to this file's physical location on disk
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename); // Points to: server/src
const clientDistPath = path.join(__dirname, "../../client/dist"); // Points to: client/dist

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: [process.env.CLIENT_URL || "http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  })
);

// REST API Request Routings
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// Static Web Asset Serving Pipeline (Always verified against process flag conditions)
if (process.env.NODE_ENV === "production") {
  app.use(express.static(clientDistPath));

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
});
}

server.listen(PORT, () => {
  console.log("Unified Chatflow Server listening natively on Port: " + PORT);
});