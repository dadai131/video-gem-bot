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
