import React, { useEffect, useRef } from 'react';
import { useCallStore } from '../store/useCallStore';
import Whiteboard from './Whiteboard';
import { X, Phone, Video } from 'lucide-react';

const CallOverlay = () => {
  const { callState, callMode, callerName, localStream, remoteStream, acceptCall, rejectCall } = useCallStore();
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Attach WebRTC streams to video elements
  useEffect(() => {
    if (localVideoRef.current && localStream) localVideoRef.current.srcObject = localStream;
  }, [localStream, callState]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) remoteVideoRef.current.srcObject = remoteStream;
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

      {/* 3. Active UI (Video / Audio / Whiteboard) */}
      {callState === "active" && (
        <div className="flex flex-col w-full h-full max-w-6xl mx-auto">
          {/* Top Control Bar */}
          <div className="flex justify-between items-center mb-4 bg-base-100/50 p-4 rounded-xl">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Active {callMode} with {callerName}
            </h3>
            <button onClick={rejectCall} className="btn btn-error btn-circle">
              <X size={24} />
            </button>
          </div>

          {/* Active Work Area */}
          {callMode === "draw" ? (
            <div className="flex-1 w-full"><Whiteboard /></div>
          ) : (
            <div className="flex-1 flex gap-4 items-center justify-center relative">
              {/* Remote Stream */}
              <div className="w-full h-full bg-base-300 rounded-2xl overflow-hidden shadow-2xl relative border border-base-200">
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute bottom-4 left-4 bg-black/60 px-3 py-1 rounded-md text-white text-sm">
                  {callerName}
                </div>
              </div>
              
              {/* Local Stream */}
              <div className="absolute bottom-6 right-6 w-32 md:w-48 aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border-2 border-base-100">
                <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CallOverlay;