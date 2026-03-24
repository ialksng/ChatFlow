import React, { useRef, useState, useEffect } from 'react';
import { useAuthStore } from '../store/useAuthStore';
import { useCallStore } from '../store/useCallStore';

const Whiteboard = () => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [lastPos, setLastPos] = useState({ x: 0, y: 0 });
  const { socket } = useAuthStore();
  const { remoteUserId } = useCallStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // 1. FIXED INTERNAL RESOLUTION: Everyone uses a 1000x1000 coordinate map
    // regardless of their physical screen size.
    canvas.width = 1000;
    canvas.height = 1000;

    const onReceiveDraw = (data) => {
      const { x0, y0, x1, y1, color } = data;
      drawLine(ctx, x0, y0, x1, y1, color, false);
    };

    socket.on("receive-draw", onReceiveDraw);
    return () => socket.off("receive-draw", onReceiveDraw);
  }, [socket]);

  const drawLine = (ctx, x0, y0, x1, y1, color, emit) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = color;
    // Made the line slightly thicker since internal resolution is large
    ctx.lineWidth = 4; 
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.closePath();

    if (!emit) return;
    socket.emit("draw", {
      to: remoteUserId,
      drawData: { x0, y0, x1, y1, color }
    });
  };

  // 2. SCALED COORDINATES: Translate screen pixels to the 1000x1000 map
  const getCoordinates = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Find the scale difference between DOM size and internal resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if (e.touches && e.touches.length > 0) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY
      };
    }
    
    // For mouse events, nativeEvent offsets are most accurate
    return { 
      x: e.nativeEvent.offsetX * scaleX, 
      y: e.nativeEvent.offsetY * scaleY 
    };
  };

  const startDrawing = (e) => {
    setIsDrawing(true);
    setLastPos(getCoordinates(e));
  };

  const draw = (e) => {
    if (!isDrawing) return;
    const ctx = canvasRef.current.getContext('2d');
    const newPos = getCoordinates(e);
    
    drawLine(ctx, lastPos.x, lastPos.y, newPos.x, newPos.y, 'white', true);
    setLastPos(newPos);
  };

  const stopDrawing = () => setIsDrawing(false);

  return (
    <div className="w-full h-full bg-base-300 rounded-none sm:rounded-xl overflow-hidden shadow-lg border-0 sm:border border-base-100 flex flex-col">
      <div className="p-2 bg-base-200 text-center font-semibold text-sm flex-none">
        Shared Whiteboard
      </div>
      
      {/* Container centers the canvas */}
      <div className="flex-1 flex items-center justify-center p-2 sm:p-4 overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing} 
          onTouchMove={draw}          
          onTouchEnd={stopDrawing}    
          className="bg-black/50 shadow-xl touch-none cursor-crosshair sm:rounded-md border border-base-100"
          style={{
            // 3. FORCE SQUARE: Guarantees the canvas shapes never distort 
            // between landscape (PC) and portrait (Mobile) screens.
            aspectRatio: '1 / 1',
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      </div>
    </div>
  );
};

export default Whiteboard;