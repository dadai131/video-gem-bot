import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

type CutProgressCallback = (percent: number, status: string) => void;

async function getFFmpeg(onProgress?: CutProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg]", message);
  });

  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.round(progress * 100), "Cortando vídeo...");
  });

  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";

  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });

  ffmpegInstance = ffmpeg;
  ffmpegLoaded = true;
  return ffmpeg;
}

export async function cutVideoClip(
  file: File,
  startSeconds: number,
  endSeconds: number,
  clipIndex: number,
  onProgress: CutProgressCallback
): Promise<Blob> {
  onProgress(5, "Carregando motor de edição...");

  const ffmpeg = await getFFmpeg(onProgress);

  onProgress(20, "Preparando vídeo...");

  const inputName = "input" + clipIndex + "." + getExtension(file.name);
  const outputName = `clip_${clipIndex + 1}.mp4`;

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  onProgress(30, "Cortando vídeo...");

  const duration = endSeconds - startSeconds;

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

  // Cleanup
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
