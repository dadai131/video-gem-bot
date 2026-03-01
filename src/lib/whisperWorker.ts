// Web Worker for Whisper transcription using @huggingface/transformers
// This file runs in a dedicated Web Worker to avoid blocking the UI

import { pipeline } from "@huggingface/transformers";

interface WhisperMessage {
  type: "transcribe";
  audioData: ArrayBuffer;
}

interface WhisperResult {
  type: "progress" | "result" | "error";
  progress?: number;
  status?: string;
  segments?: { start: number; end: number; text: string }[];
  error?: string;
}

let transcriber: any = null;

async function loadModel() {
  self.postMessage({
    type: "progress",
    progress: 5,
    status: "Carregando modelo Whisper (~75MB na primeira vez)...",
  } as WhisperResult);

  transcriber = await pipeline(
    "automatic-speech-recognition",
    "onnx-community/whisper-tiny",
    {
      dtype: "q8",
      device: "wasm",
      progress_callback: (p: any) => {
        if (p.status === "progress" && p.progress) {
          self.postMessage({
            type: "progress",
            progress: 5 + Math.round(p.progress * 0.4),
            status: `Baixando modelo... ${Math.round(p.progress)}%`,
          } as WhisperResult);
        }
      },
    }
  );

  self.postMessage({
    type: "progress",
    progress: 50,
    status: "Modelo carregado! Iniciando transcrição...",
  } as WhisperResult);
}

self.onmessage = async (event: MessageEvent<WhisperMessage>) => {
  if (event.data.type !== "transcribe") return;

  try {
    if (!transcriber) {
      await loadModel();
    }

    self.postMessage({
      type: "progress",
      progress: 55,
      status: "Transcrevendo áudio...",
    } as WhisperResult);

    const audioBlob = new Blob([event.data.audioData], { type: "audio/wav" });

    const result = await transcriber(audioBlob, {
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "portuguese",
      task: "transcribe",
    });

    self.postMessage({
      type: "progress",
      progress: 95,
      status: "Finalizando transcrição...",
    } as WhisperResult);

    const segments = (result.chunks || []).map(
      (chunk: any, i: number) => ({
        start: chunk.timestamp?.[0] ?? i * 5,
        end: chunk.timestamp?.[1] ?? (i + 1) * 5,
        text: (chunk.text || "").trim(),
      })
    ).filter((s: any) => s.text.length > 0);

    // If no chunks, use full text as single segment
    if (segments.length === 0 && result.text) {
      segments.push({ start: 0, end: 30, text: result.text.trim() });
    }

    self.postMessage({
      type: "result",
      progress: 100,
      status: "Transcrição concluída!",
      segments,
    } as WhisperResult);
  } catch (err: any) {
    self.postMessage({
      type: "error",
      error: err.message || "Erro na transcrição",
    } as WhisperResult);
  }
};
