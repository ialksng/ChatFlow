import { create } from "zustand";
import { useAuthStore } from "./useAuthStore";
import { useChatStore } from "./useChatStore";
import toast from "react-hot-toast";
import { axiosInstance } from "../lib/axios";

// Helper function to guarantee we ALWAYS return a stream, preventing crashes
const getRobustMediaStream = async (mode) => {
  let stream = new MediaStream();
  let hasVideo = false;
  let hasAudio = false;

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    try {
      const userStream = await navigator.mediaDevices.getUserMedia({ video: mode === "video", audio: true });
      userStream.getTracks().forEach(t => stream.addTrack(t));
      hasVideo = mode === "video";
      hasAudio = true;
    } catch (err) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioStream.getTracks().forEach(t => stream.addTrack(t));
        hasAudio = true;
        toast.error("Camera access failed. Joined with Audio only.");
      } catch (audioErr) {
        toast.error("Mic/Camera blocked. You are in listen-only mode.");
      }
    }
  } else {
    toast.error("Secure connection (HTTPS/localhost) required for Camera/Mic.");
  }

  // WebRTC Hack: Add dummy silent tracks if missing so the connection succeeds 
  if (!hasVideo) {
    const canvas = document.createElement("canvas");
    canvas.width = 2; 
    canvas.height = 2;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, 2, 2);

    const dummyVideo = canvas.captureStream(1).getVideoTracks()[0];
    stream.addTrack(dummyVideo);
  }
  
  if (!hasAudio) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const dest = ctx.createMediaStreamDestination();
    const dummyAudio = dest.stream.getAudioTracks()[0];
    dummyAudio.enabled = false;
    stream.addTrack(dummyAudio);
  }

  return stream;
};

export const useCallStore = create((set, get) => ({
  callState: "idle", 
  callMode: null,    
  remoteUserId: null,
  callerName: null,
  incomingSignal: null,

  localStream: null,
  remoteStream: null,
  peerConnection: null,
  iceCandidateQueue: [],

  isMicOn: true,
  isVideoOn: true,
  isScreenSharing: false,
  remoteIsScreenSharing: false, 

  iceServers: null, 

  fetchIceServers: async () => {
    if (get().iceServers) return { iceServers: get().iceServers };
    try {
      const res = await axiosInstance.get("/messages/turn");
      set({ iceServers: res.data });
      return { iceServers: res.data };
    } catch (error) {
      console.error("Failed to fetch TURN servers, using STUN fallback", error);
      return { iceServers: [{ urls: ["stun:stun1.l.google.com:19302"] }] };
    }
  },

  listenToCallEvents: () => {
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    socket.on("call-incoming", ({ signal, from, name, mode }) => {
      set({ callState: "receiving", remoteUserId: from, callerName: name, callMode: mode, incomingSignal: signal });
    });

    socket.on("call-accepted", async (signal) => {
      const { peerConnection, iceCandidateQueue } = get();
      if (peerConnection && signal) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(signal));
        iceCandidateQueue.forEach(async (candidate) => {
          try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
        });
        set({ iceCandidateQueue: [] });
      }
      set({ callState: "active" });
    });

    socket.on("ice-candidate", async (candidate) => {
      if (candidate && candidate.type === "CUSTOM_SIGNAL") {
        if (candidate.action === "SCREEN_SHARE_ON") set({ remoteIsScreenSharing: true });
        if (candidate.action === "SCREEN_SHARE_OFF") set({ remoteIsScreenSharing: false });
        return;
      }

      const { peerConnection } = get();
      if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
        try { await peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
      } else {
        set((state) => ({ iceCandidateQueue: [...state.iceCandidateQueue, candidate] }));
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
      callState: "calling", callMode: mode, remoteUserId: selectedUser._id,
      callerName: selectedUser.fullName, isMicOn: true, isVideoOn: true,
      isScreenSharing: false, remoteIsScreenSharing: false, iceCandidateQueue: [],
    });

    let stream = await getRobustMediaStream(mode);
    set({ localStream: stream });

    const turnConfig = await get().fetchIceServers();
    const pc = new RTCPeerConnection({
      ...turnConfig,
      // iceTransportPolicy: "relay" // Uncomment this to FORCE Twilio TURN servers for testing
    });
    set({ peerConnection: pc });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ROBUST TRACK HANDLING
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        set({ remoteStream });
      } else {
        const newStream = new MediaStream([event.track]);
        set({ remoteStream: newStream });
      }
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
      userToCall: selectedUser._id, from: authUser._id, name: authUser.fullName,
      mode: mode, signalData: offer 
    });
  },

  acceptCall: async () => {
    const { remoteUserId, callMode, incomingSignal } = get();
    const socket = useAuthStore.getState().socket;
    if (!socket) return;

    set({ callState: "active", isMicOn: true, isVideoOn: true, isScreenSharing: false, remoteIsScreenSharing: false });

    let stream = await getRobustMediaStream(callMode);
    set({ localStream: stream });

    const turnConfig = await get().fetchIceServers();
    const pc = new RTCPeerConnection({
      ...turnConfig,
      // iceTransportPolicy: "relay" // Uncomment this to FORCE Twilio TURN servers for testing
    });
    set({ peerConnection: pc });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // ROBUST TRACK HANDLING
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        set({ remoteStream });
      } else {
        const newStream = new MediaStream([event.track]);
        set({ remoteStream: newStream });
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", { to: remoteUserId, candidate: event.candidate });
      }
    };

    let answer = null;
    if (callMode !== "draw" && incomingSignal) {
      await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal));
      const { iceCandidateQueue } = get();
      iceCandidateQueue.forEach(async (candidate) => {
        try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
      });
      set({ iceCandidateQueue: [] });

      answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
    }

    socket.emit("answer-call", { to: remoteUserId, signal: answer });
  },

  rejectCall: () => {
    const { remoteUserId } = get();
    const socket = useAuthStore.getState().socket;
    if (remoteUserId && socket) socket.emit("end-call", { to: remoteUserId });
    get().endCallUI();
  },

  endCallUI: () => {
    const { localStream, peerConnection } = get();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peerConnection) peerConnection.close();

    set({ 
      callState: "idle", callMode: null, remoteUserId: null, callerName: null,
      incomingSignal: null, localStream: null, remoteStream: null, peerConnection: null,
      iceCandidateQueue: [], isMicOn: true, isVideoOn: true, isScreenSharing: false, remoteIsScreenSharing: false,
    });
  },

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
    const { isScreenSharing, peerConnection, localStream, remoteUserId, callMode, isVideoOn } = get();
    const socket = useAuthStore.getState().socket;
    
    if (!isScreenSharing) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender) await sender.replaceTrack(screenTrack);

        if (socket && remoteUserId) {
          socket.emit("ice-candidate", { to: remoteUserId, candidate: { type: "CUSTOM_SIGNAL", action: "SCREEN_SHARE_ON" }});
        }

        const oldVideo = localStream.getVideoTracks()[0];
        if (oldVideo) localStream.removeTrack(oldVideo);
        localStream.addTrack(screenTrack);

        screenTrack.onended = () => {
          if (get().isScreenSharing) {
            get().toggleScreenShare();
          }
        };

        set({ isScreenSharing: true });
      } catch (err) { console.error("Screen sharing failed", err); }
    } else {
      try {
        let newVideoTrack;
        
        try {
          if (callMode === "video") {
            const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
            newVideoTrack = camStream.getVideoTracks()[0];
            newVideoTrack.enabled = isVideoOn;
          }
        } catch (camErr) {
          console.error("Failed to restore camera, falling back to dummy track", camErr);
        }

        if (!newVideoTrack) {
          const canvas = document.createElement("canvas");
          canvas.width = 2; 
          canvas.height = 2;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, 2, 2);
          newVideoTrack = canvas.captureStream(1).getVideoTracks()[0];
        }

        const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && newVideoTrack) await sender.replaceTrack(newVideoTrack);
        
        if (socket && remoteUserId) {
          socket.emit("ice-candidate", { to: remoteUserId, candidate: { type: "CUSTOM_SIGNAL", action: "SCREEN_SHARE_OFF" }});
        }

        const oldVideo = localStream.getVideoTracks()[0];
        if (oldVideo) { 
          oldVideo.onended = null; 
          oldVideo.stop(); 
          localStream.removeTrack(oldVideo); 
        }
        
        if (newVideoTrack) localStream.addTrack(newVideoTrack);

        set({ isScreenSharing: false });
      } catch (err) { 
        console.error("Failed to revert screen share fully", err);
        set({ isScreenSharing: false });
      }
    }
  }
}));