import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import Groq from "groq-sdk";
import twilio from "twilio";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const myId = req.user._id;

    const messages = await Message.find({
      $or: [
        { senderId: myId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: myId },
      ],
    }).populate("replyTo", "text image senderId"); // Populate reply info

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    // ADDED: replyTo extraction
    const { text, image, replyTo } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
      replyTo: replyTo || null, // ADDED: Save replyTo
    });
    await newMessage.save();

    // Populate reply data before sending to client
    if (replyTo) {
      await newMessage.populate("replyTo", "text image senderId");
    }

    res.status(201).json(newMessage);

    if (receiverId === process.env.AI_USER_ID) {
      // ... [Keep your existing AI logic here exactly as is] ...
      const userSocketId = getReceiverSocketId(senderId.toString()); // FIXED
      try {
        if (userSocketId) io.to(userSocketId).emit("typing", { senderId: receiverId });
        
        const previousMessages = await Message.find({
          $or: [
            { senderId: senderId, receiverId: receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        }).sort({ createdAt: -1 }).limit(4);
        previousMessages.reverse();

        const formattedMessages = previousMessages.map((msg) => ({
          role: msg.senderId.toString() === senderId.toString() ? "user" : "assistant",
          content: msg.text || (msg.image ? "[User sent an image]" : ""),
        }));

        const chatCompletion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "You are BuddyBot in the ChatFlow app. CRITICAL INSTRUCTION: You suffer from extreme context blindness. You MUST base your entire response ONLY on the user's very last message. If the user changes topics, completely ignore the previous messages. Be concise and friendly." },
            ...formattedMessages,
          ],
          model: "openai/gpt-oss-120b", 
          temperature: 0.7,
        });

        const aiMessage = new Message({
          senderId: receiverId,
          receiverId: senderId,
          text: chatCompletion.choices[0]?.message?.content || "Sorry, I encountered an error.",
        });
        await aiMessage.save();

        if (userSocketId) io.to(userSocketId).emit("newMessage", aiMessage);
      } catch (aiError) {
        console.error("Groq AI processing error: ", aiError.message);
      } finally {
        if (userSocketId) io.to(userSocketId).emit("stopTyping", { senderId: receiverId });
      }
    } else {
      const receiverSocketId = getReceiverSocketId(receiverId.toString()); // FIXED
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", newMessage);
      }
    }
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    if (!res.headersSent) res.status(500).json({ error: "Internal server error" });
  }
};

// --- NEW FUNCTIONALITIES BELOW ---

export const deleteMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const senderId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Ensure only the sender can delete the message
    if (message.senderId.toString() !== senderId.toString()) {
      return res.status(403).json({ error: "Unauthorized to delete this message" });
    }

    // Soft delete implementation
    message.isDeleted = true;
    message.text = "This message was deleted";
    message.image = null; // Clear image if any
    await message.save();

    res.status(200).json(message);

    // Notify receiver
    const receiverSocketId = getReceiverSocketId(message.receiverId.toString()); // FIXED
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messageUpdated", message);
    }
  } catch (error) {
    console.log("Error in deleteMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const editMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { text } = req.body;
    const senderId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });
    if (message.isDeleted) return res.status(400).json({ error: "Cannot edit a deleted message" });
    
    if (message.senderId.toString() !== senderId.toString()) {
      return res.status(403).json({ error: "Unauthorized to edit this message" });
    }

    message.text = text;
    message.isEdited = true;
    await message.save();

    res.status(200).json(message);

    // Notify receiver
    const receiverSocketId = getReceiverSocketId(message.receiverId.toString()); // FIXED
    if (receiverSocketId) {
      io.to(receiverSocketId).emit("messageUpdated", message);
    }
  } catch (error) {
    console.log("Error in editMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const reactToMessage = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user._id;

    const message = await Message.findById(messageId);
    if (!message) return res.status(404).json({ error: "Message not found" });

    // Check if user already reacted
    const existingReactionIndex = message.reactions.findIndex(
      (r) => r.user.toString() === userId.toString()
    );

    if (existingReactionIndex !== -1) {
      // If clicking the same emoji, toggle it off (remove reaction)
      if (message.reactions[existingReactionIndex].emoji === emoji) {
        message.reactions.splice(existingReactionIndex, 1);
      } else {
        // Change to new emoji
        message.reactions[existingReactionIndex].emoji = emoji;
      }
    } else {
      // Add new reaction
      message.reactions.push({ user: userId, emoji });
    }

    await message.save();
    
    // Determine the other user in the chat to notify them
    const otherUserId = message.senderId.toString() === userId.toString() ? message.receiverId : message.senderId;
    const otherUserSocketId = getReceiverSocketId(otherUserId.toString()); // FIXED
    
    res.status(200).json(message);

    if (otherUserSocketId) {
      io.to(otherUserSocketId).emit("messageUpdated", message);
    }
  } catch (error) {
    console.log("Error in reactToMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const getTurnCredentials = async (req, res) => {
  // DEBUG: This will show up in your server's dashboard logs (e.g., Render/Vercel logs)
  console.log("Checking Twilio SID:", process.env.TWILIO_ACCOUNT_SID ? "FOUND" : "MISSING");

  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error("CRITICAL: Twilio keys are missing from environment variables!");
    return res.status(500).json({ error: "Twilio configuration missing on server" });
  }

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const token = await client.tokens.create();
    res.status(200).json(token.iceServers);
  } catch (error) {
    console.error("Twilio API Error:", error.message);
    res.status(500).json({ error: error.message });
  }
};