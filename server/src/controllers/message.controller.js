import { createClient } from "@supabase/supabase-js";
import { io, getReceiverSocketId, INDRA_AI_ID } from "../lib/socket.js";
import WebSocket from "ws"; 

// CRITICAL FIX: Match the exact same transport configuration here
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  global: { WebSocket: WebSocket },
  realtime: { transport: WebSocket }
});

export const getUsersForSidebar = async (req, res) => {
  try {
    const currentUserId = req.user.id;

    const { data: interactionData } = await supabase
      .from("messages")
      .select("sender_id, receiver_id")
      .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    const associatedIds = [
      ...new Set(interactionData?.flatMap((m) => [m.sender_id, m.receiver_id]).filter((id) => id !== currentUserId))
    ];

    const { data: { users }, error } = await supabase.auth.admin.listUsers();
    if (error) throw error;

    let matchedUsers = users
      .filter((u) => associatedIds.includes(u.id) && u.id !== INDRA_AI_ID)
      .map((u) => ({
        _id: u.id,
        id: u.id, // Support both formats
        email: u.email,
        fullName: u.user_metadata?.fullName || "User",
        profilePic: u.user_metadata?.avatar_url || "",
        isAI: false
      }));

    const indraIdentityRecord = users.find(u => u.id === INDRA_AI_ID);
    if (indraIdentityRecord) {
      matchedUsers.unshift({
        _id: INDRA_AI_ID,
        id: INDRA_AI_ID,
        email: indraIdentityRecord.email,
        fullName: indraIdentityRecord.user_metadata?.fullName || "Indra AI",
        profilePic: "https://indra.ialksng.me/assets/bot.gif", // Or your preferred asset
        isAI: true
      });
    } else {
      // Fallback if Indra doesn't exist in Supabase auth yet
      matchedUsers.unshift({
        _id: INDRA_AI_ID,
        id: INDRA_AI_ID,
        email: "ai@indra.ialksng.me",
        fullName: "Indra AI",
        profilePic: "/bot.gif",
        isAI: true
      });
    }

    res.status(200).json(matchedUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar:", error.message);
    res.status(500).json({ error: "Sidebar processing dropped out." });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user.id;

    const { data: messages, error } = await supabase
      .from("messages")
      .select("*, reply_to(*)") // Also fetch the message being replied to
      .or(`and(sender_id.eq.${myId},receiver_id.eq.${userToChatId}),and(sender_id.eq.${userToChatId},receiver_id.eq.${myId})`)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const normalizedMessages = messages.map((m) => ({
      _id: m.id,
      senderId: m.sender_id,
      receiverId: m.receiver_id,
      text: m.text,
      image: m.image_url,
      createdAt: m.created_at,
      isEdited: m.is_edited || false,
      replyTo: m.reply_to ? {
        _id: m.reply_to.id,
        text: m.reply_to.text,
        image: m.reply_to.image_url,
        senderId: m.reply_to.sender_id
      } : null
    }));

    res.status(200).json(normalizedMessages);
  } catch (error) {
    console.error("Error in getMessages: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image, replyTo } = req.body; // Restored replyTo extraction
    const { id: receiverId } = req.params;
    const senderId = req.user.id;

    let imageUrl = null;

    if (image) {
      const buffer = Buffer.from(image.replace(/^data:image\/\w+;base64,/, ""), 'base64');
      const fileName = `${senderId}-${Date.now()}.png`;

      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('chat-uploads')
        .upload(fileName, buffer, {
          contentType: 'image/png',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase
        .storage
        .from('chat-uploads')
        .getPublicUrl(fileName);

      imageUrl = publicUrl;
    }

    // 1. Save User's Message
    const { data: insertedMsg, error } = await supabase
      .from("messages")
      .insert([
        {
          sender_id: senderId,
          receiver_id: receiverId,
          text,
          image_url: imageUrl,
          reply_to: replyTo || null // Save reply association
        },
      ])
      .select()
      .single();

    if (error) throw error;

    const formattedResponse = {
      _id: insertedMsg.id,
      senderId: insertedMsg.sender_id,
      receiverId: insertedMsg.receiver_id,
      text: insertedMsg.text,
      image: insertedMsg.image_url,
      createdAt: insertedMsg.created_at,
      replyTo: replyTo || null
    };

    // 2. Respond to the client immediately
    res.status(201).json(formattedResponse);

    // 3. Routing Logic
    if (receiverId === INDRA_AI_ID) {
      // --- INDRA AI FLOW ---
      const senderSocketId = getReceiverSocketId(senderId);
      
      try {
        // Emit typing indicator to the user
        if (senderSocketId) io.to(senderSocketId).emit("typing", { senderId: INDRA_AI_ID });

        // Forward message to Indra API Microservice
        const indraResponse = await fetch("https://indra.ialksng.me/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: senderId,
            message: text,
            imageUrl: imageUrl
          })
        });

        if (!indraResponse.ok) throw new Error("Indra API rejected the request");
        
        const indraData = await indraResponse.json();
        const aiTextResponse = indraData.reply || indraData.text || indraData.response || "I am processing your request.";

        // Save AI's response to Supabase
        const { data: aiMsg, error: aiError } = await supabase
          .from("messages")
          .insert([
            {
              sender_id: INDRA_AI_ID,
              receiver_id: senderId,
              text: aiTextResponse,
            },
          ])
          .select()
          .single();

        if (aiError) throw aiError;

        const formattedAiResponse = {
          _id: aiMsg.id,
          senderId: aiMsg.sender_id,
          receiverId: aiMsg.receiver_id,
          text: aiMsg.text,
          createdAt: aiMsg.created_at,
        };

        // Emit AI message back to the user
        if (senderSocketId) {
          io.to(senderSocketId).emit("newMessage", formattedAiResponse);
        }

      } catch (aiError) {
        console.error("Indra AI processing error:", aiError.message);
      } finally {
        if (senderSocketId) io.to(senderSocketId).emit("stopTyping", { senderId: INDRA_AI_ID });
      }
    } else {
      // --- STANDARD USER FLOW ---
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", formattedResponse);
      }
    }
  } catch (error) {
    console.error("Error in sendMessage: ", error.message);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user.id;

    const { error } = await supabase
      .from("messages")
      .delete()
      .match({ id: messageId, sender_id: userId });

    if (error) throw error;

    io.emit("messageDeleted", messageId);

    res.status(200).json({ message: "Message deleted successfully", id: messageId });
  } catch (error) {
    console.error("Error in deleteMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { text } = req.body;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("messages")
      .update({ text: text, is_edited: true }) 
      .match({ id: messageId, sender_id: userId })
      .select()
      .single();

    if (error) throw error;

    const formattedMessage = {
      _id: data.id,
      senderId: data.sender_id,
      receiverId: data.receiver_id,
      text: data.text,
      image: data.image_url,
      createdAt: data.created_at,
      isEdited: data.is_edited
    };

    io.emit("messageEdited", formattedMessage);

    res.status(200).json(formattedMessage);
  } catch (error) {
    console.error("Error in editMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const reactToMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { reaction } = req.body; 
    const userId = req.user.id;

    // Optional: If you want to persist reactions, add an update to Supabase here
    // e.g., appending to a JSONB 'reactions' column

    io.emit("messageReacted", { messageId, reaction, userId });

    res.status(200).json({ message: "Reaction added" });
  } catch (error) {
    console.error("Error in reactToMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getTurnCredentials = async (req, res) => {
  try {
    res.status(200).json({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
      ]
    });
  } catch (error) {
    console.error("Error in getTurnCredentials: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};