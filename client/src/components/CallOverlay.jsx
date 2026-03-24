import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import Whiteboard from './Whiteboard';
import { X, Phone, Video, Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp } from 'lucide-react';

const CallOverlay = () => {
  const { 
    callState, callMode, callerName, localStream, remoteStream, 
    acceptCall, rejectCall, isMicOn, isVideoOn, isScreenSharing, 
    toggleMic, toggleVideo, toggleScreenShare 
  } = useCallStore();
  
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream, callState]);

  if (callState === "idle") return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      
      {/* 1. Incoming Call UI */}
      {callState === "receiving" && (
        <div className="bg-base-100 p-8 rounded-2xl flex flex-col items-center shadow-2xl min-w-[300px]">
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
        <div className="bg-base-100 p-8 rounded-2xl flex flex-col items-center shadow-2xl min-w-[300px]">
          <h2 className="text-xl font-bold mb-1">Calling {callerName}...</h2>
          <p className="mb-6 text-base-content/70">Waiting for answer...</p>
          <button onClick={rejectCall} className="btn btn-error w-full text-white">Cancel</button>
        </div>
      )}

      {/* 3. Active UI */}
      {callState === "active" && (
        <div className="flex flex-col w-full h-[90vh] max-w-6xl mx-auto bg-base-100 rounded-2xl overflow-hidden shadow-2xl">
          
          {/* Header */}
          <div className="flex items-center justify-between p-4 bg-base-200/50 border-b border-base-300">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
              </span>
              <h2 className="font-semibold text-lg capitalize">
                {callMode} Session with {callerName}
              </h2>
            </div>
            {callMode === "draw" && (
              <button onClick={rejectCall} className="btn btn-sm btn-circle btn-ghost text-error">
                <X className="size-5" />
              </button>
            )}
          </div>

          {/* Main Area */}
          <div className="flex-1 p-4 bg-base-100 relative overflow-hidden flex">
            {callMode === "draw" ? (
              <Whiteboard />
            ) : (
              <div className="w-full h-full relative rounded-xl overflow-hidden bg-base-300 border border-base-200">
                {/* Remote Stream */}
                {callMode === "audio" ? (
                  <div className="w-full h-full flex items-center justify-center text-xl animate-pulse">
                    Audio Call Connected...
                  </div>
                ) : (
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                )}
                
                <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-md text-white text-sm">
                  {callerName}
                </div>
                
                {/* Local Stream (PIP) */}
                <div className="absolute bottom-6 right-6 w-32 md:w-48 aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-base-100">
                  {callMode === "audio" ? (
                    <div className="w-full h-full flex items-center justify-center text-sm text-base-content/50 bg-base-300">
                      You
                    </div>
                  ) : (
                    <video ref={localVideoRef} autoPlay playsInline muted className={`w-full h-full object-cover ${!isScreenSharing && "transform scale-x-[-1]"}`} />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Media Controls Footer */}
          {(callMode === "video" || callMode === "audio") && (
            <div className="p-4 bg-base-200/50 flex items-center justify-center gap-4 border-t border-base-300">
              <button 
                onClick={toggleMic} 
                className={`btn btn-circle ${isMicOn ? "btn-neutral" : "btn-error text-white"}`}
              >
                {isMicOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              </button>
              
              {callMode === "video" && (
                <>
                  <button 
                    onClick={toggleVideo} 
                    className={`btn btn-circle ${isVideoOn ? "btn-neutral" : "btn-error text-white"}`}
                  >
                    {isVideoOn ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />}
                  </button>

                  <button 
                    onClick={toggleScreenShare} 
                    className={`btn btn-circle ${isScreenSharing ? "btn-primary text-white" : "btn-neutral"}`}
                    title="Share Screen"
                  >
                    <MonitorUp className="size-5" />
                  </button>
                </>
              )}

              <button onClick={rejectCall} className="btn btn-error px-8 rounded-full text-white font-medium ml-4">
                End Call
              </button>
            </div>
          )}

        </div>
      )}
    </div>
  );
};

export default CallOverlay;