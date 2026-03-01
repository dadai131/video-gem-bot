import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL, fetchFile } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;

export type ExportProgressCallback = (percent: number, status: string) => void;

async function getFFmpeg(onProgress?: ExportProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }) => {
    console.log("[FFmpeg Export]", message);
  });

  ffmpeg.on("progress", ({ progress }) => {
    onProgress?.(Math.round(20 + progress * 70), "Renderizando vídeo...");
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

export async function exportWithBurnedSubtitles(
  file: File,
  srtContent: string,
  onProgress: ExportProgressCallback
): Promise<Blob> {
  onProgress(5, "Carregando motor de exportação...");
  const ffmpeg = await getFFmpeg(onProgress);

  const inputName = "burn_input.mp4";
  const srtName = "subtitles.srt";
  const outputName = "burn_output.mp4";

  await ffmpeg.writeFile(inputName, await fetchFile(file));
  await ffmpeg.writeFile(srtName, new TextEncoder().encode(srtContent));

  onProgress(15, "Embutindo legendas (re-encode, pode demorar)...");

  // Use drawtext-based subtitles since libass may not be available in ffmpeg.wasm
  // Parse SRT and create drawtext filter
  const lines = parseSRTForFilter(srtContent);
  
  if (lines.length === 0) {
    throw new Error("Nenhuma legenda encontrada para embutir.");
  }

  // Use subtitles filter
  await ffmpeg.exec([
    "-i", inputName,
    "-vf", `subtitles=${srtName}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Shadow=1'`,
    "-c:a", "copy",
    outputName,
  ]);

  onProgress(92, "Finalizando...");
  const data = await ffmpeg.readFile(outputName) as Uint8Array;

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(srtName);
  await ffmpeg.deleteFile(outputName);

  onProgress(100, "Exportação concluída!");
  return new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: "video/mp4" });
}

function parseSRTForFilter(srt: string): { start: number; end: number; text: string }[] {
  const blocks = srt.trim().split(/\n\n+/);
  const result: { start: number; end: number; text: string }[] = [];

  for (const block of blocks) {
    const lines = block.split("\n");
    if (lines.length < 3) continue;
    const match = lines[1].match(
      /(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/
    );
    if (!match) continue;

    const start = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 1000;
    const end = parseInt(match[5]) * 3600 + parseInt(match[6]) * 60 + parseInt(match[7]) + parseInt(match[8]) / 1000;
    const text = lines.slice(2).join(" ");
    result.push({ start, end, text });
  }
  return result;
}
