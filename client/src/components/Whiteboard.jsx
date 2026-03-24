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
    
    // Size it to its container
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;

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
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.closePath();

    if (!emit) return;
    socket.emit("draw", {
      to: remoteUserId,
      drawData: { x0, y0, x1, y1, color }
    });
  };

  // 🌟 Helper to get exact coordinates for BOTH Mouse and Touch
  const getCoordinates = (e) => {
    if (e.touches && e.touches.length > 0) {
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top
      };
    }
    return { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
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
      <div className="p-2 bg-base-200 text-center font-semibold text-sm">Shared Whiteboard</div>
      <div className="flex-1 cursor-crosshair">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseOut={stopDrawing}
          onTouchStart={startDrawing} // 📱 Touch Support
          onTouchMove={draw}          // 📱 Touch Support
          onTouchEnd={stopDrawing}    // 📱 Touch Support
          className="block w-full h-full touch-none"
        />
      </div>
    </div>
  );
};

export default Whiteboard;