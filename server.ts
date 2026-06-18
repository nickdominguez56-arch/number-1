import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up massive json limit since audio files are being sent directly as base64 in the post body
app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ limit: "500mb", extended: true }));

// Error handling for body parser
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: "Invalid JSON in request body" });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: "Payload too large. Audio file must be smaller than 500MB." });
  }
  next(err);
});

// Initialize the Google GenAI SDK (server-side only, leveraging GEMINI_API_KEY)
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not defined on the server.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// API Route: Transcribe FLAC Audio
app.post("/api/transcribe", async (req: express.Request, res: express.Response) => {
  try {
    const { fileName, fileBase64, fileSize, detectSpeakers, processingEngine } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: "Missing sound file content (fileBase64 is required)." });
    }

    const ai = getGeminiClient();

    // Prepare content parts for Gemini
    const audioPart = {
      inlineData: {
        mimeType: "audio/flac",
        data: fileBase64,
      },
    };

    const textPart = {
      text: "Please transcribe the attached audio. Follow the JSON output schema to provide details about speakers, clear timestamp segments (MM:SS), an overall display title, short meeting summary, key topics, and action items if applicable.",
    };

    // Dynamically engineer the system instruction prompt based on user's selected preferences
    let systemInstruction = "You are an expert audio transcription systems integrator. Your task is to transcribe the provided FLAC audio file verbatim and structure the transcript dynamically into sequential timeline segments with timestamps. In addition, construct high-quality cognitive layers such as a contextual display title, a concise overall summary, a list of primary themes/key topics discussed, and action items. Generate clean, well-formulated segment times (e.g. 00:05, 01:23) matching the dialogue flows.";

    if (detectSpeakers !== false) {
      systemInstruction += " Explicitly identify each distinct speaker and tag each timeline segment with their corresponding label (e.g. 'Speaker 1', 'Speaker 2', or identified participant names if evident in text).";
    } else {
      systemInstruction += " Do NOT perform multi-speaker diarization; instead, group dialogue blocks chronologically under a unified 'Speaker' tag.";
    }

    if (processingEngine === "whisper") {
      systemInstruction += " Focus with extreme precision on literal word-for-word transcript accuracy and precise vocal audio alignment, limiting synthetic smoothing of verbatim speech patterns.";
    } else {
      systemInstruction += " Focus on providing high-fidelity cognitive insights, smooth dialogue flow formatting, and rich action items mapping.";
    }

    // Use gemini-3.5-flash as the primary fast, accurate multimodal model
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [audioPart, textPart],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "A professional and contextual display title for the transcription.",
            },
            summary: {
              type: Type.STRING,
              description: "A highly informative, concise summary of the audio contents.",
            },
            keyTopics: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Primary keywords, concepts, or topics explored in the dialogue.",
            },
            actionItems: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Explicit action items, tasks, next steps, or conclusions drawn.",
            },
            segments: {
              type: Type.ARRAY,
              description: "Consecutive audio segments mapped to starting and ending timelines.",
              items: {
                type: Type.OBJECT,
                properties: {
                  speaker: {
                    type: Type.STRING,
                    description: "Represent the speaker label, e.g. Speaker 1, Interviewer, Participant.",
                  },
                  startTime: {
                    type: Type.STRING,
                    description: "Timestamp when the speaker begins (format MM:SS or HH:MM:SS).",
                  },
                  endTime: {
                    type: Type.STRING,
                    description: "Timestamp when the speaker finishes (format MM:SS or HH:MM:SS).",
                  },
                  text: {
                    type: Type.STRING,
                    description: "Verbatim transcribed words spoken in this segment.",
                  },
                },
                required: ["speaker", "startTime", "endTime", "text"],
              },
            },
          },
          required: ["title", "summary", "keyTopics", "actionItems", "segments"],
        },
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response received from the Gemini Transcription model.");
    }

    try {
      const parsed = JSON.parse(resultText);
      return res.json(parsed);
    } catch (parseErr) {
      console.error("Malformed JSON received from model:", resultText, parseErr);
      return res.status(500).json({
        error: "Failed to parse transcription response as structural JSON.",
        rawText: resultText,
      });
    }

  } catch (error: any) {
    console.error("Transcription error on server:", error);
    return res.status(500).json({ error: error.message || "An unexpected transcription error occurred." });
  }
});

// Bootstrapping the Server and handling Express/Vite Dev vs. Prod environments
async function bootstrap() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // Serve index.html globally as wildcard route matching (using express v4 compatible syntax)
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running in ${process.env.NODE_ENV || "development"} mode on http://localhost:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error("Failed to bootstrap fullstack server:", err);
  process.exit(1);
});
