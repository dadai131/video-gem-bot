export type EditorProgressCallback = (percent: number, status: string) => void;

import type { ProgressCallback } from "./videoCutter";

/**
 * Pick best MIME for MediaRecorder. Prefer MP4, fallback WebM.
 */
function pickMimeType(): string {
  const candidates = [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "video/webm";
}

export async function trimVideo(
  file: File,
  startSeconds: number,
  endSeconds: number,
  onProgress: EditorProgressCallback
): Promise<Blob> {
  onProgress(5, "Preparando vídeo...");
  return recordSegment(file, startSeconds, endSeconds, onProgress);
}

export async function extractAudioWav(
  file: File,
  onProgress: EditorProgressCallback
): Promise<Blob> {
  onProgress(15, "Decodificando áudio do vídeo...");

  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

  onProgress(30, "Processando áudio...");
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  onProgress(60, "Convertendo para WAV...");
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  let samples: Float32Array;
  if (sampleRate !== 16000) {
    const ratio = sampleRate / 16000;
    const newLength = Math.floor(channelData.length / ratio);
    samples = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      samples[i] = channelData[Math.floor(i * ratio)];
    }
  } else {
    samples = channelData;
  }

  onProgress(80, "Gerando arquivo WAV...");
  const wavBuffer = encodeWAV(samples, 16000);

  await audioCtx.close();
  onProgress(100, "Áudio extraído!");
  return new Blob([wavBuffer], { type: "audio/wav" });
}

async function recordSegment(
  file: File,
  startSeconds: number,
  endSeconds: number,
  onProgress: EditorProgressCallback
): Promise<Blob> {
  const duration = endSeconds - startSeconds;

  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";

  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Não foi possível carregar o vídeo."));
  });

  onProgress(10, "Preparando gravação...");

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d")!;

  const canvasStream = canvas.captureStream(30);

  let combinedStream: MediaStream;
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    source.connect(silentGain);
    silentGain.connect(audioCtx.destination);

    const audioTrack = destination.stream.getAudioTracks()[0];
    combinedStream = audioTrack
      ? new MediaStream([...canvasStream.getVideoTracks(), audioTrack])
      : canvasStream;
  } catch {
    combinedStream = canvasStream;
  }

  const mimeType = pickMimeType();

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  video.currentTime = startSeconds;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  onProgress(15, "Cortando vídeo...");

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = async () => {
      URL.revokeObjectURL(videoUrl);
      if (audioCtx) {
        try { await audioCtx.close(); } catch {}
      }
      const blob = new Blob(chunks, { type: mimeType });
      onProgress(100, "Pronto!");
      resolve(blob);
    };

    recorder.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error("Erro na gravação do vídeo."));
    };

    let animFrame: number;
    const drawFrame = () => {
      if (video.currentTime >= endSeconds || video.ended) {
        cancelAnimationFrame(animFrame);
        video.pause();
        recorder.stop();
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const elapsed = video.currentTime - startSeconds;
      const pct = 15 + Math.round((elapsed / duration) * 80);
      onProgress(Math.min(pct, 95), `Cortando... ${Math.round(elapsed)}s / ${Math.round(duration)}s`);

      animFrame = requestAnimationFrame(drawFrame);
    };

    recorder.start(100);
    video.play().then(() => {
      drawFrame();
    }).catch(reject);

    setTimeout(() => {
      if (recorder.state === "recording") {
        video.pause();
        recorder.stop();
      }
    }, (duration + 5) * 1000);
  });
}

function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
