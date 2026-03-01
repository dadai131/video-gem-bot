import { fetchFile } from "@ffmpeg/util";
import { getSharedFFmpeg, type ProgressCallback } from "./ffmpegSingleton";

export async function cutVideoClip(
  file: File,
  startSeconds: number,
  endSeconds: number,
  clipIndex: number,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress(5, "Carregando motor de edição...");
  const ffmpeg = await getSharedFFmpeg(onProgress);

  onProgress(20, "Preparando vídeo...");

  const inputName = "input" + clipIndex + "." + getExtension(file.name);
  const outputName = `clip_${clipIndex + 1}.mp4`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress(30, "Cortando vídeo...");

  const duration = endSeconds - startSeconds;

  ffmpeg.on("progress", ({ progress }) => {
    onProgress(30 + Math.round(progress * 60), "Cortando vídeo...");
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

export async function cutAllClips(
  file: File,
  clips: { start_seconds: number; end_seconds: number; title: string }[],
  onProgress: (clipIndex: number, percent: number, status: string) => void
): Promise<{ blob: Blob; title: string }[]> {
  const results: { blob: Blob; title: string }[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const blob = await cutVideoClip(
      file,
      clip.start_seconds,
      clip.end_seconds,
      i,
      (pct, status) => onProgress(i, pct, status)
    );
    results.push({ blob, title: clip.title });
  }

  return results;
}

function getExtension(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "mov") return "mov";
  if (ext === "webm") return "webm";
  if (ext === "mkv") return "mkv";
  return "mp4";
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
