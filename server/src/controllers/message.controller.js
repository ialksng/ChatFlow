import User from "../models/user.model.js";
import Message from "../models/message.model.js";
import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import Groq from "groq-sdk";

// Initialize Groq Client
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export const getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    // Ensure the AI User is also fetched in the sidebar 
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
    });

    res.status(200).json(messages);
  } catch (error) {
    console.log("Error in getMessages controller: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    // 1. Save the User's Message
    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });
    await newMessage.save();

    // 2. Respond to client immediately with their own message to update UI instantly
    res.status(201).json(newMessage);

    // 3. Check if the receiver is the AI User
    if (receiverId === process.env.AI_USER_ID) {
      const userSocketId = getReceiverSocketId(senderId);

      try {
        // Emit "typing" event to the user so it looks like the AI is typing
        if (userSocketId) {
          io.to(userSocketId).emit("typing", { senderId: receiverId });
        }

        // FIX 1: Fetch ONLY the last 4 messages to prevent context anchoring
        const previousMessages = await Message.find({
          $or: [
            { senderId: senderId, receiverId: receiverId },
            { senderId: receiverId, receiverId: senderId },
          ],
        })
          .sort({ createdAt: -1 }) // Sort descending to get newest first
          .limit(4);

        // Reverse so the AI sees them in standard chronological order
        previousMessages.reverse();

        // Format messages for Groq
        const formattedMessages = previousMessages.map((msg) => ({
          role: msg.senderId.toString() === senderId.toString() ? "user" : "assistant",
          content: msg.text || (msg.image ? "[User sent an image]" : ""),
        }));

        // Call Groq API
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              // FIX 2: Extremely strict system prompt about changing topics
              content: "You are BuddyBot in the ChatFlow app. CRITICAL INSTRUCTION: You suffer from extreme context blindness. You MUST base your entire response ONLY on the user's very last message. If the user changes topics, completely ignore the previous messages. Be concise and friendly.",
            },
            ...formattedMessages,
          ],
          model: "openai/gpt-oss-120b", // Using the highly capable 70B model
          temperature: 0.7,
        });

        const aiResponseText = chatCompletion.choices[0]?.message?.content || "Sorry, I encountered an error thinking about that.";

        // Save AI's response to the database
        const aiMessage = new Message({
          senderId: receiverId, // AI is the sender
          receiverId: senderId, // User is the receiver
          text: aiResponseText,
        });
        await aiMessage.save();

        // Emit AI's message back to the user via Socket.io
        if (userSocketId) {
          io.to(userSocketId).emit("newMessage", aiMessage);
        }
      } catch (aiError) {
        console.error("Groq AI processing error: ", aiError.message);
      } finally {
        // Stop the typing indicator whether the API call succeeded or failed
        if (userSocketId) {
          io.to(userSocketId).emit("stopTyping", { senderId: receiverId });
        }
      }
    } else {
      // 4. Standard User-to-User routing via Socket.io
      const receiverSocketId = getReceiverSocketId(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit("newMessage", newMessage);
      }
    }
  } catch (error) {
    console.log("Error in sendMessage controller: ", error.message);
    // Ensure we don't try to send headers again if the error happens after res.status(201)
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};