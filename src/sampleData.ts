import { TranscriptionResult } from "./types";

export const SAMPLE_TRANSCRIPT: TranscriptionResult = {
  title: "Engineering Synapse: Q2 Roadmap & Audio Architecture Alignment",
  summary: "A quarterly sync-up between the core audio infrastructure team and product designers. The conversation centers on implementing high-fidelity low-latency streaming layers, improving speaker diarization capabilities, and organizing client-side audio asset pipeline tools for the forthcoming application rollout in mid-June.",
  keyTopics: [
    "Audio Compression",
    "Latency Metrics",
    "Speaker Diarization",
    "Asset Delivery Pipeline",
    "June Release Schedule"
  ],
  actionItems: [
    "Establish dedicated benchmarks for compression ratios with FLAC files under varying connectivity profiles.",
    "Draft a formal API contract for client-side streaming chunk callback handlers.",
    "Refine speaker classification models to support robust multi-user noise cancellation filters.",
    "Consolidate audio assets to minimize initial container cold-start fetch sizes."
  ],
  segments: [
    {
      speaker: "Speaker 1 (Engineering)",
      startTime: "00:00",
      endTime: "00:15",
      text: "Alright everyone, thanks for joining the sync. Today we are aligning on our audio engine roadmap with a specific focus on optimizing FLAC compression and latency boundaries for our upcoming mid-June release."
    },
    {
      speaker: "Speaker 2 (Product Architect)",
      startTime: "00:15",
      endTime: "00:32",
      text: "Excellent. From a UX standpoint, we want to make sure the audio playback starts almost instantly. Our current budget is under two hundred milliseconds before the first audio packet decodes. What's our stance on buffer preloading?"
    },
    {
      speaker: "Speaker 1 (Engineering)",
      startTime: "00:32",
      endTime: "00:54",
      text: "We can achieve that by streaming tiny chunks and leveraging native decode threads over Web Workers. FLAC is perfect for this because it's lossless but has low decoding overhead compared to heavily wrapped wrapper formats. We've set up benchmarks for this to verify."
    },
    {
      speaker: "Speaker 3 (AI Researcher)",
      startTime: "00:54",
      endTime: "01:21",
      text: "On the smart features side, I am happy to report that the speaker classification and diarization accuracy has increased by fifteen percent. By analyzing spectral variations in real-time, we can distinguish overlapping vocal tracks much better now."
    },
    {
      speaker: "Speaker 2 (Product Architect)",
      startTime: "01:21",
      endTime: "01:40",
      text: "That sounds awesome. Let's make sure those diarization flags are exposed via our standard SRT and JSON formats, so clients can easily map text logs and transcript segments back to specific timelines and visual waveform highlights."
    },
    {
      speaker: "Speaker 1 (Engineering)",
      startTime: "01:40",
      endTime: "02:05",
      text: "Done. I'll publish the updated JSON schema structure this afternoon. Let's push hard on the remaining compression ratio tests so we stay firmly on track for our mid-June target launch. Thanks again, let's execute."
    }
  ]
};

// 10-second base64 silent audio to run free interactive demos without failing local state audio tags
export const SAMPLE_AUDIO_BASE64 = "UklGRigAAABXQVZFRm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAAALQAAMgA=";
