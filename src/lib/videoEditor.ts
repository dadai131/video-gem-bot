import { fetchFile } from "@ffmpeg/util";
import { getSharedFFmpeg, type ProgressCallback } from "./ffmpegSingleton";

export type EditorProgressCallback = ProgressCallback;

export async function trimVideo(
  file: File,
  startSeconds: number,
  endSeconds: number,
  onProgress: EditorProgressCallback
): Promise<Blob> {
  onProgress(5, "Carregando motor de edição...");
  const ffmpeg = await getSharedFFmpeg(onProgress);

  onProgress(15, "Preparando vídeo...");
  const inputName = "trim_input.mp4";
  const outputName = "trim_output.mp4";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress(30, "Cortando vídeo...");
  const duration = endSeconds - startSeconds;

  ffmpeg.on("progress", ({ progress }) => {
    onProgress(30 + Math.round(progress * 55), "Cortando vídeo...");
  });

  await ffmpeg.exec([
    "-i", inputName,
    "-ss", String(startSeconds),
    "-t", String(duration),
    "-c", "copy",
    "-avoid_negative_ts", "make_zero",
    outputName,
  ]);

  onProgress(90, "Finalizando...");
  const data = await ffmpeg.readFile(outputName) as Uint8Array;

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  onProgress(100, "Pronto!");
  return new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: "video/mp4" });
}

export async function splitVideo(
  file: File,
  splitPoints: number[],
  onProgress: EditorProgressCallback
): Promise<Blob[]> {
  onProgress(5, "Carregando motor de edição...");
  const ffmpeg = await getSharedFFmpeg(onProgress);

  const inputName = "split_input.mp4";
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  await new Promise<void>((r) => { video.onloadedmetadata = () => r(); });
  const totalDuration = video.duration;
  URL.revokeObjectURL(video.src);

  const points = [0, ...splitPoints.sort((a, b) => a - b), totalDuration];
  const results: Blob[] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const dur = points[i + 1] - start;
    const outName = `split_${i}.mp4`;

    const pct = 20 + (i / (points.length - 1)) * 70;
    onProgress(Math.round(pct), `Cortando parte ${i + 1}/${points.length - 1}...`);

    await ffmpeg.exec([
      "-i", inputName,
      "-ss", String(start),
      "-t", String(dur),
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      outName,
    ]);

    const data = await ffmpeg.readFile(outName) as Uint8Array;
    results.push(new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: "video/mp4" }));
    await ffmpeg.deleteFile(outName);
  }

  await ffmpeg.deleteFile(inputName);
  onProgress(100, "Pronto!");
  return results;
}

export async function removeSegments(
  file: File,
  segmentsToRemove: { start: number; end: number }[],
  onProgress: EditorProgressCallback
): Promise<Blob> {
  onProgress(5, "Carregando motor de edição...");
  const ffmpeg = await getSharedFFmpeg(onProgress);

  const inputName = "remove_input.mp4";
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const video = document.createElement("video");
  video.src = URL.createObjectURL(file);
  await new Promise<void>((r) => { video.onloadedmetadata = () => r(); });
  const totalDuration = video.duration;
  URL.revokeObjectURL(video.src);

  const sorted = [...segmentsToRemove].sort((a, b) => a.start - b.start);
  const keepSegments: { start: number; end: number }[] = [];
  let cursor = 0;

  for (const seg of sorted) {
    if (seg.start > cursor) {
      keepSegments.push({ start: cursor, end: seg.start });
    }
    cursor = Math.max(cursor, seg.end);
  }
  if (cursor < totalDuration) {
    keepSegments.push({ start: cursor, end: totalDuration });
  }

  if (keepSegments.length === 0) {
    throw new Error("Não há conteúdo restante após remover os trechos.");
  }

  const partFiles: string[] = [];
  for (let i = 0; i < keepSegments.length; i++) {
    const seg = keepSegments[i];
    const outName = `keep_${i}.mp4`;
    partFiles.push(outName);

    const pct = 15 + (i / keepSegments.length) * 60;
    onProgress(Math.round(pct), `Processando parte ${i + 1}/${keepSegments.length}...`);

    await ffmpeg.exec([
      "-i", inputName,
      "-ss", String(seg.start),
      "-t", String(seg.end - seg.start),
      "-c", "copy",
      "-avoid_negative_ts", "make_zero",
      outName,
    ]);
  }

  onProgress(80, "Concatenando...");
  const concatContent = partFiles.map((f) => `file '${f}'`).join("\n");
  await ffmpeg.writeFile("concat.txt", new TextEncoder().encode(concatContent));

  const finalOut = "remove_output.mp4";
  await ffmpeg.exec([
    "-f", "concat",
    "-safe", "0",
    "-i", "concat.txt",
    "-c", "copy",
    finalOut,
  ]);

  const data = await ffmpeg.readFile(finalOut) as Uint8Array;

  for (const f of partFiles) await ffmpeg.deleteFile(f);
  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile("concat.txt");
  await ffmpeg.deleteFile(finalOut);

  onProgress(100, "Pronto!");
  return new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: "video/mp4" });
}

export async function extractAudioWav(
  file: File,
  onProgress: EditorProgressCallback
): Promise<Blob> {
  // Try FFmpeg first, fall back to Web Audio API
  try {
    return await extractAudioWavFFmpeg(file, onProgress);
  } catch (e) {
    console.warn("[extractAudioWav] FFmpeg failed, using Web Audio API fallback:", e);
    onProgress(10, "Usando método alternativo de extração...");
    return await extractAudioWavWebAPI(file, onProgress);
  }
}

async function extractAudioWavFFmpeg(
  file: File,
  onProgress: EditorProgressCallback
): Promise<Blob> {
  onProgress(5, "Carregando motor de edição...");
  const ffmpeg = await getSharedFFmpeg(onProgress);

  const inputName = "audio_input.mp4";
  const outputName = "audio_output.wav";

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress(20, "Extraindo áudio...");

  ffmpeg.on("progress", ({ progress }) => {
    onProgress(20 + Math.round(progress * 65), "Extraindo áudio...");
  });

  await ffmpeg.exec([
    "-i", inputName,
    "-ar", "16000",
    "-ac", "1",
    "-f", "wav",
    outputName,
  ]);

  onProgress(90, "Finalizando...");
  const data = await ffmpeg.readFile(outputName) as Uint8Array;

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  onProgress(100, "Áudio extraído!");
  return new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: "audio/wav" });
}

async function extractAudioWavWebAPI(
  file: File,
  onProgress: EditorProgressCallback
): Promise<Blob> {
  onProgress(15, "Decodificando áudio do vídeo...");

  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

  onProgress(30, "Processando áudio...");
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  onProgress(60, "Convertendo para WAV...");
  // Get mono channel data
  const channelData = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;

  // Resample to 16000 Hz if needed
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
  // Build WAV file
  const wavBuffer = encodeWAV(samples, 16000);

  await audioCtx.close();
  onProgress(100, "Áudio extraído!");
  return new Blob([wavBuffer], { type: "audio/wav" });
}

function encodeWAV(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  // Convert float to int16
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
