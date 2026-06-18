import React, { useEffect, useRef } from 'react';

interface VisualizerCanvasProps {
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  mode?: "bars" | "line";
  playbackPercentage: number;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({ 
  audioElement, 
  isPlaying,
  mode = "bars",
  playbackPercentage
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const lastAudioElementRef = useRef<HTMLAudioElement | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    if (!audioElement) return;

    // We only create an audio context if it doesn't already exist.
    if (!audioContextRef.current) {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        audioContextRef.current = new AudioContext();
    }

    const audioCtx = audioContextRef.current;

    // Disconnect old source if audioElement changes
    if (lastAudioElementRef.current !== audioElement) {
      if (sourceRef.current) {
        try {
          sourceRef.current.disconnect();
        } catch (e) {}
        sourceRef.current = null;
      }
      lastAudioElementRef.current = audioElement;
    }

    // Attach media element source if not already attached
    if (!sourceRef.current && !(audioElement as any).__hasSource) {
      try {
        sourceRef.current = audioCtx.createMediaElementSource(audioElement);
        (audioElement as any).__hasSource = true;
      } catch (e) {
        console.warn('Media element source already created', e);
      }
    }

    if (!analyserRef.current && sourceRef.current) {
      analyserRef.current = audioCtx.createAnalyser();
      analyserRef.current.fftSize = 256; 
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioCtx.destination);
    }
    
    // Resume context if needed
    if (isPlaying && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const renderFrame = () => {
      if (!canvasRef.current || !analyserRef.current) return;
      
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserRef.current.getByteFrequencyData(dataArray);

      // Handle Retina / HiDPI screens
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const displayWidth = Math.max(1, rect.width);
      const displayHeight = Math.max(1, rect.height);

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }

      const width = canvas.width;
      const height = canvas.height;

      ctx.clearRect(0, 0, width, height);

      // We focus mainly on lower frequencies since speech happens there mostly
      // We'll limit to first half of bins to make visualization more active
      const usefulBins = Math.floor(bufferLength * 0.5);
      
      if (mode === "bars") {
        const numBars = 55;
        const barTotalWidth = width / numBars;
        const barWidth = Math.max(1, barTotalWidth - (2 * dpr)); 
        
        for (let i = 0; i < numBars; i++) {
          const binIndex = Math.floor((i / numBars) * usefulBins);
          const value = dataArray[binIndex] || 0;
          
          const percentVal = value / 255;
          // minimum height of 2px
          const barHeight = Math.max(2 * dpr, percentVal * height * 0.85); 
          
          const x = i * barTotalWidth + (barTotalWidth - barWidth) / 2;
          const y = height - barHeight;
          
          const playedThreshold = (playbackPercentage / 100) * numBars;
          
          if (i <= playedThreshold) {
            ctx.fillStyle = "#6366f1"; // indigo-500
            
            // Highlight current playhead region slightly lighter
            if (i >= playedThreshold - 1) {
              ctx.fillStyle = "#818cf8"; // indigo-400
            }
          } else {
            ctx.fillStyle = "#1e293b"; // slate-800
          }
          
          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [2 * dpr, 2 * dpr, 0, 0]);
          ctx.fill();
        }
      } else {
        // Line Mode
        ctx.beginPath();
        const numPoints = 80;
        
        for (let i = 0; i < numPoints; i++) {
            const binIndex = Math.floor((i / numPoints) * usefulBins);
            const value = dataArray[binIndex] || 0;
            const x = i * (width / numPoints);
            const rawH = (value / 255) * height * 0.85;
            const y = height - Math.max(4 * dpr, rawH);
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                // Smooth cubic bezier could be cool here, but simple lineTo is fine
                ctx.lineTo(x, y);
            }
        }
        
        // Define gradient depending on playback completion
        const gradX = (playbackPercentage / 100) * width;
        
        // Base stroke
        ctx.lineWidth = 3 * dpr;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        
        // Setup stroke gradient
        const strokeGradient = ctx.createLinearGradient(0, 0, width, 0);
        strokeGradient.addColorStop(Math.max(0, (gradX - 5) / width), "#6366f1"); // indigo-500
        strokeGradient.addColorStop(Math.min(1, gradX / width), "#334155"); // slate-700
        ctx.strokeStyle = strokeGradient;
        
        ctx.stroke();

        // Area under stroke
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        
        const fillGradient = ctx.createLinearGradient(0, 0, width, 0);
        fillGradient.addColorStop(Math.max(0, (gradX - 5) / width), "rgba(99, 102, 241, 0.15)");
        fillGradient.addColorStop(Math.min(1, gradX / width), "rgba(51, 65, 85, 0.05)");
        
        ctx.fillStyle = fillGradient;
        ctx.fill();
      }

      if (isPlaying) {
        requestRef.current = requestAnimationFrame(renderFrame);
      }
    };

    if (isPlaying) {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(renderFrame);
    } else {
       if (requestRef.current) cancelAnimationFrame(requestRef.current);
       renderFrame();
    }

    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [audioElement, isPlaying, mode, playbackPercentage]);

  return (
    <canvas 
      ref={canvasRef} 
      className="w-full h-full block absolute inset-x-8 bottom-3 top-8 pointer-events-none z-0"
    />
  );
};
