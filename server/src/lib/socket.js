import { Server } from "socket.io";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      "https://ialksng.me",
      "https://www.ialksng.me",
      "https://chatflow.ialksng.me"
    ],
    credentials: true
  }
});

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { WebSocket: WebSocket },
  realtime: { transport: WebSocket } 
});

const userSocketMap = {}; 
const INDRA_AI_ID = "00000000-0000-0000-0000-000000000000";

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

// Interceptor hook to forward the message to your actual Indra AI Server
async function handleIndraAIInference(senderId, clientMessageText, socketId) {
  try {
    // 1. Send immediate typing indicator state to Client UI
    io.to(socketId).emit("aiTypingState", { receiverId: INDRA_AI_ID, isTyping: true });

    // 2. Call your standalone Indra AI API running on Port 3001 natively
    const response = await fetch("http://127.0.0.1:3001/api/v1/indra/chat", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            prompt: clientMessageText,
            mode: "smart",
            conversationId: senderId // We pass the user's Supabase UUID so Indra maintains context per-user
        })
    });

    if (!response.ok) {
        throw new Error(`Indra API responded with status: ${response.status}`);
    }

    let aiResponseText = "";
    const decoder = new TextDecoder("utf-8");

    // 3. Read the Server-Sent Events (SSE) stream from Indra piece-by-piece
    for await (const chunk of response.body) {
        const textChunk = decoder.decode(chunk, { stream: true });
        const lines = textChunk.split('\n');
        
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim(); // Remove 'data: ' prefix
                if (!dataStr) continue;
                try {
                    const parsed = JSON.parse(dataStr);
                    // Append the streaming token
                    if (parsed.token) {
                        aiResponseText += parsed.token;
                    }
                } catch (e) {
                    // Ignore incomplete JSON chunks in the stream
                }
            }
        }
    }

    // 4. Commit the final generated answer into PostgreSQL storage
    const { data: insertedMsg, error: insertError } = await supabase
      .from("messages")
      .insert([{ 
          sender_id: INDRA_AI_ID, 
          receiver_id: senderId, 
          text: aiResponseText || "No response received from Indra." 
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    const normalizedAIPayload = {
      _id: insertedMsg.id,
      senderId: INDRA_AI_ID,
      receiverId: senderId,
      text: insertedMsg.text,
      image: null,
      createdAt: insertedMsg.created_at,
    };

    // 5. Kill indicator status state and emit the final message to the client
    io.to(socketId).emit("aiTypingState", { receiverId: INDRA_AI_ID, isTyping: false });
    io.to(socketId).emit("newMessage", normalizedAIPayload);

  } catch (error) {
    console.error("Critical Failure routing to Indra AI:", error.message);
    io.to(socketId).emit("aiTypingState", { receiverId: INDRA_AI_ID, isTyping: false });
  }
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Unauthorized Context"));
  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET);
    socket.userId = decoded.sub;
    next();
  } catch (err) { return next(new Error("Forbidden Token")); }
});

io.on("connection", (socket) => {
  if (socket.userId) userSocketMap[socket.userId] = socket.id;
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  // Forward the AI request when triggered
  socket.on("triggerIndraAI", async ({ messageText }) => {
     await handleIndraAIInference(socket.userId, messageText, socket.id);
  });

  socket.on("disconnect", () => {
    delete userSocketMap[socket.userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server, INDRA_AI_ID };