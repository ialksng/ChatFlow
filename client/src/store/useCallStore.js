import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";

export const useCallStore = create((set, get) => ({
  callState: "idle", 
  callMode: null, 
  callerData: null, 
  
  localStream: null,
  remoteStream: null,

  listenToCallEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("call-incoming", (data) => {
      set({ 
        callState: "receiving", 
        callerData: data,
        callMode: data.mode 
      });
    });

    socket.on("call-accepted", (signal) => {
      set({ callState: "active" });
    });

    socket.on("call-ended", () => {
      get().endCallUI();
    });
  },

  stopListeningToCallEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;
    socket.off("call-incoming");
    socket.off("call-accepted");
    socket.off("call-ended");
  },

  initiateCall: (mode) => {
    const { selectedUser } = useChatStore.getState();
    const { authUser, socket } = useAuthStore.getState();

    if (!selectedUser || !socket) return;

    set({ callState: "calling", callMode: mode });

    socket.emit("call-user", {
      userToCall: selectedUser._id,
      from: authUser._id,
      name: authUser.fullName,
      mode: mode,
      signalData: null 
    });
  },

  acceptCall: () => {
    set({ callState: "active" });
  },

  rejectCall: () => {
    const { callerData } = get();
    const socket = useAuthStore.getState().socket;
    
    if (callerData && socket) {
      socket.emit("end-call", { to: callerData.from });
    }
    get().endCallUI();
  },

  endCallUI: () => {
    const { localStream } = get();
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }

    set({ 
      callState: "idle", 
      callMode: null, 
      callerData: null,
      localStream: null,
      remoteStream: null
    });
  }
}));