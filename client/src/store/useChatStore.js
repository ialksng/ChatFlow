import { create } from "zustand";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";
import { useAuthStore } from "./useAuthStore";

export const INDRA_AI_ID = "00000000-0000-0000-0000-000000000000";

export const useChatStore = create((set, get) => ({
  messages: [],
  users: [],
  selectedUser: null,
  isUsersLoading: false,
  isMessagesLoading: false,
  isTyping: false,
  isAiTyping: false, 
  replyingTo: null,

  getUsers: async () => {
    set({ isUsersLoading: true });
    try {
      const res = await axiosInstance.get("/messages/users");
      let fetchedUsers = res.data || [];
      
      // Ensure Indra AI exists in the contact list natively
      const hasIndra = fetchedUsers.some(u => (u.id || u._id) === INDRA_AI_ID);
      if (!hasIndra) {
        fetchedUsers.unshift({
          _id: INDRA_AI_ID,
          id: INDRA_AI_ID,
          fullName: "Indra AI",
          email: "ai@indra.ialksng.me",
          profilePic: "/bot.gif" // Or your preferred avatar
        });
      }
      
      set({ users: fetchedUsers });
    } catch (error) {
      console.error("Error fetching users:", error);
      toast.error(error.response?.data?.message || "Failed to fetch users");
      set({ users: [] }); // Fallback to empty array to prevent iterable errors
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
      toast.error(error.response?.data?.message || "Failed to fetch messages");
    } finally {
      set({ isMessagesLoading: false });
    }
  },
  
  sendMessage: async (messageData) => {
    const { selectedUser, messages, replyingTo } = get();
    const userId = selectedUser.id || selectedUser._id;
    
    try {
      const dataToSend = replyingTo 
        ? { ...messageData, replyTo: replyingTo.id || replyingTo._id } 
        : messageData;

      // Optimistic UI update (optional, but good for perceived speed)
      if (userId === INDRA_AI_ID) set({ isAiTyping: true });

      const res = await axiosInstance.post(`/messages/send/${userId}`, dataToSend);
      set({ 
        messages: [...get().messages, res.data],
        replyingTo: null 
      });
    } catch (error) {
      toast.error(error.response?.data?.message || "Message failed to send");
    } finally {
      if (userId === INDRA_AI_ID) set({ isAiTyping: false });
    }
  },

  setReplyingTo: (message) => set({ replyingTo: message }),
  setSelectedUser: (selectedUser) => set({ selectedUser }),

  subscribeToMessages: () => {
    const { selectedUser } = get();
    if (!selectedUser) return;

    const socket = useAuthStore.getState().socket;

    socket.on("newMessage", (newMessage) => {
      const selectedId = selectedUser.id || selectedUser._id;
      // Handle Supabase UUIDs
      if (newMessage.senderId !== selectedId) return;
      set({ messages: [...get().messages, newMessage] });
    });

    socket.on("typing", (data) => {
      const selectedId = selectedUser.id || selectedUser._id;
      if (data.senderId === selectedId) set({ isTyping: true });
    });

    socket.on("stopTyping", (data) => {
      const selectedId = selectedUser.id || selectedUser._id;
      if (data.senderId === selectedId) set({ isTyping: false });
    });
  },

  unsubscribeFromMessages: () => {
    const socket = useAuthStore.getState().socket;
    if (socket) {
      socket.off("newMessage");
      socket.off("typing");
      socket.off("stopTyping");
    }
  }
}));