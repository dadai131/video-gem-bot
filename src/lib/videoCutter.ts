import type { SubtitleSegment } from "./subtitleUtils";

export type VideoFormat = "original" | "9:16";
export type ProgressCallback = (percent: number, status: string) => void;

/**
 * Pick the best available MIME type for MediaRecorder.
 * Prefer MP4 (available in modern Chrome/Edge), fallback to WebM.
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
    if (MediaRecorder.isTypeSupported(mime)) {
      console.log("[Recorder] Using MIME:", mime);
      return mime;
    }
  }
  return "video/webm";
}

/**
 * Determine file extension from the MIME type used.
 */
function extFromMime(mime: string): string {
  return mime.startsWith("video/mp4") ? ".mp4" : ".webm";
}

/**
 * Cut a video clip using MediaRecorder + Canvas.
 * Records the video playing on a canvas from startSeconds to endSeconds.
 * Optionally burns subtitles and applies visual effects.
 */
export async function cutVideoClip(
  file: File,
  startSeconds: number,
  endSeconds: number,
  clipIndex: number,
  onProgress: ProgressCallback,
  subtitles?: SubtitleSegment[],
  autoEdit?: boolean,
  format: VideoFormat = "original"
): Promise<Blob> {
  onProgress(5, "Preparando vídeo...");
  return recordVideoSegment(file, startSeconds, endSeconds, onProgress, subtitles, autoEdit, format);
}

export async function cutAllClips(
  file: File,
  clips: { start_seconds: number; end_seconds: number; title: string }[],
  onProgress: (clipIndex: number, percent: number, status: string) => void,
  subtitles?: SubtitleSegment[],
  autoEdit?: boolean,
  format: VideoFormat = "original"
): Promise<{ blob: Blob; title: string }[]> {
  const results: { blob: Blob; title: string }[] = [];

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const blob = await cutVideoClip(
      file,
      clip.start_seconds,
      clip.end_seconds,
      i,
      (pct, status) => onProgress(i, pct, status),
      subtitles,
      autoEdit,
      format
    );
    results.push({ blob, title: clip.title });
  }

  return results;
}

// ============ VISUAL EFFECTS ============

function applyKenBurns(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number,
  progress: number
) {
  const zoom = 1 + progress * 0.08;
  const dx = (canvasWidth * (zoom - 1)) / 2;
  const dy = (canvasHeight * (zoom - 1)) / 2;
  ctx.drawImage(video, -dx, -dy, canvasWidth * zoom, canvasHeight * zoom);
}

function applyFade(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  progress: number,
  duration: number
) {
  const fadeTime = Math.min(0.6, duration * 0.08);
  const fadeDuration = fadeTime / duration;
  let alpha = 0;
  if (progress < fadeDuration) {
    alpha = 1 - progress / fadeDuration;
  } else if (progress > 1 - fadeDuration) {
    alpha = (progress - (1 - fadeDuration)) / fadeDuration;
  }
  if (alpha > 0.01) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(alpha, 1)})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
}

function applyVignette(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
) {
  const cx = canvasWidth / 2;
  const cy = canvasHeight / 2;
  const radius = Math.max(cx, cy) * 1.2;
  const gradient = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}

function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasWidth: number,
  canvasHeight: number,
  segStart: number,
  segEnd: number,
  currentTime: number
) {
  // TikTok/Reels inspired style: Bold, Italic, Vibrant colors
  const fontSize = Math.round(canvasHeight / 12); // Slightly larger for better readability
  ctx.font = `italic 900 ${fontSize}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const upperText = text.toUpperCase();
  const words = upperText.split(/\s+/);
  const x = canvasWidth / 2;
  const y = canvasHeight - canvasHeight / 6; // Moved up slightly from the bottom

  const segDuration = segEnd - segStart;
  const segProgress = Math.max(0, Math.min(1, (currentTime - segStart) / segDuration));
  const activeWordIndex = Math.floor(segProgress * words.length);

  // Outline/Stroke styling (Black)
  ctx.strokeStyle = "black";
  ctx.lineWidth = fontSize / 6;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Shadow for extra pop
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 4;

  if (words.length === 0) return;

  // Single word case
  if (words.length === 1) {
    ctx.strokeText(upperText, x, y);
    ctx.fillStyle = "#FFDD00"; // Vibrant Yellow
    ctx.fillText(upperText, x, y);
    
    // Reset shadow
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }

  // Multi-word case with highlighted current word
  const wordMetrics = words.map(w => ctx.measureText(w).width);
  const spaceWidth = ctx.measureText(" ").width;
  const totalWidth = wordMetrics.reduce((a, b) => a + b, 0) + spaceWidth * (words.length - 1);
  
  let currentX = x - totalWidth / 2;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordWidth = wordMetrics[i];
    const wordCenterX = currentX + wordWidth / 2;

    // Draw stroke
    ctx.strokeText(word, wordCenterX, y);

    // Draw fill: Only the ACTIVE word is yellow, others are white
    ctx.fillStyle = i === activeWordIndex ? "#FFDD00" : "#FFFFFF";
    ctx.fillText(word, wordCenterX, y);

    currentX += wordWidth + spaceWidth;
  }

  // Reset shadow for subsequent draws
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

function applyColorGrade(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255, 200, 100, 0.06)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = "source-over";
}

function applyAltoEdit(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number
) {
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255, 180, 80, 0.10)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = "color";
  ctx.fillStyle = "rgba(0, 120, 130, 0.03)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(255, 255, 240, 0.04)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "contrast(1.06) saturate(1.12) brightness(1.03)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "source-over";
}

// ============ RECORDING ENGINE ============

async function recordVideoSegment(
  file: File,
  startSeconds: number,
  endSeconds: number,
  onProgress: ProgressCallback,
  subtitles?: SubtitleSegment[],
  autoEdit?: boolean,
  format: VideoFormat = "original"
): Promise<Blob> {
  const duration = endSeconds - startSeconds;

  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Não foi possível carregar o vídeo."));
  });

  onProgress(10, "Preparando gravação...");

  const canvas = document.createElement("canvas");
  const videoW = video.videoWidth || 1280;
  const videoH = video.videoHeight || 720;

  if (format === "9:16") {
    canvas.width = 1080;
    canvas.height = 1920;
  } else {
    canvas.width = videoW;
    canvas.height = videoH;
  }
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
    if (audioTrack) {
      combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        audioTrack,
      ]);
    } else {
      combinedStream = canvasStream;
    }
  } catch {
    combinedStream = canvasStream;
  }

  const mimeType = pickMimeType();

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: autoEdit ? 10_000_000 : 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  video.currentTime = startSeconds;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  onProgress(15, "Cortando vídeo com efeitos...");

  const clipSubtitles = subtitles?.filter(
    (s) => s.end > startSeconds && s.start < endSeconds
  ) || [];

  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = async () => {
      URL.revokeObjectURL(videoUrl);
      if (audioCtx) {
        try { await audioCtx.close(); } catch {}
      }
      
      // Build final blob with the recorded MIME type
      const finalBlob = new Blob(chunks, { type: mimeType });
      onProgress(100, "Pronto!");
      resolve(finalBlob);
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

      const elapsed = video.currentTime - startSeconds;
      const progress = Math.max(0, Math.min(1, elapsed / duration));

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (format === "9:16") {
        const scale = canvas.width / videoW;
        const drawW = canvas.width;
        const drawH = videoH * scale;
        const drawY = (canvas.height - drawH) / 2;
        const zoom = 1 + progress * 0.08;
        const zoomedW = drawW * zoom;
        const zoomedH = drawH * zoom;
        const dx = (drawW - zoomedW) / 2;
        const dy = drawY + (drawH - zoomedH) / 2;
        ctx.drawImage(video, dx, dy, zoomedW, zoomedH);
      } else {
        applyKenBurns(ctx, video, canvas.width, canvas.height, progress);
      }

      if (autoEdit) {
        applyAltoEdit(ctx, canvas, canvas.width, canvas.height);
      } else {
        applyColorGrade(ctx, canvas.width, canvas.height);
      }

      applyVignette(ctx, canvas.width, canvas.height);

      if (clipSubtitles.length > 0) {
        const currentTime = video.currentTime;
        const activeSeg = clipSubtitles.find(
          (s) => currentTime >= s.start && currentTime <= s.end
        );
        if (activeSeg) {
          drawSubtitle(ctx, activeSeg.text, canvas.width, canvas.height, activeSeg.start, activeSeg.end, currentTime);
        }
      }

      applyFade(ctx, canvas.width, canvas.height, progress, duration);

      const pct = 15 + Math.round(progress * 80);
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

export function downloadBlob(blob: Blob, filename: string) {
  // Determine extension from the actual blob type
  const ext = blob.type.startsWith("video/mp4") ? ".mp4" : ".webm";
  const name = filename.replace(/\.[^.]+$/, "") + ext;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
