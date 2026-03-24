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

    // 2. Respond to client immediately with their own message
    res.status(201).json(newMessage);

    // 3. Check if the receiver is the AI User
    if (receiverId === process.env.AI_USER_ID) {
      // Fetch the last 10 messages for context
      const previousMessages = await Message.find({
        $or: [
          { senderId: senderId, receiverId: receiverId },
          { senderId: receiverId, receiverId: senderId },
        ],
      })
        .sort({ createdAt: 1 })
        .limit(10);

      // Format messages for Groq
      const formattedMessages = previousMessages.map((msg) => ({
        role: msg.senderId.toString() === senderId.toString() ? "user" : "assistant",
        content: msg.text || (msg.image ? "[User sent an image]" : ""),
      }));

      try {
        // Call Groq API
        const chatCompletion = await groq.chat.completions.create({
          messages: [
            {
              role: "system",
              content: "You are a helpful, concise AI assistant integrated into a real-time chat application called ChatFlow. Respond naturally like a friend.",
            },
            ...formattedMessages,
          ],
          model: "llama3-8b-8192", // Highly recommend Llama 3 for fast, smart chat
        });

        const aiResponseText = chatCompletion.choices[0]?.message?.content || "Sorry, I encountered an error thinking about that.";

        // Save AI's response to the database
        const aiMessage = new Message({
          senderId: receiverId, // AI is the sender
          receiverId: senderId, // User is the receiver
          text: aiResponseText,
        });
        await aiMessage.save();

        // Emit AI's message to the user via Socket.io
        const userSocketId = getReceiverSocketId(senderId);
        if (userSocketId) {
          io.to(userSocketId).emit("newMessage", aiMessage);
        }
      } catch (aiError) {
        console.error("Groq AI processing error: ", aiError.message);
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
    // Note: Only send 500 if we haven't already sent the 201 response above
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};