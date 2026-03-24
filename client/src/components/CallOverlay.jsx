import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import Whiteboard from './Whiteboard';
import { X, Phone, Video, Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp } from 'lucide-react';

const CallOverlay = () => {
  const { 
    callState, callMode, callerName, localStream, remoteStream, 
    acceptCall, rejectCall, isMicOn, isVideoOn, isScreenSharing, remoteIsScreenSharing,
    toggleMic, toggleVideo, toggleScreenShare 
  } = useCallStore();
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      // CRITICAL FIX: Explicitly call play(). Browsers sometimes pause media 
      // automatically if the <video> tag has opacity-0 or is hidden.
      remoteVideoRef.current.play().catch(e => console.warn("Audio autoplay blocked:", e));
    }
  }, [remoteStream, callState]);

  if (callState === "idle") return null;

  // Determine visibility states based on screenshare logic
  const showRemoteVideo = callMode === "video" || remoteIsScreenSharing;
  const showLocalVideo = (callMode === "video" && isVideoOn) || isScreenSharing;

  // Check if the browser supports screen capturing (Desktop = true, Mobile = false)
  const supportsScreenShare = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm sm:p-4">
      
      {/* 1. Incoming Call UI */}
      {callState === "receiving" && (
        <div className="bg-base-100 p-8 rounded-2xl flex flex-col items-center shadow-2xl w-[90%] max-w-sm">
          <div className="bg-primary/20 p-4 rounded-full mb-4 animate-pulse">
            {callMode === 'video' ? <Video size={32} className="text-primary"/> : <Phone size={32} className="text-primary" />}
          </div>
          <h2 className="text-xl font-bold mb-1">{callerName}</h2>
          <p className="mb-6 text-base-content/70">Incoming {callMode} call...</p>
          <div className="flex gap-4 w-full">
            <button onClick={rejectCall} className="btn btn-error flex-1 text-white">Decline</button>
            <button onClick={acceptCall} className="btn btn-success flex-1 text-white">Accept</button>
          </div>
        </div>
      )}

      {/* 2. Outgoing Call UI */}
      {callState === "calling" && (
        <div className="bg-base-100 p-8 rounded-2xl flex flex-col items-center shadow-2xl w-[90%] max-w-sm">
          <h2 className="text-xl font-bold mb-1">Calling {callerName}...</h2>
          <p className="mb-6 text-base-content/70">Waiting for answer...</p>
          <button onClick={rejectCall} className="btn btn-error w-full text-white">Cancel</button>
        </div>
      )}

      {/* 3. Active UI */}
      {callState === "active" && (
        <div className="flex flex-col w-full h-full sm:h-[90vh] max-w-6xl mx-auto bg-base-100 sm:rounded-2xl overflow-hidden shadow-2xl">
          
          <div className="flex items-center justify-between p-3 sm:p-4 bg-base-200/50 border-b border-base-300">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
              </span>
              <h2 className="font-semibold text-base sm:text-lg capitalize truncate max-w-[200px] sm:max-w-none">
                {remoteIsScreenSharing ? "Viewing Screen" : `${callMode} with ${callerName}`}
              </h2>
            </div>
            {callMode === "draw" && (
              <button onClick={rejectCall} className="btn btn-sm btn-circle btn-ghost text-error">
                <X className="size-5" />
              </button>
            )}
          </div>

          <div className="flex-1 sm:p-4 bg-base-100 relative overflow-hidden flex">
            {callMode === "draw" ? (
              <Whiteboard />
            ) : (
              <div className="w-full h-full relative sm:rounded-xl overflow-hidden bg-base-300 sm:border border-base-200">
                
                {/* Remote Stream Video */}
                <video 
                  ref={remoteVideoRef} 
                  autoPlay 
                  playsInline 
                  className={`w-full h-full object-cover ${!showRemoteVideo ? "opacity-0 absolute inset-0 pointer-events-none -z-10" : ""}`} 
                />

                {/* Audio-only Placeholder (Hides if screen sharing starts) */}
                {!showRemoteVideo && (
                  <div className="absolute inset-0 z-0 w-full h-full flex flex-col items-center justify-center animate-pulse gap-4 bg-base-300">
                     <div className="w-24 h-24 bg-primary/20 rounded-full flex items-center justify-center">
                        <Phone size={40} className="text-primary" />
                     </div>
                    <span className="text-lg font-medium">{callerName}</span>
                  </div>
                )}
                
                {showRemoteVideo && (
                  <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-md text-white text-xs sm:text-sm">
                    {callerName}
                  </div>
                )}
                
                {/* Local Stream (PIP) */}
                <div className="absolute bottom-4 right-4 sm:bottom-6 sm:right-6 w-24 sm:w-32 md:w-48 aspect-video bg-black rounded-lg sm:rounded-xl overflow-hidden shadow-2xl border-2 border-base-100 z-10">
                  
                  {/* Local Stream Video */}
                  <video 
                    ref={localVideoRef} 
                    autoPlay 
                    playsInline 
                    muted 
                    className={`w-full h-full object-cover ${!isScreenSharing && "transform scale-x-[-1]"} ${!showLocalVideo ? "opacity-0 absolute inset-0 pointer-events-none -z-10" : ""}`} 
                  />

                  {/* Camera-Off Placeholder */}
                  {!showLocalVideo && (
                    <div className="absolute inset-0 z-0 w-full h-full flex items-center justify-center text-xs sm:text-sm text-base-content/50 bg-base-300">
                      {callMode === "audio" ? "You" : <VideoOff className="size-6 opacity-60" />}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {(callMode === "video" || callMode === "audio") && (
            <div className="p-3 sm:p-4 bg-base-200/50 flex flex-wrap items-center justify-center gap-2 sm:gap-4 border-t border-base-300">
              
              {/* Mic Toggle (Always visible) */}
              <button onClick={toggleMic} className={`btn btn-circle btn-sm sm:btn-md ${isMicOn ? "btn-neutral" : "btn-error text-white"}`}>
                {isMicOn ? <Mic className="size-4 sm:size-5" /> : <MicOff className="size-4 sm:size-5" />}
              </button>
              
              {/* Video and Screen Share Toggles (ONLY visible for Video calls) */}
              {callMode === "video" && (
                <>
                  <button onClick={toggleVideo} className={`btn btn-circle btn-sm sm:btn-md ${isVideoOn ? "btn-neutral" : "btn-error text-white"}`}>
                    {isVideoOn ? <VideoIcon className="size-4 sm:size-5" /> : <VideoOff className="size-4 sm:size-5" />}
                  </button>

                  {/* ONLY show Screen Share if the browser actually supports it */}
                  {supportsScreenShare && (
                    <button onClick={toggleScreenShare} className={`btn btn-circle btn-sm sm:btn-md ${isScreenSharing ? "btn-primary text-white" : "btn-neutral"}`} title="Share Screen">
                      <MonitorUp className="size-4 sm:size-5" />
                    </button>
                  )}
                </>
              )}

              <button onClick={rejectCall} className="btn btn-error btn-sm sm:btn-md px-6 sm:px-8 rounded-full text-white font-medium ml-2 sm:ml-4">
                End
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallOverlay;