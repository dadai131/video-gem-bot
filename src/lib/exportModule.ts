import { fetchFile } from "@ffmpeg/util";
import { getSharedFFmpeg, type ProgressCallback } from "./ffmpegSingleton";

export type ExportProgressCallback = ProgressCallback;

function escapeDrawtext(text: string): string {
  // Escape special chars for FFmpeg drawtext filter
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/'/g, "'\\\\\\''")
    .replace(/:/g, "\\\\:")
    .replace(/\[/g, "\\\\[")
    .replace(/\]/g, "\\\\]")
    .replace(/%/g, "%%")
    .replace(/;/g, "\\\\;");
}

function parseSRT(srt: string): { start: number; end: number; text: string }[] {
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
    const text = lines.slice(2).join(" ").trim();
    result.push({ start, end, text });
  }
  return result;
}

function buildDrawtextFilter(segments: { start: number; end: number; text: string }[]): string {
  // Build chained drawtext filters for anime/TikTok style
  return segments.map((seg) => {
    const upperText = escapeDrawtext(seg.text.toUpperCase());
    return `drawtext=text='${upperText}':fontcolor=#FFD400:fontsize=48:borderw=4:bordercolor=black:shadowcolor=black:shadowx=3:shadowy=3:x=(w-text_w)/2:y=h-h/6:enable='between(t,${seg.start.toFixed(3)},${seg.end.toFixed(3)})'`;
  }).join(",");
}

export async function exportWithBurnedSubtitles(
  file: File,
  srtContent: string,
  onProgress: ExportProgressCallback
): Promise<Blob> {
  onProgress(5, "Carregando motor de exportação...");
  const ffmpeg = await getSharedFFmpeg(onProgress);

  const inputName = "burn_input.mp4";
  const outputName = "burn_output.mp4";

  onProgress(12, "Preparando vídeo...");
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const segments = parseSRT(srtContent);
  if (segments.length === 0) {
    throw new Error("Nenhuma legenda encontrada para embutir.");
  }

  onProgress(15, "Embutindo legendas (re-encode, pode demorar)...");

  // Build drawtext filter chain (works without libass)
  const vf = buildDrawtextFilter(segments);

  ffmpeg.on("progress", ({ progress }) => {
    onProgress(15 + Math.round(progress * 75), "Renderizando vídeo com legendas...");
  });

  await ffmpeg.exec([
    "-i", inputName,
    "-vf", vf,
    "-c:a", "copy",
    outputName,
  ]);

  onProgress(92, "Finalizando...");
  const data = await ffmpeg.readFile(outputName) as Uint8Array;

  await ffmpeg.deleteFile(inputName);
  await ffmpeg.deleteFile(outputName);

  onProgress(100, "Exportação concluída!");
  return new Blob([new Uint8Array(data.buffer as ArrayBuffer)], { type: "video/mp4" });
}

export async function exportVideoAndSubtitles(
  file: File,
  srtContent: string,
  onProgress: ExportProgressCallback
): Promise<{ videoBlob: Blob; subtitledBlob: Blob }> {
  // Export both: clean video + video with burned subtitles
  onProgress(2, "Preparando exportação dupla...");

  // 1. Clean video (just copy)
  onProgress(5, "Exportando vídeo sem legenda...");
  const videoBlob = new Blob([await file.arrayBuffer()], { type: "video/mp4" });

  // 2. Burned subtitles
  const subtitledBlob = await exportWithBurnedSubtitles(file, srtContent, (p, s) => {
    onProgress(Math.round(10 + p * 0.9), s);
  });

  return { videoBlob, subtitledBlob };
}
