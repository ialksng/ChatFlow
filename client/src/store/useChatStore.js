import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isTyping: false,
  replyingTo: null, // NEW: Track the message being replied to

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      set({ users: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isUsersLoading: false });
    }
  },

  getMessages: async (userId) => {
    set({ isMessagesLoading: true });
    try {
      const res = await axiosInstance.get(`/messages/${userId}`);
      set({ messages: res.data });
    } catch (error) {
      toast.error(error.response.data.message);
    } finally {
      set({ isMessagesLoading: false });
    }
  },
  
  sendMessage: async (messageData) => {
    const { selectedUser, messages, replyingTo } = get();
    try {
      // Include replyTo ID if it exists
      const dataToSend = replyingTo 
        ? { ...messageData, replyTo: replyingTo._id } 
        : messageData;

      const res = await axiosInstance.post(`/messages/send/${selectedUser._id}`, dataToSend);
      set({ 
        messages: [...messages, res.data],
        replyingTo: null // Clear reply state after sending
      });
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  // --- NEW FEATURES COMPLETED BELOW ---

  setReplyingTo: (message) => set({ replyingTo: message }),

  deleteMessage: async (messageId) => {
    try {
      const res = await axiosInstance.delete(`/messages/delete/${messageId}`);
      // Optimistically update UI
      set((state) => ({
        messages: state.messages.map((msg) => 
          msg._id === messageId ? res.data : msg
        ),
      }));
      toast.success("Message deleted");
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  editMessage: async (messageId, newText) => {
    try {
      const res = await axiosInstance.put(`/messages/edit/${messageId}`, { text: newText });
      set((state) => ({
        messages: state.messages.map((msg) => 
          msg._id === messageId ? res.data : msg
        ),
      }));
    } catch (error) {
      toast.error(error.response.data.message);
    }
  },

  reactToMessage: async (messageId, emoji) => {
    try {
      const res = await axiosInstance.post(`/messages/react/${messageId}`, { emoji });
      set((state) => ({
        messages: state.messages.map((msg) => 
          msg._id === messageId ? res.data : msg
        ),
      }));
    } catch (error) {
      toast.error("Failed to react");
    }
  },

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;

    socket.on("newMessage", (newMessage) => {
      const isMessageSentFromSelectedUser = newMessage.senderId === selectedUser._id;
      if (!isMessageSentFromSelectedUser) return;

      set({
        messages: [...get().messages, newMessage],
      });
    });

    // NEW: Listen for edits, deletes, and reactions
    socket.on("messageUpdated", (updatedMessage) => {
      const isRelevantChat = updatedMessage.senderId === selectedUser._id || updatedMessage.receiverId === selectedUser._id;
      if (!isRelevantChat) return;

      set((state) => ({
        messages: state.messages.map((msg) => 
          msg._id === updatedMessage._id ? updatedMessage : msg
        ),
      }));
    });

    socket.on("typing", (data) => {
      if (data.senderId === get().selectedUser?._id) set({ isTyping: true });
    });

    socket.on("stopTyping", (data) => {
      if (data.senderId === get().selectedUser?._id) set({ isTyping: false });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    socket.off("newMessage");
    socket.off("messageUpdated"); // NEW: cleanup
    socket.off("typing");
    socket.off("stopTyping");
  },

  setSelectedUser: (selectedUser) => set({ selectedUser }),
}));