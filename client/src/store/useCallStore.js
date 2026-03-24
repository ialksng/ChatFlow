import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";

const servers = {
  iceServers: [
    { urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
  ],
};

export const useCallStore = create((set, get) => ({
  callState: "idle", // idle, calling, receiving, active
  callMode: null,    // video, audio, draw
  remoteUserId: null,
  callerName: null,
  incomingSignal: null,

  localStream: null,
  remoteStream: null,
  peerConnection: null,

  // Media States
  isMicOn: true,
  isVideoOn: true,
  isScreenSharing: false,

  listenToCallEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("call-incoming", ({ signal, from, name, mode }) => {
      set({ 
        callState: "receiving", 
        remoteUserId: from,
        callerName: name,
        callMode: mode,
        incomingSignal: signal
      });
    });

    socket.on("call-accepted", async (signal) => {
      const { peerConnection } = get();
      if (peerConnection && signal) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
      }
      set({ callState: "active" });
    });

    socket.on("ice-candidate", async (candidate) => {
      const { peerConnection } = get();
      if (peerConnection && candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
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
    socket.off("ice-candidate");
    socket.off("call-ended");
  },

  initiateCall: async (mode) => {
    const { selectedUser } = useChatStore.getState();
    const { authUser, socket } = useAuthStore.getState();
    if (!selectedUser || !socket) return;

    set({ 
      callState: "calling", 
      callMode: mode,
      remoteUserId: selectedUser._id,
      callerName: selectedUser.fullName,
      isMicOn: true,
      isVideoOn: true,
      isScreenSharing: false,
    });

    let stream = null;
    if (mode === "video" || mode === "audio") {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: mode === "video",
          audio: true
        });
        set({ localStream: stream });
      } catch (err) {
        console.error("Failed to get local stream", err);
        get().endCallUI();
        return;
      }
    }

    const pc = new RTCPeerConnection(servers);
    set({ peerConnection: pc });

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      set({ remoteStream: event.streams[0] });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: selectedUser._id, candidate: event.candidate });
      }
    };

    let offer = null;
    if (mode !== "draw") {
      offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
    }

    socket.emit("call-user", {
      userToCall: selectedUser._id,
      from: authUser._id,
      name: authUser.fullName,
      mode: mode,
      signalData: offer 
    });
  },

  acceptCall: async () => {
    const { remoteUserId, callMode, incomingSignal } = get();
    const { socket } = useAuthStore.getState();
    if (!socket) return;

    set({ callState: "active", isMicOn: true, isVideoOn: true, isScreenSharing: false });

    let stream = null;
    if (callMode === "video" || callMode === "audio") {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: callMode === "video",
          audio: true
        });
        set({ localStream: stream });
      } catch (err) {
        console.error("Failed to get local stream", err);
      }
    }

    const pc = new RTCPeerConnection(servers);
    set({ peerConnection: pc });

    if (stream) {
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
    }

    pc.ontrack = (event) => {
      set({ remoteStream: event.streams[0] });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: remoteUserId, candidate: event.candidate });
      }
    };

    let answer = null;
    if (callMode !== "draw" && incomingSignal) {
      await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal));
      answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
    }

    socket.emit("answer-call", {
      to: remoteUserId,
      signal: answer
    });
  },

  rejectCall: () => {
    const { remoteUserId } = get();
    const socket = useAuthStore.getState().socket;
    
    if (remoteUserId && socket) {
      socket.emit("end-call", { to: remoteUserId });
    }
    get().endCallUI();
  },

  endCallUI: () => {
    const { localStream, peerConnection } = get();
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    if (peerConnection) {
      peerConnection.close();
    }

    set({ 
      callState: "idle", 
      callMode: null, 
      remoteUserId: null,
      callerName: null,
      incomingSignal: null,
      localStream: null,
      remoteStream: null,
      peerConnection: null,
      isMicOn: true,
      isVideoOn: true,
      isScreenSharing: false,
    });
  },

  // --- NEW FEATURES COMPLETED BELOW ---

  toggleMic: () => {
    const { localStream, isMicOn } = get();
    if (localStream) {
      localStream.getAudioTracks().forEach(track => track.enabled = !isMicOn);
      set({ isMicOn: !isMicOn });
    }
  },

  toggleVideo: () => {
    const { localStream, isVideoOn } = get();
    if (localStream) {
      localStream.getVideoTracks().forEach(track => track.enabled = !isVideoOn);
      set({ isVideoOn: !isVideoOn });
    }
  },

  toggleScreenShare: async () => {
    const { isScreenSharing, peerConnection, localStream } = get();
    
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        // Find the video sender and replace the camera track with the screen track
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);

        // Listen for user stopping sharing via native browser UI
        screenTrack.onended = () => {
          get().toggleScreenShare(); // Revert safely back to camera
        };

        set({ isScreenSharing: true });
      } catch (err) {
        console.error("Screen sharing failed or cancelled", err);
      }
    } else {
      // Revert back to camera
      try {
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        const videoTrack = localStream.getVideoTracks()[0];
        
        if (sender && videoTrack) {
          sender.replaceTrack(videoTrack);
        }
        set({ isScreenSharing: false });
      } catch (err) {
        console.error("Failed to revert to camera", err);
      }
    }
  }
}));