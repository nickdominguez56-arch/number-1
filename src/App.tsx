import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  FileAudio, 
  UploadCloud, 
  Sparkles, 
  Download, 
  Play, 
  Pause, 
  Search, 
  CheckSquare, 
  RefreshCw, 
  FileText, 
  Check, 
  Volume2, 
  Clock, 
  Tag, 
  ArrowRight,
  Bookmark,
  Share2,
  ListRestart,
  BarChart2,
  Activity,
  Minimize2,
  Maximize2,
  Navigation,
  Copy,
  Hash
} from "lucide-react";
import { SAMPLE_TRANSCRIPT, SAMPLE_AUDIO_BASE64 } from "./sampleData";
import { TranscriptSegment, TranscriptionResult } from "./types";
import { VisualizerCanvas } from "./components/VisualizerCanvas";

export type HighlightColor = "yellow" | "green" | "pink";

export interface TextHighlight {
  id: string;
  sessionId: string;
  originalIndex: number;
  start: number;
  end: number;
  text: string;
  color: HighlightColor;
}

// Simulated amplitude wave frequencies for Geometric Waveform visualization (55 items)
const WAVEFORM_BARS = [
  12, 22, 42, 32, 58, 18, 38, 72, 52, 28, 48, 44, 18, 32, 68, 48, 28, 44, 78, 32,
  48, 52, 18, 32, 64, 48, 22, 38, 58, 12, 28, 52, 38, 22, 42, 68, 32, 38, 22, 12,
  32, 52, 42, 58, 22, 28, 48, 32, 18, 12, 28, 44, 22, 38, 52
];

export default function App() {
  // Application state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState("");
  const [result, setResult] = useState<TranscriptionResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Audio Player states
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [detectSpeakers, setDetectSpeakers] = useState(true);
  const [processingEngine, setProcessingEngine] = useState("gemini");

  // Completed Action Items Trackers
  const [completedActions, setCompletedActions] = useState<Record<number, boolean>>({});

  // Speaker interactive visualization states
  const [hoveredSegmentIndex, setHoveredSegmentIndex] = useState<number | null>(null);
  const [isolatedSpeaker, setIsolatedSpeaker] = useState<string | null>(null);

  // Speaker name editing states
  const [editingSpeakerName, setEditingSpeakerName] = useState<string | null>(null);
  const [currSpeakerValue, setCurrSpeakerValue] = useState("");

  // Custom speaker color map state
  const [customSpeakerColors, setCustomSpeakerColors] = useState<Record<string, string>>({});

  // Visualizer display mode state: "bars" (traditional waveform bars) or "line" (minimalist frequency line graph)
  const [visualizerMode, setVisualizerMode] = useState<"bars" | "line">("bars");

  // Focus Mode state (full-screen clean reading view)
  const [focusMode, setFocusMode] = useState(false);

  // Sync scroll state for automatically tracking currently playing segment
  const [syncScroll, setSyncScroll] = useState(true);

  // Segment copy success feedback tracker ID
  const [copiedSegmentId, setCopiedSegmentId] = useState<number | null>(null);

  // HTML5 audio state for reactive Web Audio API canvas visualizer binding
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Persistent bookmark array of objects containing saved quotes
  const [bookmarks, setBookmarks] = useState<Array<{
    sessionId: string;
    originalIndex: number;
    speaker: string;
    startTime: string;
    text: string;
  }>>(() => {
    try {
      const stored = localStorage.getItem("audioscribe_bookmarks");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Automatically persist bookmarks on changes
  useEffect(() => {
    try {
      localStorage.setItem("audioscribe_bookmarks", JSON.stringify(bookmarks));
    } catch (e) {
      console.error("Failed to persist transcript bookmarks:", e);
    }
  }, [bookmarks]);

  const [highlights, setHighlights] = useState<TextHighlight[]>(() => {
    try {
      const stored = localStorage.getItem("audioscribe_highlights");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem("audioscribe_highlights", JSON.stringify(highlights));
    } catch (e) {
      console.error("Failed to persist transcript highlights:", e);
    }
  }, [highlights]);

  interface ActiveSelection {
    segmentIndex: number;
    start: number;
    end: number;
    text: string;
    rect: DOMRect;
  }
  const [activeSelection, setActiveSelection] = useState<ActiveSelection | null>(null);

  const handleTranscriptMouseUp = (e: React.MouseEvent) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !activeSessionId) {
      if (activeSelection) setActiveSelection(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const containerElement = range.commonAncestorContainer.parentElement?.closest('[data-segment-index]');
    if (!containerElement) {
      if (activeSelection) setActiveSelection(null);
      return;
    }

    const segmentIndex = parseInt(containerElement.getAttribute('data-segment-index') || '-1', 10);
    if (segmentIndex === -1) {
      if (activeSelection) setActiveSelection(null);
      return;
    }

    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(containerElement);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;
    const end = start + range.toString().length;
    
    const text = range.toString().trim();
    if (!text) {
      if (activeSelection) setActiveSelection(null);
      return;
    }

    const rect = range.getBoundingClientRect();

    setActiveSelection({
      segmentIndex,
      start,
      end,
      text,
      rect
    });
  };

  const addHighlight = (color: HighlightColor) => {
    if (!activeSelection || !activeSessionId) return;
    
    const newHighlight: TextHighlight = {
      id: Math.random().toString(36).substr(2, 9),
      sessionId: activeSessionId,
      originalIndex: activeSelection.segmentIndex,
      start: activeSelection.start,
      end: activeSelection.end,
      text: activeSelection.text,
      color,
    };

    setHighlights(prev => [...prev, newHighlight]);
    setActiveSelection(null);
    window.getSelection()?.removeAllRanges();
  };

  const removeHighlight = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // prevent seek
    setHighlights(prev => prev.filter(h => h.id !== id));
  };

  const fallbackCopyText = (text: string, id: number) => {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
      setCopiedSegmentId(id);
      setTimeout(() => {
        setCopiedSegmentId(null);
      }, 2000);
    } catch (err) {
      console.error("Fallback copy failed", err);
    }
    document.body.removeChild(textArea);
  };

  const handleCopySegment = (text: string, id: number) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopiedSegmentId(id);
          setTimeout(() => {
            setCopiedSegmentId(null);
          }, 2000);
        }).catch(() => {
          fallbackCopyText(text, id);
        });
      } else {
        fallbackCopyText(text, id);
      }
    } catch (e) {
      fallbackCopyText(text, id);
    }
  };

  const toggleBookmark = (originalIdx: number, speaker: string, startTime: string, text: string) => {
    if (!activeSessionId) return;
    
    setBookmarks((prev) => {
      const exists = prev.find(
        (b) => b.sessionId === activeSessionId && b.originalIndex === originalIdx
      );
      
      if (exists) {
        return prev.filter(
          (b) => !(b.sessionId === activeSessionId && b.originalIndex === originalIdx)
        );
      } else {
        return [
          ...prev,
          {
            sessionId: activeSessionId,
            originalIndex: originalIdx,
            speaker,
            startTime,
            text,
          },
        ];
      }
    });
  };

  const transcriptionProgressPercent = useMemo(() => {
    switch (transcriptionProgress) {
      case "Initializing file buffers...":
        return 15;
      case "Sending binary stream to AI model pipelines...":
        return 35;
      case "De-noising lossless multi-channel vocal tracks...":
        return 55;
      case "Segmenting dialogues and projecting timeline vectors...":
        return 75;
      case "Synthesizing context, drawing action items, and structural parsing...":
        return 92;
      case "Transcription completed successfully":
        return 100;
      default:
        if (transcriptionProgress.includes("Initializing")) return 15;
        if (transcriptionProgress.includes("Sending")) return 35;
        if (transcriptionProgress.includes("De-noising")) return 55;
        if (transcriptionProgress.includes("Segmenting")) return 75;
        if (transcriptionProgress.includes("Synthesizing")) return 92;
        if (transcriptionProgress.includes("comple")) return 100;
        return 5;
    }
  }, [transcriptionProgress]);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);

  // Conversion of timestamp (MM:SS or HH:MM:SS) to raw seconds
  const parseTimeToSeconds = (timeStr: string): number => {
    const parts = timeStr.trim().split(":").map(Number);
    if (parts.length === 3) {
      if (parts.some(isNaN)) return 0;
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      if (parts.some(isNaN)) return 0;
      return parts[0] * 60 + parts[1];
    }
    const parsed = Number(timeStr);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Convert raw seconds back to display String (MM:SS)
  const formatSecondsToDisplay = (secs: number): string => {
    if (isNaN(secs) || secs < 0) return "00:00";
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  interface SessionItem {
    id: string;
    name: string;
    size: number;
    file: File;
    fileUrl: string;
    status: "queued" | "processing" | "completed" | "failed";
    progress: string;
    result: TranscriptionResult | null;
    error?: string;
    isDemo?: boolean;
  }

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  // Sync active session attributes to standard state variables for bulletproof backwards-compatibility
  useEffect(() => {
    const active = sessions.find((s) => s.id === activeSessionId) || null;
    if (active) {
      setSelectedFile(active.file);
      setFileUrl(active.fileUrl);
      setResult(active.result);
      setTranscribing(active.status === "processing");
      setTranscriptionProgress(active.progress);
      setErrorMessage(active.error || null);
      setIsDemoMode(!!active.isDemo);
    } else {
      setSelectedFile(null);
      setFileUrl(null);
      setResult(null);
      setTranscribing(false);
      setTranscriptionProgress("");
      setErrorMessage(null);
      setIsDemoMode(false);
    }
  }, [activeSessionId, sessions]);

  // Sequential Background Transcription Queue Engine
  useEffect(() => {
    // Check if there are any sessions in progress
    const isAnyProcessing = sessions.some((s) => s.status === "processing");
    if (isAnyProcessing) return;

    // Retrieve the next queued file sequence
    const nextQueuedSession = sessions.find((s) => s.status === "queued");
    if (!nextQueuedSession) return;

    const runSeqTranscription = async (target: SessionItem) => {
      // Transition to processing
      setSessions((prev) =>
        prev.map((s) =>
          s.id === target.id
            ? { ...s, status: "processing", progress: "Initializing file buffers..." }
            : s
        )
      );

      try {
        const fileReader = new FileReader();
        const loadPromise = new Promise<string>((resolve, reject) => {
          fileReader.onload = () => {
            if (typeof fileReader.result === "string") {
              const base64Data = fileReader.result.split(",")[1] || fileReader.result;
              resolve(base64Data);
            } else {
              reject(new Error("Unable to read audio file into Base64 layout."));
            }
          };
          fileReader.onerror = () => reject(fileReader.error);
          fileReader.readAsDataURL(target.file);
        });

        const base64Content = await loadPromise;

        const updateProg = (text: string) => {
          setSessions((prev) =>
            prev.map((s) =>
              s.id === target.id ? { ...s, progress: text } : s
            )
          );
        };

        updateProg("Sending binary stream to AI model pipelines...");
        const timer1 = setTimeout(() => {
          updateProg("De-noising lossless multi-channel vocal tracks...");
        }, 3500);
        const timer2 = setTimeout(() => {
          updateProg("Segmenting dialogues and projecting timeline vectors...");
        }, 7000);
        const timer3 = setTimeout(() => {
          updateProg("Synthesizing context, drawing action items, and structural parsing...");
        }, 11000);

        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            fileName: target.name,
            fileBase64: base64Content,
            fileSize: target.size,
            detectSpeakers,
            processingEngine,
          }),
        });

        clearTimeout(timer1);
        clearTimeout(timer2);
        clearTimeout(timer3);

        if (!response.ok) {
          let errorData = { error: `Server responded with error status ${response.status}` };
          try {
            errorData = await response.json();
          } catch (e) {
            // Ignore JSON parse error, use default status error
          }
          throw new Error(errorData.error || `Server responded with error status ${response.status}`);
        }

        const transcriptionData: TranscriptionResult = await response.json();

        setSessions((prev) =>
          prev.map((s) =>
            s.id === target.id
              ? {
                  ...s,
                  status: "completed",
                  progress: "Transcription completed successfully",
                  result: transcriptionData,
                }
              : s
          )
        );
      } catch (err: any) {
        console.error(err);
        const errMsg = err.message || "Something went wrong during FLAC audio transcription processing.";
        setSessions((prev) =>
          prev.map((s) =>
            s.id === target.id
              ? {
                  ...s,
                  status: "failed",
                  progress: "Failed",
                  error: errMsg,
                }
              : s
          )
        );
      }
    };

    runSeqTranscription(nextQueuedSession);
  }, [sessions, detectSpeakers, processingEngine]);

  // Clean local file state triggers
  const resetFileState = () => {
    sessions.forEach((s) => {
      if (s.fileUrl && !s.isDemo) {
        URL.revokeObjectURL(s.fileUrl);
      }
    });

    setSessions([]);
    setActiveSessionId(null);
    setSelectedFile(null);
    setFileUrl(null);
    setResult(null);
    setSearchQuery("");
    setSelectedTopic(null);
    setErrorMessage(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setIsDemoMode(false);
    setCompletedActions({});
    setHoveredSegmentIndex(null);
    setIsolatedSpeaker(null);
    setEditingSpeakerName(null);
    setCurrSpeakerValue("");
    setCustomSpeakerColors({});
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  // Trigger Native file chooser Dialog
  const triggerFileDialog = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Refactored file processor helper to manage numerous simultaneous selections
  const handleMultipleFilesProcess = (files: File[]) => {
    const flacFiles = files.filter((f) => f.name.toLowerCase().endsWith(".flac"));
    
    if (flacFiles.length === 0) {
      setErrorMessage("Only .flac audio formats are supported by this application.");
      return;
    }

    setErrorMessage(null);

    const newSessions: SessionItem[] = flacFiles.map((file) => {
      const localUrl = URL.createObjectURL(file);
      return {
        id: Math.random().toString(36).substring(7) + "_" + Date.now(),
        name: file.name,
        size: file.size,
        file: file,
        fileUrl: localUrl,
        status: "queued",
        progress: "Queued in pipeline...",
        result: null,
      };
    });

    setSessions((prev) => [...prev, ...newSessions]);
    
    // Auto-select the first of the newly added sessions
    setActiveSessionId(newSessions[0].id);
  };

  // File system drop events
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files) as File[];
      handleMultipleFilesProcess(filesArray);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      handleMultipleFilesProcess(filesArray);
    }
  };

  // Load interactive high-fidelity Demo Mode
  const handleLoadDemo = () => {
    const demoSessionId = "demo";
    const existingDemo = sessions.find((s) => s.id === demoSessionId);
    if (!existingDemo) {
      const rawBinary = atob(SAMPLE_AUDIO_BASE64);
      const bytes = new Uint8Array(rawBinary.length);
      for (let i = 0; i < rawBinary.length; i++) {
        bytes[i] = rawBinary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: "audio/wav" });
      const localUrl = URL.createObjectURL(blob);

      const demoSession: SessionItem = {
        id: demoSessionId,
        name: "roadmap_sync_session_02.flac",
        size: blob.size,
        file: new File([], "demo_meeting_audio.flac", { type: "audio/flac" }),
        fileUrl: localUrl,
        status: "completed",
        progress: "Demo session ready",
        result: SAMPLE_TRANSCRIPT,
        isDemo: true,
      };

      setSessions((prev) => [demoSession, ...prev]);
    }
    
    setActiveSessionId(demoSessionId);
    // Auto populate actions completed for interactive touch elements
    setCompletedActions({ 0: false, 1: true, 2: false, 3: false });
  };

  // Perform full-stack transcription request using local FLAC and Gemini
  const handleTranscribeRequest = async () => {
    if (!selectedFile || isDemoMode) return;
    setTranscribing(true);
    setErrorMessage(null);

    try {
      setTranscriptionProgress("Initializing file buffers...");
      
      const fileReader = new FileReader();
      const loadPromise = new Promise<string>((resolve, reject) => {
        fileReader.onload = () => {
          if (typeof fileReader.result === "string") {
            // strip out prefix if present (e.g. "data:audio/flac;base64,")
            const base64Data = fileReader.result.split(",")[1] || fileReader.result;
            resolve(base64Data);
          } else {
            reject(new Error("Unable to read audio file into Base64 layout."));
          }
        };
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsDataURL(selectedFile);
      });

      const base64Content = await loadPromise;
      
      setTranscriptionProgress("Sending binary stream to AI model pipelines...");
      const stageTimer1 = setTimeout(() => {
        setTranscriptionProgress("De-noising lossless multi-channel vocal tracks...");
      }, 3500);
      const stageTimer2 = setTimeout(() => {
        setTranscriptionProgress("Segmenting dialogues and projecting timeline vectors...");
      }, 7300);
      const stageTimer3 = setTimeout(() => {
        setTranscriptionProgress("Synthesizing context, drawing action items, and structural parsing...");
      }, 11500);

      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fileName: selectedFile.name,
          fileBase64: base64Content,
          fileSize: selectedFile.size,
          detectSpeakers,
          processingEngine,
        }),
      });

      clearTimeout(stageTimer1);
      clearTimeout(stageTimer2);
      clearTimeout(stageTimer3);

      if (!response.ok) {
        let errorData = { error: `Server responded with error status ${response.status}` };
        try {
          errorData = await response.json();
        } catch (e) {
          // Ignore JSON parse error
        }
        throw new Error(errorData.error || `Server responded with error status ${response.status}`);
      }

      const transcriptionData: TranscriptionResult = await response.json();
      setResult(transcriptionData);

    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Something went wrong during FLAC audio transcription processing.");
    } finally {
      setTranscribing(false);
    }
  };

  // Audio Player Event handlers
  const handlePlayPauseToggle = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => {
        console.error("Audio playback error:", err);
      });
    }
  };

  const handleAudioTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleAudioLoadedMetadata = () => {
    if (audioRef.current) {
      if (isDemoMode) {
        setDuration(125); // 2:05 minutes matching mock transcript segments
      } else {
        setDuration(audioRef.current.duration || 0);
      }
    }
  };

  const handleAudioSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (audioRef.current) {
      if (isDemoMode) {
        setCurrentTime(value);
      } else {
        audioRef.current.currentTime = value;
        setCurrentTime(value);
      }
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Seek audio directly to specific segment start point
  const handleSeekToSegment = (startTimeStr: string) => {
    const seconds = parseTimeToSeconds(startTimeStr);
    if (audioRef.current) {
      if (isDemoMode) {
        setCurrentTime(seconds);
      } else {
        audioRef.current.currentTime = seconds;
      }
      setIsPlaying(true);
      audioRef.current.play().catch(() => {});
    }
  };

  // Interactively scrub via Visual Waveform clicking
  const handleWaveformScrub = (barIndex: number) => {
    if (!duration) return;
    const targetSeconds = (barIndex / WAVEFORM_BARS.length) * duration;
    if (audioRef.current) {
      if (isDemoMode) {
        setCurrentTime(targetSeconds);
      } else {
        audioRef.current.currentTime = targetSeconds;
      }
      setIsPlaying(true);
      audioRef.current.play().catch(() => {});
    }
  };

  // Extract all unique speakers dynamically
  const uniqueSpeakers = useMemo(() => {
    if (!result || !result.segments) return [];
    return Array.from(new Set(result.segments.map((s) => s.speaker)));
  }, [result]);

  // Update speaker name globally throughout the entire transcript
  const handleUpdateSpeakerName = (oldName: string, newName: string) => {
    if (!result || !result.segments) return;
    const sanitizedNewName = newName.trim();
    if (!sanitizedNewName || sanitizedNewName === oldName) return;

    const updatedSegments = result.segments.map((seg) => {
      if (seg.speaker === oldName) {
        return { ...seg, speaker: sanitizedNewName };
      }
      return seg;
    });

    setResult({
      ...result,
      segments: updatedSegments,
    });

    // Also update any isolated speaker filter
    if (isolatedSpeaker === oldName) {
      setIsolatedSpeaker(sanitizedNewName);
    }

    // Migrate any custom speaker color mapping
    if (customSpeakerColors[oldName]) {
      setCustomSpeakerColors((prev) => {
        const updated = { ...prev };
        updated[sanitizedNewName] = updated[oldName];
        delete updated[oldName];
        return updated;
      });
    }
  };

  // Modern tech-accented speaker color palette map helper
  const getSpeakerColor = (speaker: string, uniqueList: string[]) => {
    const palette = [
      { text: "text-indigo-400", bg: "bg-indigo-500", border: "border-indigo-500/30", fill: "indigo-500", rawHex: "#6366F1", softBg: "bg-indigo-500/10", glow: "shadow-[0_0_8px_rgba(99,102,241,0.4)]" },
      { text: "text-emerald-400", bg: "bg-emerald-500", border: "border-emerald-500/30", fill: "emerald-500", rawHex: "#10B981", softBg: "bg-emerald-500/10", glow: "shadow-[0_0_8px_rgba(16,185,129,0.4)]" },
      { text: "text-amber-400", bg: "bg-amber-500", border: "border-amber-500/30", fill: "amber-500", rawHex: "#F59E0B", softBg: "bg-amber-500/10", glow: "shadow-[0_0_8px_rgba(245,158,11,0.4)]" },
      { text: "text-rose-400", bg: "bg-rose-500", border: "border-rose-500/30", fill: "rose-500", rawHex: "#F43F5E", softBg: "bg-rose-500/10", glow: "shadow-[0_0_8px_rgba(244,63,94,0.4)]" },
      { text: "text-cyan-400", bg: "bg-cyan-500", border: "border-cyan-500/30", fill: "cyan-500", rawHex: "#06B6D4", softBg: "bg-cyan-500/10", glow: "shadow-[0_0_8px_rgba(6,182,212,0.4)]" },
    ];
    const idx = uniqueList.indexOf(speaker);
    const defaultVal = palette[idx === -1 ? 0 : idx % palette.length];

    const customHex = customSpeakerColors[speaker];
    if (customHex) {
      const hexToRgba = (hex: string, alpha: number) => {
        const cleaned = hex.startsWith("#") ? hex.slice(1) : hex;
        const r = parseInt(cleaned.slice(0, 2), 16);
        const g = parseInt(cleaned.slice(2, 4), 16);
        const b = parseInt(cleaned.slice(4, 6), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
          return `rgba(99, 102, 241, ${alpha})`;
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };

      const softBgColor = hexToRgba(customHex, 0.1);
      const borderColor = hexToRgba(customHex, 0.3);
      const glowShadow = `0 0 8px ${hexToRgba(customHex, 0.4)}`;

      return {
        isCustom: true,
        rawHex: customHex,
        textStyle: { color: customHex },
        bgStyle: { backgroundColor: customHex },
        borderStyle: { borderColor: borderColor },
        softBgStyle: { backgroundColor: softBgColor },
        glowStyle: { boxShadow: glowShadow },
        text: "",
        bg: "",
        border: "",
        softBg: "",
        glow: ""
      };
    }

    return {
      isCustom: false,
      rawHex: defaultVal.rawHex,
      textStyle: {},
      bgStyle: {},
      borderStyle: {},
      softBgStyle: {},
      glowStyle: {},
      text: defaultVal.text,
      bg: defaultVal.bg,
      border: defaultVal.border,
      softBg: defaultVal.softBg,
      glow: defaultVal.glow
    };
  };

  // Calculate dynamic airtime shares per speaker
  const speakerAirtimeStats = useMemo(() => {
    if (!result || !result.segments) return [];
    const durations: Record<string, number> = {};
    let totalDurSec = 0;

    result.segments.forEach((seg) => {
      const startSec = parseTimeToSeconds(seg.startTime);
      let endSec = parseTimeToSeconds(seg.endTime);
      if (endSec <= startSec) endSec = startSec + 5; // fallback
      const diff = endSec - startSec;
      durations[seg.speaker] = (durations[seg.speaker] || 0) + diff;
      totalDurSec += diff;
    });

    return uniqueSpeakers.map((speaker) => {
      const spkrDur = durations[speaker] || 0;
      const pct = totalDurSec > 0 ? (spkrDur / totalDurSec) * 100 : 0;
      return {
        speaker,
        duration: spkrDur,
        percentage: Math.round(pct),
      };
    });
  }, [result, uniqueSpeakers]);

  // Subdivided ruler ticks across total duration for visual precision
  const rulerTicks = useMemo(() => {
    if (!duration) return [];
    const ticks = [];
    const count = 5;
    const interval = duration / (count - 1);
    for (let i = 0; i < count; i++) {
      ticks.push(i * interval);
    }
    return ticks;
  }, [duration]);

  // Detect which segment is currently active based on playback timeline
  const activeSegmentIndex = useMemo(() => {
    if (!result || !result.segments) return -1;
    
    // Find matching segment
    return result.segments.findIndex((seg, idx) => {
      const startSec = parseTimeToSeconds(seg.startTime);
      
      let endSec = parseTimeToSeconds(seg.endTime);
      if (endSec <= startSec && idx < result.segments.length - 1) {
        endSec = parseTimeToSeconds(result.segments[idx + 1].startTime);
      } else if (endSec <= startSec) {
        endSec = startSec + 120; // fallback duration buffer
      }
      
      return currentTime >= startSec && currentTime < endSec;
    });
  }, [result, currentTime]);

  // Scroll active segment into view dynamically
  useEffect(() => {
    if (syncScroll && activeSegmentRef.current) {
      activeSegmentRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeSegmentIndex, syncScroll]);

  // Re-sync rate multiplier
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [fileUrl, playbackSpeed]);

  // Dynamic extraction of top keywords from current transcription result
  const topKeywords = useMemo(() => {
    if (!result || !result.segments) return [];
    
    // Define comprehensive stop words to ignore in keyword frequency
    const stopWords = new Set([
      "the", "and", "that", "this", "with", "have", "from", "your", "then", "their",
      "they", "will", "would", "here", "there", "about", "what", "when", "where",
      "some", "them", "than", "were", "been", "came", "make", "many", "more", "much",
      "must", "only", "other", "over", "such", "into", "even", "also", "most", "like",
      "just", "know", "think", "good", "well", "want", "look", "back", "come", "could",
      "should", "these", "those", "because", "very", "about", "people", "said", "down",
      "there", "then", "gonna", "really", "want", "yeah", "okay", "your", "that's"
    ]);

    const counts: Record<string, number> = {};

    result.segments.forEach((seg) => {
      // Split words, clean punctuation, and process
      const words = seg.text.toLowerCase().split(/\s+/);
      words.forEach((w) => {
        // Strip out trailing or leading non-alphanumeric punctuation marks
        const clean = w.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, "").trim();
        if (clean.length >= 4 && !stopWords.has(clean) && !/^\d+$/.test(clean)) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      });
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // Sort desc by frequency
      .slice(0, 10)                 // Pick top 10 keywords
      .map(([word, count]) => ({ word, count }));
  }, [result]);

  // Filters segments based on searching, selected topic filters or clicked keywords
  const filteredSegments = useMemo(() => {
    if (!result) return [];
    return result.segments.filter((seg) => {
      const matchesSearch = searchQuery 
        ? seg.text.toLowerCase().includes(searchQuery.toLowerCase()) || 
          seg.speaker.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      
      const matchesTopic = selectedTopic
        ? seg.text.toLowerCase().includes(selectedTopic.toLowerCase())
        : true;

      const matchesKeyword = selectedKeyword
        ? seg.text.toLowerCase().includes(selectedKeyword.toLowerCase())
        : true;
      
      return matchesSearch && matchesTopic && matchesKeyword;
    });
  }, [result, searchQuery, selectedTopic, selectedKeyword]);

  // Toggle checklist checkbox items
  const toggleActionItem = (index: number) => {
    setCompletedActions(prev => ({ ...prev, [index]: !prev[index] }));
  };

  // Calculate current playback percentage for waveform tracking
  const playbackPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  // --- Export download files functions ---
  const handleExportText = () => {
    if (!result) return;
    let content = `TRANSCRIPTION REPORT\n====================\n\nTitle: ${result.title}\nSummary: ${result.summary}\n\n`;
    
    content += "KEY TOPICS DISCUSSED:\n";
    result.keyTopics.forEach(topic => content += `- ${topic}\n`);
    
    content += "\nACTION ITEMS:\n";
    result.actionItems.forEach(item => content += `[ ] ${item}\n`);
    
    content += "\nVERBATIM TRANSCRIPT:\n\n";
    result.segments.forEach(seg => {
      content += `[${seg.startTime} - ${seg.endTime}] ${seg.speaker}:\n${seg.text}\n\n`;
    });

    downloadBlob(content, "text/plain", `${result.title.replace(/\s+/g, "_")}_transcript.txt`);
  };

  const handleExportSRT = () => {
    if (!result) return;
    
    const convertToSrtTime = (timeStr: string): string => {
      const secondsTotal = parseTimeToSeconds(timeStr);
      const hrs = Math.floor(secondsTotal / 3600);
      const mins = Math.floor((secondsTotal % 3600) / 60);
      const secs = Math.floor(secondsTotal % 60);
      const ms = Math.floor((secondsTotal % 1) * 1000);
      
      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
    };

    let srtText = "";
    result.segments.forEach((seg, idx) => {
      srtText += `${idx + 1}\n`;
      srtText += `${convertToSrtTime(seg.startTime)} --> ${convertToSrtTime(seg.endTime)}\n`;
      srtText += `[${seg.speaker}] ${seg.text}\n\n`;
    });

    downloadBlob(srtText, "text/srt", `${result.title.replace(/\s+/g, "_")}_transcript.srt`);
  };

  const handleExportWebVTT = () => {
    if (!result) return;

    const convertToVttTime = (timeStr: string): string => {
      const secondsTotal = parseTimeToSeconds(timeStr);
      const hrs = Math.floor(secondsTotal / 3600);
      const mins = Math.floor((secondsTotal % 3600) / 60);
      const secs = Math.floor(secondsTotal % 60);
      const ms = Math.floor((secondsTotal % 1) * 1000);

      return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
    };

    let vttText = "WEBVTT\n\n";
    result.segments.forEach((seg, idx) => {
      vttText += `${idx + 1}\n`;
      vttText += `${convertToVttTime(seg.startTime)} --> ${convertToVttTime(seg.endTime)}\n`;
      vttText += `<v ${seg.speaker}> ${seg.text}\n\n`;
    });

    downloadBlob(vttText, "text/vtt", `${result.title.replace(/\s+/g, "_")}_transcript.vtt`);
  };

  const handleExportJSON = () => {
    if (!result) return;
    const jsonStr = JSON.stringify(result, null, 2);
    downloadBlob(jsonStr, "application/json", `${result.title.replace(/\s+/g, "_")}_transcript.json`);
  };

  const handleExportCSV = () => {
    if (!result) return;
    let csvContent = "\uFEFFSpeaker,Start Time,End Time,Verbatim Dialogue\n";
    result.segments.forEach((seg) => {
      const escapedText = seg.text.replace(/"/g, '""');
      const escapedSpeaker = seg.speaker.replace(/"/g, '""');
      csvContent += `"${escapedSpeaker}","${seg.startTime}","${seg.endTime}","${escapedText}"\n`;
    });
    downloadBlob(csvContent, "text/csv", `${result.title.replace(/\s+/g, "_")}_transcript.csv`);
  };

  const downloadBlob = (content: string, mimeType: string, filename: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-screen bg-[#0A0B0E] text-slate-300 font-sans flex flex-col overflow-hidden selection:bg-indigo-600/30 selection:text-white antialiased">
      {/* Hidden HTML5 Audio Component */}
      {fileUrl && (
        <audio
          ref={(el) => {
            (audioRef as any).current = el;
            if (el !== audioElement) {
              setAudioElement(el);
            }
          }}
          src={fileUrl}
          onTimeUpdate={handleAudioTimeUpdate}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="hidden"
        />
      )}

      {/* Top Navigation - Geometric Balance Theme */}
      <header className="h-16 flex items-center justify-between px-8 bg-[#0F1117] border-b border-slate-800 flex-shrink-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-sm flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"></path>
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-wider text-white uppercase sm:text-base">
            AudioScribe <span className="font-light opacity-50">STUDIO</span>
          </span>
        </div>

        <div className="flex items-center gap-6">
          <nav className="hidden md:flex gap-8 text-xs font-medium uppercase tracking-widest">
            <button 
              onClick={handleLoadDemo}
              className={`transition-colors cursor-pointer ${isDemoMode ? "text-indigo-400 font-semibold" : "text-slate-400 hover:text-white"}`}
            >
              Interactive Demo
            </button>
            <span className="text-slate-800">|</span>
            <span className="text-slate-500 cursor-default">Diarization Engine Active</span>
          </nav>
          
          <div className="flex items-center gap-3">
            {selectedFile && (
              <button
                onClick={resetFileState}
                className="flex items-center gap-1 px-2.5 py-1 text-[10px] text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 rounded uppercase tracking-wider font-mono transition-all"
                title="Reset environment and load a new audio file pipeline"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}
            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-white shadow-inner">
              JD
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Grid Area (12 Columns) */}
      <main className="flex-1 grid grid-cols-12 gap-0 overflow-hidden">
        
        {/* ========================================================= */}
        {/* COLUMN 1: LEFT SIDEBAR - File Ingest & Metadata Queue (col-span-3) */}
        {/* ========================================================= */}
        <aside className={`${focusMode ? "hidden" : "col-span-12 lg:col-span-3"} bg-[#0F1117] flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 overflow-y-auto`}>
          
          {/* File Upload / Import Zone */}
          <div className="p-5 border-b border-slate-800/60">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileInputChange}
              accept=".flac"
              multiple
              className="hidden"
            />
            <button 
              onClick={triggerFileDialog}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`w-full py-5 border-2 border-dashed rounded-lg transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer ${
                isDragging 
                  ? "border-indigo-500 bg-indigo-500/5" 
                  : "border-slate-755 hover:border-slate-600 hover:bg-slate-900/30"
              }`}
            >
              <UploadCloud className="w-7 h-7 text-slate-500 group-hover:text-indigo-400 transition-colors" />
              <div className="text-center">
                <span className="text-xs uppercase tracking-tighter font-semibold block text-slate-200 group-hover:text-white transition-colors">
                  Import FLAC File(s)
                </span>
                <span className="text-[10px] text-slate-500 lowercase mt-0.5 block">
                  Drag & drop or browse
                </span>
              </div>
            </button>
          </div>

          {/* Sessions & Audio Pipeline Queue */}
          <div className="p-5 flex-1 flex flex-col gap-4">
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">
              Workspace Sessions
            </span>
            
            <div className="space-y-2">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;
                return (
                  <div
                    key={session.id}
                    onClick={() => {
                      setActiveSessionId(session.id);
                      if (audioRef.current) {
                        audioRef.current.pause();
                      }
                      setIsPlaying(false);
                    }}
                    className={`p-3 rounded flex flex-col gap-1.5 transition-all cursor-pointer border ${
                      isActive
                        ? "bg-indigo-600/15 border-indigo-505/35 text-white"
                        : "hover:bg-slate-800/40 border-transparent text-slate-300"
                    }`}
                  >
                    <div className="flex justify-between items-start gap-2 text-xs">
                      <span className={`font-medium truncate leading-tight ${isActive ? "text-white" : "text-slate-200"}`}>
                        {session.name}
                      </span>
                      {session.status === "processing" ? (
                        <span className="text-[9px] bg-amber-500 text-slate-950 px-1.5 py-0.5 rounded-sm font-bold tracking-wider shrink-0 animate-pulse">
                          TRANSCRIBING
                        </span>
                      ) : session.status === "queued" ? (
                        <span className="text-[9px] bg-slate-800 text-slate-400 border border-slate-755 px-1.5 py-0.5 rounded-sm font-bold tracking-wider shrink-0 uppercase">
                          QUEUED
                        </span>
                      ) : session.status === "failed" ? (
                        <span className="text-[9px] bg-red-950/40 text-red-400 border border-red-900/40 px-1.5 py-0.5 rounded-sm font-bold tracking-wider shrink-0 uppercase">
                          FAILED
                        </span>
                      ) : session.isDemo ? (
                        <span className="text-[9px] bg-indigo-650 text-indigo-250 border border-indigo-500/20 px-1.5 py-0.5 rounded-sm font-bold tracking-wider shrink-0 uppercase">
                          DEMO
                        </span>
                      ) : (
                        <span className="text-[9px] bg-emerald-605/20 text-emerald-400 border border-emerald-500/10 px-1.5 py-0.5 rounded-sm font-bold tracking-wider shrink-0 uppercase">
                          COMPLETED
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
                      <span>{session.isDemo ? "demo asset" : "lossless flac"}</span>
                      <span>{(session.size / (1024 * 1024)).toFixed(2)} MB</span>
                    </div>
                    {session.status === "processing" && (
                      <div className="w-full bg-slate-900/50 rounded-full h-1 overflow-hidden mt-1.5">
                        <div className="bg-indigo-500 h-full animate-pulse w-[75%]"></div>
                      </div>
                    )}
                  </div>
                );
              })}

              {sessions.length === 0 && (
                <div className="p-4 bg-slate-900/20 border border-dashed border-slate-800/80 rounded flex flex-col items-center justify-center py-6 text-center text-slate-500 select-none">
                  <FileAudio className="w-5 h-5 mb-1.5 text-slate-600" />
                  <span className="text-[10.5px]">No sessions loaded yet.</span>
                  <span className="text-[9px] text-slate-600 mt-1">Import some .flac files or activate the meeting demo to begin.</span>
                </div>
              )}
            </div>

            {/* Cognitive Topics filter & checklist cloud attached neatly below workspace list */}
            {result && (
              <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col gap-3">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-indigo-400" />
                  Isolate Dialogue Topic
                </span>
                
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {result.keyTopics.map((topic, i) => {
                    const active = selectedTopic === topic;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedTopic(active ? null : topic)}
                        className={`text-[10px] px-2.5 py-1 rounded transition-all font-medium border text-left cursor-pointer ${
                          active 
                            ? "bg-indigo-600/25 text-white border-indigo-500/50 shadow-sm"
                            : "bg-[#0A0B0E]/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-250"
                        }`}
                      >
                        {topic}
                      </button>
                    );
                  })}
                  {selectedTopic && (
                    <button
                      onClick={() => setSelectedTopic(null)}
                      className="text-[10px] bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/20 px-2 py-1 rounded transition-all cursor-pointer font-bold font-mono"
                    >
                      Reset Filter
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Top Keywords Dynamic Frequency Widget */}
            {result && topKeywords && topKeywords.length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col gap-3">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-indigo-400" />
                  Top Keywords Frequency
                </span>
                
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {topKeywords.map(({ word, count }, i) => {
                    const active = selectedKeyword === word;
                    return (
                      <button
                        key={i}
                        onClick={() => setSelectedKeyword(active ? null : word)}
                        className={`text-[10px] px-2 py-1 rounded transition-all font-medium border text-left cursor-pointer flex items-center gap-1.5 group select-none ${
                          active 
                            ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/50 shadow-[0_0_8px_rgba(99,102,241,0.25)] font-semibold"
                            : "bg-[#0A0B0E]/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                        }`}
                        title={`Filter segments containing "${word}" (found ${count} ${count === 1 ? "time" : "times"})`}
                      >
                        <span className={active ? "text-indigo-400 font-bold" : "text-slate-600 group-hover:text-indigo-400"}>#</span>
                        <span>{word}</span>
                        <span className={`text-[8px] px-1 rounded font-mono ${
                          active ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-900 text-slate-500"
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                  {selectedKeyword && (
                    <button
                      onClick={() => setSelectedKeyword(null)}
                      className="text-[10px] bg-red-950/40 text-red-400 border border-red-900/40 hover:bg-red-900/20 px-2 py-1 rounded transition-all cursor-pointer font-bold font-mono"
                    >
                      Clear Keyword
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Bookmarked Quotes Widget */}
            {activeSessionId && bookmarks.filter(b => b.sessionId === activeSessionId).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-col gap-3">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <Bookmark className="w-3.5 h-3.5 text-indigo-400 fill-indigo-400" />
                    Bookmarked Quotes ({bookmarks.filter(b => b.sessionId === activeSessionId).length})
                  </span>
                  <button 
                    onClick={() => setBookmarks(prev => prev.filter(b => b.sessionId !== activeSessionId))}
                    className="text-[9px] text-slate-600 hover:text-slate-400 font-mono normal-case cursor-pointer"
                    title="Clear bookmarks for this file"
                  >
                    Clear All
                  </button>
                </span>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {bookmarks
                    .filter((b) => b.sessionId === activeSessionId)
                    .map((item, idx) => (
                      <div
                        key={idx}
                        onClick={() => handleSeekToSegment(item.startTime)}
                        className="p-2 bg-[#0A0B0E]/60 border border-slate-850 hover:border-slate-705 rounded transition-all cursor-pointer text-left group"
                        title="Click to jump to this quote timeline"
                      >
                        <div className="flex justify-between items-center text-[9px] font-mono mb-1">
                          <span className="text-indigo-400 font-medium">{item.speaker}</span>
                          <span className="text-slate-500 bg-slate-900 group-hover:bg-indigo-950/40 group-hover:text-indigo-300 px-1 py-0.5 rounded transition-colors duration-150">
                            {item.startTime}
                          </span>
                        </div>
                        <p className="text-[10.5px] leading-relaxed text-slate-400 group-hover:text-slate-200 line-clamp-2 italic transition-colors">
                          "{item.text}"
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            )}
            
          </div>

          {/* Quick instructions tips card */}
          <div className="p-4 bg-slate-950/60 border-t border-slate-800 text-[11px] text-slate-500 mt-auto leading-relaxed">
            <span className="text-slate-400 font-medium block mb-1">💡 Speech Audio tip:</span>
            FLAC captures full premium acoustics. Seek immediately into timeline milestones using either corresponding timestamp labels or clicking directly onto the Audio Waveform graph.
          </div>
        </aside>

        {/* ========================================================= */}
        {/* COLUMN 2: CENTER PANE - Waveform & Live Subtitles Render (col-span-6) */}
        {/* ========================================================= */}
        <section className={`col-span-12 ${focusMode ? "lg:col-span-12" : "lg:col-span-6"} flex flex-col h-full bg-[#0A0B0E] relative overflow-hidden transition-all duration-300`}>
          
          {/* Waveform Visualization (Dynamic CSS Simulation with Playback seeking overlay) */}
          <div className="h-24 bg-[#0A0B0E] border-b border-slate-850 flex items-end gap-1 px-8 pb-3 relative select-none">
            {/* Playback time floating overlay label */}
            <div className="absolute top-2.5 left-6 bg-slate-950/80 border border-slate-800 text-[10px] font-mono font-medium text-slate-400 px-2 py-0.5 rounded shadow-sm z-10 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></span>
              <span>PLAYHEAD STATE: {formatSecondsToDisplay(currentTime)} / {formatSecondsToDisplay(duration)}</span>
            </div>

            {/* View switcher for audio player frequencies visualization */}
            <div className="absolute top-2.5 right-6 bg-slate-950/85 border border-slate-800/80 p-0.5 rounded shadow-sm z-15 flex items-center gap-0.5">
              <button
                onClick={() => setVisualizerMode("bars")}
                className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-wider rounded-sm transition-all flex items-center gap-1 cursor-pointer ${
                  visualizerMode === "bars"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Switch to geometric waveform bars visualizer"
              >
                <BarChart2 className="w-3 h-3" />
                <span>Bars</span>
              </button>
              <button
                onClick={() => setVisualizerMode("line")}
                className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-wider rounded-sm transition-all flex items-center gap-1 cursor-pointer ${
                  visualizerMode === "line"
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
                title="Switch to minimalist frequency line graph"
              >
                <Activity className="w-3 h-3" />
                <span>Line</span>
              </button>
            </div>

            {/* Actual dynamic Web Audio API visualization via canvas rendering */}
            <VisualizerCanvas 
              audioElement={audioElement} 
              isPlaying={isPlaying} 
              mode={visualizerMode}
              playbackPercentage={playbackPercentage}
            />

            {/* Clickable transparent scrub mask overlay */}
            <div className="absolute inset-x-8 bottom-3 top-8 z-10 flex gap-1 items-end">
              {WAVEFORM_BARS.map((_, i) => {
                const barPercent = (i / WAVEFORM_BARS.length) * 100;
                const isPlayed = playbackPercentage >= barPercent;
                
                return (
                  <div
                    key={i}
                    onClick={() => handleWaveformScrub(i)}
                    className="flex-1 group cursor-pointer h-full flex items-end justify-center"
                    title={`Seek to ${formatSecondsToDisplay((i / WAVEFORM_BARS.length) * duration)}`}
                  >
                    <div className="w-full h-full rounded-sm opacity-0 group-hover:opacity-100 bg-indigo-500/10 transition-opacity duration-150" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* SPEAKER ACTIVITY TIMELINE & CONCENTRATION OVERLAY */}
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-[#0F1117] border-b border-slate-800 p-5 flex flex-col gap-3.5 flex-shrink-0 z-10"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                  <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                    Speaker Activity Density
                  </span>
                </div>
                
                {/* Speaker airtime legend blocks with isolate action */}
                <div className="flex flex-wrap items-center gap-2 text-[10px] select-none">
                  {speakerAirtimeStats.map((stat) => {
                    const speakerColor = getSpeakerColor(stat.speaker, uniqueSpeakers);
                    const isIsolated = isolatedSpeaker === stat.speaker;
                    
                    return (
                      <button
                        key={stat.speaker}
                        id={`isolate-speaker-${stat.speaker.toLowerCase().replace(/[^a-z0-9]/g, "-")}`}
                        onClick={() => setIsolatedSpeaker(isIsolated ? null : stat.speaker)}
                        className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all cursor-pointer ${
                          isIsolated
                            ? `${speakerColor.softBg} ${speakerColor.border} text-white font-medium ring-1 ring-indigo-500/10`
                            : "bg-slate-900/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                        style={isIsolated ? { ...speakerColor.softBgStyle, ...speakerColor.borderStyle } : undefined}
                        title={isIsolated ? "Click to clear isolation" : `Isolate ${stat.speaker}`}
                      >
                        {/* Stateful overlay color-picker directly inside the legend dot */}
                        <span className="relative flex items-center justify-center w-3 h-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span 
                            className={`w-2.5 h-2.5 rounded-full absolute pointer-events-none transition-transform hover:scale-110 ${speakerColor.bg}`}
                            style={speakerColor.bgStyle}
                          />
                          <input
                            type="color"
                            value={speakerColor.rawHex}
                            onChange={(e) => {
                              const newHex = e.target.value;
                              setCustomSpeakerColors((prev) => ({
                                ...prev,
                                [stat.speaker]: newHex,
                              }));
                            }}
                            className="w-3.5 h-3.5 opacity-0 cursor-pointer absolute"
                            title={`Pick a custom color for ${stat.speaker}`}
                          />
                        </span>
                        <span className="truncate max-w-[120px] font-mono">{stat.speaker}</span>
                        <span className="font-semibold text-slate-500">({stat.percentage}%)</span>
                      </button>
                    );
                  })}
                  {isolatedSpeaker && (
                    <button
                      id="reset-speaker-bias"
                      onClick={() => setIsolatedSpeaker(null)}
                      className="text-[9px] bg-red-950/40 text-red-400 hover:bg-red-900/10 hover:text-red-300 border border-red-900/30 px-1.5 py-0.5 rounded transition-all cursor-pointer font-bold font-mono tracking-wider"
                    >
                      RESET
                    </button>
                  )}
                </div>
              </div>

              {/* Concrete Speaker segment timeline blocks map */}
              <div className="relative w-full h-5 bg-[#0A0B0E] rounded-md border border-slate-850/80 overflow-hidden flex shadow-inner">
                {result.segments.map((seg, i) => {
                  const startSec = parseTimeToSeconds(seg.startTime);
                  let endSec = parseTimeToSeconds(seg.endTime);
                  if (endSec <= startSec) endSec = startSec + 5; // fallback
                  
                  const leftPercent = duration > 0 ? (startSec / duration) * 100 : 0;
                  const widthPercent = duration > 0 ? ((endSec - startSec) / duration) * 100 : 0;
                  
                  const speakerColor = getSpeakerColor(seg.speaker, uniqueSpeakers);
                  const isDimmed = isolatedSpeaker && isolatedSpeaker !== seg.speaker;

                  return (
                    <div
                      key={i}
                      id={`timeline-segment-${i}`}
                      onClick={() => handleSeekToSegment(seg.startTime)}
                      onMouseEnter={() => setHoveredSegmentIndex(i)}
                      onMouseLeave={() => setHoveredSegmentIndex(null)}
                      style={{
                        left: `${leftPercent}%`,
                        width: `${widthPercent}%`,
                        position: 'absolute'
                      }}
                      className={`h-full border-r border-[#0A0B0E]/35 cursor-pointer transition-all duration-150 ${
                        isDimmed ? "opacity-[0.12] scale-y-[0.8]" : "opacity-100 hover:brightness-125 hover:scale-y-[1.1]"
                      }`}
                    >
                      <div className={`w-full h-full ${speakerColor.bg}`} style={speakerColor.bgStyle} />
                    </div>
                  );
                })}

                {/* Vertical slider playhead state line inside Speaker timeline */}
                <div
                  id="speaker-timeline-playhead"
                  style={{ left: `${playbackPercentage}%` }}
                  className="absolute top-0 bottom-0 w-[1.5px] bg-white shadow-[0_0_8px_#ffffff] z-10 pointer-events-none transition-all duration-75"
                />
              </div>

              {/* Dynamic Ruler Scale Markers */}
              <div className="flex justify-between text-[9px] font-mono text-slate-600 px-0.5 select-none leading-none -mt-1">
                {rulerTicks.map((tickSec, index) => (
                  <span key={index}>{formatSecondsToDisplay(tickSec)}</span>
                ))}
              </div>

              {/* Safe floating Tooltip area right inside the flow to avoid any viewport layout overflow */}
              <div className="h-5 relative flex items-center min-w-0 z-10 select-none">
                <AnimatePresence mode="wait">
                  {hoveredSegmentIndex !== null && result.segments[hoveredSegmentIndex] ? (
                    <motion.div
                      key={`tooltip-${hoveredSegmentIndex}`}
                      initial={{ opacity: 0, y: 3 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-x-0 bottom-0 text-[10px] font-mono text-slate-400 flex justify-between items-center bg-[#0A0B0E] border border-slate-800/40 px-2.5 py-1 rounded"
                    >
                      {(() => {
                        const hoveredSeg = result.segments[hoveredSegmentIndex];
                        const hoveredColor = getSpeakerColor(hoveredSeg.speaker, uniqueSpeakers);
                        return (
                          <span className="flex items-center gap-1.5 min-w-0 shrink-0">
                            <span 
                              className={`w-1.5 h-1.5 rounded-full ${hoveredColor.bg}`}
                              style={hoveredColor.bgStyle}
                            />
                            <span className="font-bold text-slate-300 truncate max-w-[125px]">
                              {hoveredSeg.speaker}
                            </span>
                          </span>
                        );
                      })()}
                      <span className="text-slate-500 shrink-0 text-right text-[9px]">
                        [{result.segments[hoveredSegmentIndex].startTime} - {result.segments[hoveredSegmentIndex].endTime}]
                      </span>
                      <span className="text-slate-400 truncate max-w-[140px] sm:max-w-[280px] md:max-w-[340px] italic text-left pl-2 opacity-95 shrink font-sans">
                        "{result.segments[hoveredSegmentIndex].text}"
                      </span>
                    </motion.div>
                  ) : (
                    <div className="text-[9px] font-mono text-slate-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-800" />
                      <span>Hover over a speaker block to preview dialogue block snippet. Tap a speaker block to seek instantly.</span>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* Primary Dialog Transcript Viewport */}
          <div className="flex-1 bg-white/[0.01] overflow-y-auto min-h-0 relative">
            
            {result && (
              <div className="sticky top-0 bg-[#0A0B0E]/95 backdrop-blur-md border-b border-slate-900/60 px-8 py-3.5 z-20 flex items-center justify-between gap-4 transition-all duration-300">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs uppercase tracking-widest font-semibold text-slate-300 font-sans">
                    Conversation Transcript
                  </span>
                  {focusMode && (
                    <span className="text-[9px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/20 uppercase tracking-widest font-bold font-mono">
                      Focus Active
                    </span>
                  )}
                </div>

                {/* Focus mode search integrated inside reading view if active */}
                {focusMode && (
                  <div className="flex-1 max-w-sm relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search within reading focus..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 bg-[#0F1117] border border-slate-800 rounded text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/30 transition-all font-sans"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white font-mono text-[9px] uppercase font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {/* Sync scroll toggle button */}
                  <button
                    onClick={() => setSyncScroll(!syncScroll)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer border ${
                      syncScroll
                        ? "bg-indigo-600/20 border-indigo-500/30 text-indigo-400 hover:bg-slate-800"
                        : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700"
                    }`}
                    title={syncScroll ? "Turn off auto-scrolling to active segment" : "Turn on auto-scrolling to active segment"}
                  >
                    <Navigation className={`w-3.5 h-3.5 transition-transform ${syncScroll ? "rotate-45 text-indigo-400" : "text-slate-500"}`} />
                    <span>Sync Scroll</span>
                  </button>

                  <button
                    onClick={() => setFocusMode(!focusMode)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-semibold uppercase tracking-wider transition-all duration-200 cursor-pointer border ${
                      focusMode
                        ? "bg-[#6366f1]/20 border-indigo-500/30 text-indigo-400 hover:bg-indigo-600/30"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                    }`}
                    title={focusMode ? "Restore sidebars and controls layout" : "Toggle full-screen reading canvas"}
                  >
                    {focusMode ? (
                      <>
                        <Minimize2 className="w-3.5 h-3.5" />
                        <span>Exit Focus</span>
                      </>
                    ) : (
                      <>
                        <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                        <span>Focus Mode</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            
            {result && (selectedTopic || selectedKeyword) && (
              <div className="bg-indigo-950/15 border-b border-slate-900/40 px-8 py-2.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500 font-mono text-[10px] uppercase tracking-wider">Active Filters:</span>
                {selectedTopic && (
                  <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded flex items-center gap-1.5 font-medium">
                    <span>Topic: {selectedTopic}</span>
                    <button 
                      onClick={() => setSelectedTopic(null)} 
                      className="hover:text-white font-bold font-mono text-[11px] cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {selectedKeyword && (
                  <span className="bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 px-2.5 py-0.5 rounded flex items-center gap-1.5 font-medium font-mono">
                    <span>#{selectedKeyword}</span>
                    <button 
                      onClick={() => setSelectedKeyword(null)} 
                      className="hover:text-white font-bold font-mono text-[11px] cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                <button
                  onClick={() => {
                    setSelectedTopic(null);
                    setSelectedKeyword(null);
                  }}
                  className="text-slate-500 hover:text-white hover:underline text-[10px] uppercase font-bold font-mono ml-auto cursor-pointer font-sans"
                >
                  Clear Filters
                </button>
              </div>
            )}
            
            {errorMessage && (
              <div className="m-6 p-4 bg-red-950/20 border border-red-900/40 rounded text-red-300 text-xs flex gap-3.5 items-start">
                <span>⚠️</span>
                <div>
                  <h5 className="font-bold text-red-200">Processing error occurred</h5>
                  <p className="mt-1 opacity-90">{errorMessage}</p>
                </div>
              </div>
            )}

            <AnimatePresence mode="wait">
              {!selectedFile ? (
                /* EMPTY WELCOME WELCOME SCREEN */
                <motion.div
                  key="empty-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="max-w-md mx-auto flex flex-col items-center gap-5">
                    <div className="w-12 h-12 bg-slate-900 border border-slate-800 rounded-lg flex items-center justify-center text-slate-400 shadow-inner">
                      <FileAudio className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white tracking-tight">
                        Awaiting Ingest Stream
                      </h3>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        To operate, select or drag a high-definition .flac file onto the workspace drop-deck, or fire up the instant preloaded roadmap session demo to proceed.
                      </p>
                    </div>
                    
                    <button
                      onClick={handleLoadDemo}
                      className="mt-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded transition-all tracking-wider shadow-lg shadow-indigo-600/10 cursor-pointer"
                    >
                      ACTIVATE PRELOADED MEETING DEMO
                    </button>
                  </div>
                </motion.div>
              ) : activeSession?.status === "queued" ? (
                /* QUEUED IN BACKGROUND GATEWAY VIEW */
                <motion.div
                  key="queued-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="max-w-md mx-auto flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="w-14 h-14 border-2 border-dashed border-slate-700 rounded-full animate-spin"></div>
                      <Clock className="w-5 h-5 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
                        Queued in Stream Pipeline
                      </h4>
                      <p className="text-xs text-slate-500 font-mono leading-relaxed">
                        This file is in the sequential transcription queue and will begin processing as soon as previous sessions finish.
                      </p>
                    </div>

                    <div className="w-full text-left bg-[#0A0B0E] p-4 rounded-lg border border-slate-850 font-mono text-[10px] text-slate-500 leading-relaxed shadow-inner">
                      <div className="text-indigo-400 font-bold mb-1 tracking-wider uppercase">
                        &gt; PIPELINE SEQUENCE ACTIVE
                      </div>
                      <div>- Stream size: {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) : "0"} MB • flac codec</div>
                      <div>- Position: Sequential FIFO Queue</div>
                      <div>- Action: Transcribing automatically as channels clear...</div>
                    </div>
                  </div>
                </motion.div>
              ) : activeSession?.status === "failed" ? (
                /* FAILED DIALOG CONTAINER */
                <motion.div
                  key="failed-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="max-w-md mx-auto flex flex-col items-center gap-6">
                    <div className="w-12 h-12 bg-red-950/40 border border-red-900/30 rounded-lg flex items-center justify-center text-red-400 shadow-inner">
                      <RefreshCw className="w-5 h-5 animate-spin" />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <h4 className="text-sm font-semibold text-red-400 uppercase tracking-wider">
                        Transcription Failed
                      </h4>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
                        {errorMessage || "Unable to parse this lossless recording."}
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setSessions((prev) =>
                          prev.map((s) =>
                            s.id === activeSessionId
                              ? { ...s, status: "queued", progress: "Re-queueing target session..." }
                              : s
                          )
                        );
                      }}
                      className="mt-2 px-4 py-2 bg-indigo-650 hover:bg-indigo-600 text-white font-semibold text-xs rounded transition-all tracking-wider uppercase cursor-pointer border border-indigo-500/20"
                    >
                      Retry Transcription
                    </button>
                  </div>
                </motion.div>
              ) : transcribing ? (
                /* TRANSCRIBING PROGRESS DISPLAY */
                <motion.div
                  key="progress-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="max-w-md mx-auto flex flex-col items-center gap-6">
                    <div className="relative">
                      <div className="w-14 h-14 border-2 border-slate-800 border-t-indigo-500 rounded-full animate-spin"></div>
                      <Sparkles className="w-5 h-5 text-indigo-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
                    </div>
                    
                    <div className="flex flex-col gap-2 w-full">
                      <h4 className="text-sm font-semibold text-white uppercase tracking-wider">
                        Transcribing Lossless FLAC
                      </h4>
                      <p className="text-xs text-indigo-400 font-mono font-semibold">
                        {transcriptionProgress}
                      </p>

                      {/* Integrated high-fidelity visual progress bar */}
                      <div className="w-full mt-2">
                        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mb-1">
                          <span>PIPELINE DISPATCH</span>
                          <span className="font-semibold text-indigo-400">{transcriptionProgressPercent}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 border border-slate-800 rounded-full overflow-hidden p-0.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${transcriptionProgressPercent}%` }}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-indigo-400 shadow-[0_0_8px_rgba(99,102,241,0.5)]"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Simulating code activity console */}
                    <div className="w-full text-left bg-[#0A0B0E] p-4 rounded-lg border border-slate-850 font-mono text-[10px] text-slate-500 leading-relaxed shadow-inner">
                      <div className="text-indigo-400 font-bold mb-1 tracking-wider uppercase">
                        &gt; CLOUD RUN CORE GATEWAY ACTIVE
                      </div>
                      <div>- Stream size: {selectedFile ? (selectedFile.size / (1024 * 1024)).toFixed(2) : "0"} MB • flac codec</div>
                      <div>- AI Pipeline: Multi-speaker diarization activated</div>
                      <div>- Processing: Compiling timed speech sequence milestones...</div>
                    </div>
                  </div>
                </motion.div>
              ) : !result ? (
                /* FILE CHOSEN BUT NOT TRANSCRIBED YET */
                <motion.div
                  key="ready-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full flex flex-col items-center justify-center p-8 text-center"
                >
                  <div className="max-w-md mx-auto flex flex-col items-center gap-5">
                    <div className="w-12 h-12 bg-indigo-600/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400 shadow-inner">
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white tracking-wider uppercase">
                        Lossless FLAC file processed
                      </h4>
                      <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                        Vocal components and spectral densities are verified. Trigger our server-side speech-to-text pipeline to parse conversations with dual-speaker tags.
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setSessions((prev) =>
                          prev.map((s) =>
                            s.id === activeSessionId
                              ? { ...s, status: "queued", progress: "Queueing transcription..." }
                              : s
                          )
                        );
                      }}
                      className="px-5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-widest rounded shadow-lg shadow-indigo-600/20 cursor-pointer transition-all"
                    >
                      Transcribe with Gemini AI
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* ACTUAL SUCCESS COMPILATION TRANSCRIPT SEGMENTS */
                <motion.div
                  key="transcript-dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onMouseUp={handleTranscriptMouseUp}
                  className={`p-8 space-y-8 relative ${focusMode ? "max-w-4xl mx-auto w-full transition-all duration-300" : ""}`}
                >
                  {filteredSegments.length === 0 ? (
                    <div className="py-20 text-center text-slate-600 text-xs">
                      No dialog blocks matched the active topic filter or search query.
                    </div>
                  ) : (
                    filteredSegments.map((seg, idx) => {
                      // Lookup original data array to verify highlighting
                      const originalIdx = result.segments.findIndex(
                        (s) => s.startTime === seg.startTime && s.text === seg.text
                      );
                      const isActive = originalIdx === activeSegmentIndex;
                      const speakerColor = getSpeakerColor(seg.speaker, uniqueSpeakers);
                      const isDimmed = isolatedSpeaker && isolatedSpeaker !== seg.speaker;

                      return (
                        <motion.div
                          key={originalIdx !== -1 ? originalIdx : idx}
                          ref={isActive ? activeSegmentRef : null}
                          onClick={() => handleSeekToSegment(seg.startTime)}
                          initial={false}
                          animate={{
                            opacity: isDimmed ? 0.22 : 1,
                            scale: isDimmed ? 0.99 : 1,
                            filter: isDimmed ? "saturate(30%)" : "saturate(100%)",
                          }}
                          transition={{
                            duration: 0.25,
                            ease: "easeInOut",
                          }}
                          className={`flex gap-6 items-start p-3.5 rounded cursor-pointer ${
                            isActive 
                              ? "bg-indigo-600/5 ring-1 ring-indigo-500/30 rounded-lg" 
                              : "hover:bg-slate-900/30"
                          }`}
                        >
                          {/* Timestamps in indigo-400 styling representing Geometric style */}
                          <span className={`text-[10px] font-mono w-12 pt-1 shrink-0 ${
                            isActive ? "text-indigo-400 font-bold" : "text-slate-600"
                          }`}>
                            [{seg.startTime}]
                          </span>

                          <div className="flex-1 font-sans">
                            {/* Dialogue details color-coded dynamically */}
                            <div className="flex justify-between items-center gap-4 mb-2" onClick={(e) => e.stopPropagation()}>
                              <h4 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${speakerColor.text}`} style={speakerColor.textStyle}>
                                <span className={`w-1.5 h-1.5 rounded-full ${speakerColor.bg}`} style={speakerColor.bgStyle}></span>
                                {editingSpeakerName === seg.speaker ? (
                                  <input
                                    type="text"
                                    value={currSpeakerValue}
                                    onChange={(e) => setCurrSpeakerValue(e.target.value)}
                                    onBlur={() => {
                                      handleUpdateSpeakerName(seg.speaker, currSpeakerValue);
                                      setEditingSpeakerName(null);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        handleUpdateSpeakerName(seg.speaker, currSpeakerValue);
                                        setEditingSpeakerName(null);
                                      } else if (e.key === "Escape") {
                                        setEditingSpeakerName(null);
                                      }
                                    }}
                                    className="px-1.5 py-0.5 bg-[#0F1117] border border-indigo-500/60 rounded text-white text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 font-medium normal-case font-sans"
                                    autoFocus
                                  />
                                ) : (
                                  <span 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSpeakerName(seg.speaker);
                                      setCurrSpeakerValue(seg.speaker);
                                    }}
                                    className="cursor-text hover:text-white transition-colors border-b border-dashed border-slate-700 hover:border-indigo-400 pb-0.5"
                                    title="Click to rename speaker globally"
                                  >
                                    {seg.speaker}
                                  </span>
                                )}
                                {isActive && (
                                  <span className="text-[8px] uppercase tracking-wider text-indigo-400/80 bg-indigo-500/10 border border-indigo-500/20 px-1 py-0.5 rounded ml-1 font-mono font-medium leading-none whitespace-nowrap">
                                    ACTIVE SPEAKING Chunk
                                  </span>
                                )}
                              </h4>

                              <div className="flex items-center gap-1.5 shrink-0 ml-auto select-none">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleBookmark(originalIdx, seg.speaker, seg.startTime, seg.text);
                                  }}
                                  className={`text-[9.5px] font-bold font-mono border px-2 py-1 rounded transition-all flex items-center gap-1.5 cursor-pointer shadow-sm group/btn ${
                                    bookmarks.some(b => b.sessionId === activeSessionId && b.originalIndex === originalIdx)
                                      ? "bg-indigo-600/15 text-indigo-400 border-indigo-500/30"
                                      : "text-slate-500 hover:text-indigo-400 bg-slate-950/60 hover:bg-slate-900 border-slate-800/80 hover:border-slate-700"
                                  }`}
                                  title="Bookmark this quote for quick recall"
                                >
                                  <Bookmark className={`w-2.5 h-2.5 ${
                                    bookmarks.some(b => b.sessionId === activeSessionId && b.originalIndex === originalIdx)
                                      ? "fill-indigo-400 text-indigo-400"
                                      : "text-slate-500 group-hover/btn:text-indigo-400 transition-colors"
                                  }`} />
                                  <span>{bookmarks.some(b => b.sessionId === activeSessionId && b.originalIndex === originalIdx) ? "Bookmarked" : "Bookmark"}</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleCopySegment(seg.text, originalIdx);
                                  }}
                                  className="text-[9.5px] font-bold font-mono text-slate-500 hover:text-indigo-400 bg-slate-950/60 hover:bg-slate-900 border border-slate-800/80 hover:border-slate-700 px-2 py-1 rounded transition-all flex items-center gap-1.5 cursor-pointer shadow-sm group/btn"
                                  title="Copy text of this segment to clipboard"
                                >
                                  {copiedSegmentId === originalIdx ? (
                                    <>
                                      <Check className="w-2.5 h-2.5 text-emerald-400 animate-bounce" />
                                      <span className="text-emerald-400">Copied!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-2.5 h-2.5 text-slate-500 group-hover/btn:text-indigo-400 transition-colors" />
                                      <span>Copy</span>
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                            <p data-segment-index={originalIdx} className={`text-sm sm:text-base leading-relaxed ${
                                isActive ? "text-white" : "text-slate-200"
                            }`}>
                              <RenderSegmentWithHighlights 
                                text={seg.text} 
                                query={searchQuery} 
                                highlights={highlights.filter(h => h.sessionId === activeSessionId && h.originalIndex === originalIdx)}
                                onRemoveHighlight={removeHighlight}
                              />
                            </p>
                          </div>

                          {isActive && (
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-ping mt-2 shrink-0"></span>
                          )}
                        </motion.div>
                      );
                    })
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Floating Highlighter Toolbar */}
            {activeSelection && (
              <div 
                className="fixed z-50 flex gap-1.5 p-1.5 bg-slate-800 border border-slate-700 shadow-xl rounded-md animate-in fade-in zoom-in-95 duration-100"
                style={{
                  top: activeSelection.rect.top - 45,
                  left: activeSelection.rect.left + (activeSelection.rect.width / 2) - 60
                }}
              >
                {[
                  { color: "yellow", twClass: "bg-yellow-400 hover:bg-yellow-300 ring-yellow-400/50" },
                  { color: "green", twClass: "bg-emerald-400 hover:bg-emerald-300 ring-emerald-400/50" },
                  { color: "pink", twClass: "bg-pink-400 hover:bg-pink-300 ring-pink-400/50" }
                ].map(({ color, twClass }) => (
                  <button 
                    key={color}
                    className={`w-6 h-6 rounded-full shadow-sm cursor-pointer border border-slate-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${twClass}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      addHighlight(color as HighlightColor);
                    }}
                    title={`Highlight ${color}`}
                  />
                ))}
              </div>
            )}

          </div>
        </section>

        {/* ========================================================= */}
        {/* COLUMN 3: RIGHT SIDEBAR - Controls, Checklist & Export (col-span-3) */}
        {/* ========================================================= */}
        <aside className={`${focusMode ? "hidden" : "col-span-12 lg:col-span-3"} bg-[#0F1117] border-t lg:border-t-0 lg:border-l border-slate-800 flex flex-col overflow-y-auto`}>
          
          <div className="p-6 space-y-6">
            
            {/* Live Search Block inside Controls Pane */}
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 block mb-3 font-bold">
                Search Subtitles
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Type parameters..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-[#0A0B0E] border border-slate-800 rounded text-xs text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white font-mono text-[10px] uppercase font-bold"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Audio Playback Deck inside Controls Panel */}
            <div className="bg-[#0A0B0E]/60 p-4 border border-slate-800 rounded">
              <label className="text-[10px] uppercase tracking-widest text-slate-500 block mb-3.5 font-bold flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-indigo-400" />
                Master Gain player
              </label>

              {/* Master Volume seeking controls */}
              <div className="space-y-3">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                  <span className="bg-[#0A0B0E] px-1.5 py-0.5 rounded border border-slate-850">
                    {formatSecondsToDisplay(currentTime)}
                  </span>
                  <span className="opacity-60">Scrub</span>
                  <span className="bg-[#0A0B0E] px-1.5 py-0.5 rounded border border-slate-850">
                    {formatSecondsToDisplay(duration)}
                  </span>
                </div>

                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleAudioSeek}
                  disabled={!fileUrl}
                  className="w-full h-1 bg-slate-850 rounded appearance-none cursor-pointer accent-indigo-500 outline-none"
                />

                <div className="flex items-center justify-between gap-2 pt-1.5">
                  <button
                    onClick={handlePlayPauseToggle}
                    disabled={!fileUrl}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded text-[11px] font-semibold tracking-wider uppercase transition-all ${
                      !fileUrl 
                        ? "bg-slate-900 text-slate-600 border border-slate-850 cursor-not-allowed"
                        : isPlaying 
                          ? "bg-amber-600/15 text-amber-400 border border-amber-500/30 hover:bg-amber-600/25" 
                          : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/10"
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        Pause Player
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Play Audio
                      </>
                    )}
                  </button>

                  <select
                    value={playbackSpeed}
                    onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                    disabled={!fileUrl}
                    className="px-2 py-2 bg-[#0A0B0E] border border-slate-800 rounded font-mono text-[10px] text-slate-300 outline-none cursor-pointer focus:border-indigo-500"
                  >
                    <option value="0.75">0.75x</option>
                    <option value="1.0">1.0x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Processing Engine options adhering to theme */}
            <div>
              <label className="text-[10px] uppercase tracking-widest text-slate-500 block mb-3 font-bold">
                Processing AI Engine
              </label>
              <div className="space-y-1.5">
                <button 
                  onClick={() => setProcessingEngine("gemini")}
                  className={`w-full flex justify-between items-center p-3 rounded border text-xs leading-none transition-all cursor-pointer ${
                    processingEngine === "gemini" 
                      ? "border-indigo-500 bg-indigo-500/5 text-indigo-300" 
                      : "border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="text-left">
                    <span className="block font-medium">DeepWave v3.5</span>
                    <span className="block text-[8px] text-slate-500 lowercase mt-0.5">Gemini 3.5 flash multimodal</span>
                  </span>
                  {processingEngine === "gemini" && (
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                    </svg>
                  )}
                </button>
                
                <button 
                  onClick={() => setProcessingEngine("whisper")}
                  className={`w-full flex justify-between items-center p-3 rounded border text-xs leading-none transition-all cursor-pointer ${
                    processingEngine === "whisper" 
                      ? "border-indigo-500 bg-indigo-500/5 text-indigo-300" 
                      : "border-slate-800 text-slate-400 hover:border-slate-700"
                  }`}
                >
                  <span className="text-left">
                    <span className="block font-medium">Standard Whisperer</span>
                    <span className="block text-[8px] text-slate-500 lowercase mt-0.5">Dual-channel spectral analyzer</span>
                  </span>
                  {processingEngine === "whisper" && (
                    <svg className="w-3.5 h-3.5 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Diarization option widget toggle */}
            <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-350 block">Speaker Diarization</span>
                <span className="text-[9px] text-slate-500 lowercase block mt-0.5">Expose dual participant tags</span>
              </div>
              
              <button
                onClick={() => setDetectSpeakers(!detectSpeakers)}
                className={`w-9 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${
                  detectSpeakers ? "bg-indigo-600" : "bg-slate-800"
                }`}
              >
                <div className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-all duration-200 ${
                  detectSpeakers ? "right-1" : "left-1"
                }`} />
              </button>
            </div>

            {/* Export options grid */}
            {result && (
              <div className="pt-4 border-t border-slate-800">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 block mb-3 font-bold">
                  File Format Exports
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button 
                    onClick={handleExportText}
                    className="p-2 bg-[#0A0B0E] hover:bg-slate-800 rounded text-[10px] hover:text-white transition-all font-semibold font-mono border border-slate-850 cursor-pointer"
                    title="Export as Document Text"
                  >
                    .TXT
                  </button>
                  <button 
                    onClick={handleExportSRT}
                    className="p-2 bg-[#0A0B0E] hover:bg-slate-800 rounded text-[10px] hover:text-white transition-all font-semibold font-mono border border-slate-850 cursor-pointer"
                    title="Export Subtitles SRT"
                  >
                    .SRT
                  </button>
                  <button 
                    onClick={handleExportWebVTT}
                    className="p-2 bg-[#0A0B0E] hover:bg-slate-800 rounded text-[10px] hover:text-white transition-all font-semibold font-mono border border-slate-850 cursor-pointer"
                    title="Export Subtitles WebVTT"
                  >
                    .VTT
                  </button>
                  <button 
                    onClick={handleExportJSON}
                    className="p-2 bg-[#0A0B0E] hover:bg-slate-800 rounded text-[10px] hover:text-white transition-all font-semibold font-mono border border-slate-850 cursor-pointer"
                    title="Export Structure JSON"
                  >
                    .JSON
                  </button>
                  <button 
                    onClick={handleExportCSV}
                    className="p-2 bg-[#0A0B0E] hover:bg-slate-800 rounded text-[10px] hover:text-white transition-all font-semibold font-mono border border-slate-850 cursor-pointer text-indigo-400 border-indigo-500/10 bg-indigo-500/5 hover:border-indigo-500/30"
                    title="Export Spreadsheet CSV"
                  >
                    .CSV
                  </button>
                </div>
              </div>
            )}

            {/* Smart Checklist deliverables listed cleanly if results exist */}
            {result && result.actionItems && result.actionItems.length > 0 && (
              <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
                <span className="text-[10px] uppercase tracking-widest text-slate-500 font-bold block">
                  Action Milestones ({Object.values(completedActions).filter(Boolean).length}/{result.actionItems.length})
                </span>
                
                <div className="space-y-2">
                  {result.actionItems.map((item, idx) => {
                    const done = !!completedActions[idx];
                    return (
                      <div
                        key={idx}
                        onClick={() => toggleActionItem(idx)}
                        className={`flex items-start gap-2.5 p-2 bg-[#0A0B0E]/40 hover:bg-[#0A0B0E]/90 border rounded transition-all cursor-pointer ${
                          done 
                            ? "border-indigo-500/10 text-slate-500 opacity-60" 
                            : "border-slate-850 text-slate-350 hover:border-slate-750"
                        }`}
                      >
                        <div className="mt-0.5 shrink-0 text-indigo-400">
                          {done ? (
                            <div className="p-0.5 bg-indigo-500/10 rounded border border-indigo-500/30">
                              <Check className="w-3 h-3 text-indigo-400 stroke-[3]" />
                            </div>
                          ) : (
                            <div className="w-3.5 h-3.5 border border-slate-700 rounded transition-colors group-hover:border-indigo-500"></div>
                          )}
                        </div>
                        <span className={`text-[11px] leading-relaxed ${done ? "line-through" : ""}`}>
                          {item}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

          </div>

          {/* Master Export/Download Trigger in bottom sidebar */}
          {result && (
            <div className="mt-auto p-6 bg-slate-900/30 border-t border-slate-800/80">
              <button 
                onClick={handleExportJSON}
                className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-indigo-600/20 cursor-pointer transition-all hover:scale-[1.01]"
              >
                Export Core JSON data
              </button>
            </div>
          )}
        </aside>

      </main>

      {/* Bottom Status Bar - Geometric Balance Layout */}
      <footer className="h-10 bg-[#0F1117] border-t border-slate-800 px-6 flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-500 font-medium z-10 select-none">
        <div className="flex gap-6">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-pulse"></span>
            System Ready
          </span>
          <span>Latency: 14ms</span>
          {fileUrl && (
            <span className="hidden sm:inline text-slate-600">
              Stream codec: audio/flac • {isDemoMode ? "44.1kHz" : "lossless pcm"}
            </span>
          )}
        </div>
        <div className="flex gap-6">
          <span>Storage: {(result ? "1.48MB" : "0.00MB")} / 100MB</span>
          <span className="text-indigo-400 font-extrabold tracking-widest">PRO PLAN</span>
        </div>
      </footer>
    </div>
  );
}

// Subordinate Component: Handles high-fidelity query match along with user text highlights
function RenderSegmentWithHighlights({ 
  text, 
  query, 
  highlights,
  onRemoveHighlight 
}: { 
  text: string; 
  query: string; 
  highlights: TextHighlight[];
  onRemoveHighlight: (id: string, e: React.MouseEvent) => void;
}) {
  const chars = text.split("").map(char => ({ 
    char, 
    isSearch: false, 
    highlightColor: undefined as HighlightColor | undefined, 
    highlightId: undefined as string | undefined 
  }));

  highlights.forEach(h => {
    for (let i = h.start; i < h.end; i++) {
        if (i < chars.length) {
          chars[i].highlightColor = h.color;
          chars[i].highlightId = h.id;
        }
    }
  });

  if (query) {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let idx = lowerText.indexOf(lowerQuery);
    while (idx !== -1) {
      for (let i = 0; i < query.length; i++) {
        chars[idx + i].isSearch = true;
      }
      idx = lowerText.indexOf(lowerQuery, idx + query.length);
    }
  }

  const chunks = [];
  let currentChunk = null;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (!currentChunk) {
      currentChunk = { text: c.char, isSearch: c.isSearch, highlightColor: c.highlightColor, highlightId: c.highlightId };
    } else if (currentChunk.isSearch === c.isSearch && currentChunk.highlightColor === c.highlightColor && currentChunk.highlightId === c.highlightId) {
      currentChunk.text += c.char;
    } else {
      chunks.push(currentChunk);
      currentChunk = { text: c.char, isSearch: c.isSearch, highlightColor: c.highlightColor, highlightId: c.highlightId };
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  return (
    <>
      {chunks.map((chunk, i) => {
        let className = "transition-colors "; 
        
        if (chunk.highlightColor === "yellow") className += " bg-yellow-400/30 text-yellow-100 hover:bg-yellow-400/40 cursor-text ";
        else if (chunk.highlightColor === "green") className += " bg-emerald-400/30 text-emerald-100 hover:bg-emerald-400/40 cursor-text ";
        else if (chunk.highlightColor === "pink") className += " bg-pink-400/30 text-pink-100 hover:bg-pink-400/40 cursor-text ";

        if (chunk.isSearch) {
          className += " bg-indigo-500/35 text-white font-semibold";
        }

        if (!chunk.highlightColor && !chunk.isSearch) {
          return <span key={i}>{chunk.text}</span>;
        }

        return (
          <mark 
            key={i} 
            className={`rounded px-[1.5px] mx-[0.5px] relative group/mark ${className}`} 
            data-highlight-id={chunk.highlightId}
          >
            {chunk.text}
            {chunk.highlightId && (
               <button 
                 onClick={(e) => {
                   e.preventDefault();
                   onRemoveHighlight(chunk.highlightId!, e);
                 }}
                 className="absolute -top-3.5 -right-2.5 w-4 h-4 bg-slate-800 text-white rounded-full flex items-center justify-center text-[9px] font-bold opacity-0 group-hover/mark:opacity-100 transition-opacity z-10 shadow border border-slate-600 hover:bg-red-500 hover:border-red-500 cursor-pointer"
                 title="Remove highlight"
               >
                 ✕
               </button>
            )}
          </mark>
        );
      })}
    </>
  );
}
