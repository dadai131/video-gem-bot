export type ExportProgressCallback = (percent: number, status: string) => void;

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

/**
 * Draw subtitle with word-by-word highlight (matching videoCutter style).
 */
function drawSubtitleOnCanvas(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasWidth: number,
  canvasHeight: number,
  segStart: number,
  segEnd: number,
  currentTime: number
) {
  const fontSize = Math.round(canvasHeight / 14);
  ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const upperText = text.toUpperCase();
  const words = upperText.split(/\s+/);
  const x = canvasWidth / 2;
  const y = canvasHeight - canvasHeight / 8;

  const segDuration = segEnd - segStart;
  const segProgress = Math.max(0, Math.min(1, (currentTime - segStart) / segDuration));
  const activeWordIndex = Math.floor(segProgress * words.length);

  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  if (words.length <= 1) {
    ctx.strokeStyle = "black";
    ctx.lineWidth = fontSize / 5;
    ctx.lineJoin = "round";
    ctx.strokeText(upperText, x, y);
    ctx.fillStyle = "#FFD400";
    ctx.fillText(upperText, x, y);
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }

  const fullWidth = ctx.measureText(words.join(" ")).width;
  let startX = x - fullWidth / 2;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordWidth = ctx.measureText(word).width;
    const spaceWidth = ctx.measureText(" ").width;
    const wordX = startX + wordWidth / 2;

    ctx.strokeStyle = "black";
    ctx.lineWidth = fontSize / 5;
    ctx.lineJoin = "round";
    ctx.textAlign = "center";
    ctx.strokeText(word, wordX, y);

    ctx.fillStyle = i <= activeWordIndex ? "#FFD400" : "rgba(255, 255, 255, 0.85)";
    ctx.fillText(word, wordX, y);

    startX += wordWidth + spaceWidth;
  }

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Apply vignette effect.
 */
function applyVignette(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const radius = Math.max(cx, cy) * 1.2;
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Export video with burned-in subtitles using Canvas + MediaRecorder.
 * Includes visual effects: vignette, color grade, word-by-word subtitle highlight.
 */
export async function exportWithBurnedSubtitles(
  file: File,
  srtContent: string,
  onProgress: ExportProgressCallback
): Promise<Blob> {
  const segments = parseSRT(srtContent);
  if (segments.length === 0) {
    throw new Error("Nenhuma legenda encontrada para embutir.");
  }

  onProgress(5, "Preparando vídeo...");

  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";

  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Não foi possível carregar o vídeo."));
  });

  const totalDuration = video.duration;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d")!;

  const canvasStream = canvas.captureStream(30);

  let combinedStream: MediaStream;
  try {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    source.connect(audioCtx.destination);

    const audioTrack = destination.stream.getAudioTracks()[0];
    combinedStream = audioTrack
      ? new MediaStream([...canvasStream.getVideoTracks(), audioTrack])
      : canvasStream;
  } catch {
    combinedStream = canvasStream;
  }

  video.muted = true;

  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : "video/webm";

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  onProgress(10, "Renderizando vídeo com legendas e efeitos...");

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      URL.revokeObjectURL(videoUrl);
      const blob = new Blob(chunks, { type: mimeType });
      onProgress(100, "Exportação concluída!");
      resolve(blob);
    };

    recorder.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error("Erro na gravação do vídeo."));
    };

    let animFrame: number;
    const drawFrame = () => {
      if (video.ended) {
        cancelAnimationFrame(animFrame);
        video.pause();
        recorder.stop();
        return;
      }

      const currentTime = video.currentTime;

      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Color grade
      ctx.globalCompositeOperation = "overlay";
      ctx.fillStyle = "rgba(255, 200, 100, 0.06)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "soft-light";
      ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";

      // Vignette
      applyVignette(ctx, canvas.width, canvas.height);

      // Draw active subtitles with word highlight
      const activeSeg = segments.find(
        (s) => currentTime >= s.start && currentTime <= s.end
      );
      if (activeSeg) {
        drawSubtitleOnCanvas(
          ctx,
          activeSeg.text,
          canvas.width,
          canvas.height,
          activeSeg.start,
          activeSeg.end,
          currentTime
        );
      }

      // Progress
      const pct = 10 + Math.round((currentTime / totalDuration) * 85);
      onProgress(Math.min(pct, 95), "Renderizando vídeo com legendas...");

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
    }, (totalDuration + 10) * 1000);
  });
}

export async function exportVideoAndSubtitles(
  file: File,
  srtContent: string,
  onProgress: ExportProgressCallback
): Promise<{ videoBlob: Blob; subtitledBlob: Blob }> {
  onProgress(2, "Preparando exportação dupla...");

  onProgress(5, "Exportando vídeo sem legenda...");
  const videoBlob = new Blob([await file.arrayBuffer()], { type: "video/mp4" });

  const subtitledBlob = await exportWithBurnedSubtitles(file, srtContent, (p, s) => {
    onProgress(Math.round(10 + p * 0.9), s);
  });

  return { videoBlob, subtitledBlob };
}
