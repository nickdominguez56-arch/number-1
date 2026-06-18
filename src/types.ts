export interface TranscriptSegment {
  speaker: string;
  startTime: string; // MM:SS or HH:MM:SS
  endTime: string; // MM:SS or HH:MM:SS
  text: string;
}

export interface TranscriptionResult {
  title: string;
  summary: string;
  keyTopics: string[];
  actionItems: string[];
  segments: TranscriptSegment[];
}

export interface TranscriptionRequest {
  fileName: string;
  fileBase64: string;
  fileSize: number;
}
