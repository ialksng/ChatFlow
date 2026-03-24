import { useEffect, useRef, useState } from "react";
import { X, Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp } from "lucide-react";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useCallStore } from "../store/useCallStore"; 

const CallRoom = () => {
  const { socket } = useAuthStore();
  const { selectedUser } = useChatStore();
  const { activeCallMode, endCall } = useCallStore();

  // Media state toggles
  const [isMicOn, setIsMicOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  // Refs for video and drawing
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const contextRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // ==========================================
  // 1. WHITEBOARD (CANVAS) LOGIC
  // ==========================================
  useEffect(() => {
    if (activeCallMode !== "draw" && activeCallMode !== "video") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    // Make canvas fill its container
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    
    const context = canvas.getContext("2d");
    context.lineCap = "round";
    context.strokeStyle = "#000000"; // Black ink
    context.lineWidth = 4;
    contextRef.current = context;

    // Listen for incoming drawing coordinates from the other user
    socket.on("receive-draw", (data) => {
      const { x, y, type } = data;
      if (type === "start") {
        contextRef.current.beginPath();
        contextRef.current.moveTo(x, y);
      } else if (type === "draw") {
        contextRef.current.lineTo(x, y);
        contextRef.current.stroke();
      } else if (type === "end") {
        contextRef.current.closePath();
      }
    });

    return () => socket.off("receive-draw");
  }, [socket, activeCallMode]);

  const startDrawing = ({ nativeEvent }) => {
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.beginPath();
    contextRef.current.moveTo(offsetX, offsetY);
    setIsDrawing(true);

    socket.emit("draw", {
      to: selectedUser._id,
      drawData: { x: offsetX, y: offsetY, type: "start" },
    });
  };

  const draw = ({ nativeEvent }) => {
    if (!isDrawing) return;
    const { offsetX, offsetY } = nativeEvent;
    contextRef.current.lineTo(offsetX, offsetY);
    contextRef.current.stroke();

    socket.emit("draw", {
      to: selectedUser._id,
      drawData: { x: offsetX, y: offsetY, type: "draw" },
    });
  };

  const stopDrawing = () => {
    contextRef.current.closePath();
    setIsDrawing(false);

    socket.emit("draw", {
      to: selectedUser._id,
      drawData: { type: "end" },
    });
  };

  // If no call is active, don't render the room
  if (!activeCallMode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-base-100 w-full max-w-6xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
        
        {/* HEADER */}
        <div className="flex items-center justify-between p-4 bg-base-200/50 border-b border-base-300">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-success"></span>
            </span>
            <h2 className="font-semibold text-lg">
              {activeCallMode === "draw" ? "Whiteboard Session" : "Active Call"} with {selectedUser?.fullName}
            </h2>
          </div>
          <button onClick={endCall} className="btn btn-sm btn-circle btn-ghost text-error">
            <X className="size-5" />
          </button>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex p-4 gap-4 relative">
          
          {/* WHITEBOARD AREA (Only visible if mode is 'draw' or 'video') */}
          {(activeCallMode === "draw" || activeCallMode === "video") && (
            <div className="flex-1 bg-white rounded-xl border border-base-300 overflow-hidden relative shadow-inner cursor-crosshair">
              <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="w-full h-full touch-none"
              />
            </div>
          )}

          {/* VIDEO STREAMS AREA */}
          {(activeCallMode === "video" || activeCallMode === "audio") && (
            <div className={`flex flex-col gap-4 ${activeCallMode === "video" ? "w-72" : "w-full items-center justify-center"}`}>
              
              {/* Remote User Video */}
              <div className="bg-base-300 w-full aspect-video rounded-xl overflow-hidden relative border border-base-content/10 shadow-lg flex items-center justify-center">
                {activeCallMode === "audio" ? (
                  <div className="text-xl animate-pulse">Audio Call...</div>
                ) : (
                  <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">
                  {selectedUser?.fullName}
                </div>
              </div>

              {/* Local User Video (Selfie Cam) */}
              <div className="bg-base-300 w-full aspect-video rounded-xl overflow-hidden relative border border-base-content/10 shadow-lg flex items-center justify-center">
                {activeCallMode === "audio" ? (
                  <div className="text-xl text-base-content/50">You</div>
                ) : (
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover transform scale-x-[-1]" />
                )}
                <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs text-white">You</div>
              </div>

            </div>
          )}
        </div>

        {/* CALL CONTROLS (Bottom Bar) */}
        <div className="p-4 bg-base-200/50 flex justify-center gap-4 border-t border-base-300">
          {(activeCallMode === "audio" || activeCallMode === "video") && (
            <>
              <button 
                onClick={() => setIsMicOn(!isMicOn)} 
                className={`btn btn-circle ${isMicOn ? "btn-neutral" : "btn-error"}`}
              >
                {isMicOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
              </button>
              
              {activeCallMode === "video" && (
                <button 
                  onClick={() => setIsVideoOn(!isVideoOn)} 
                  className={`btn btn-circle ${isVideoOn ? "btn-neutral" : "btn-error"}`}
                >
                  {isVideoOn ? <VideoIcon className="size-5" /> : <VideoOff className="size-5" />}
                </button>
              )}

              {/* Screen Share Button */}
              {activeCallMode === "video" && (
                <button 
                  onClick={() => setIsScreenSharing(!isScreenSharing)} 
                  className={`btn btn-circle ${isScreenSharing ? "btn-primary" : "btn-neutral"}`}
                >
                  <MonitorUp className="size-5" />
                </button>
              )}
            </>
          )}

          <button onClick={endCall} className="btn btn-error px-8 rounded-full">
            End Call
          </button>
        </div>

      </div>
    </div>
  );
};

export default CallRoom;