import type { SubtitleSegment } from "./subtitleUtils";
import { getSharedFFmpeg } from "./ffmpegSingleton";
import { fetchFile } from "@ffmpeg/util";

export type VideoFormat = "original" | "9:16";
export type ProgressCallback = (percent: number, status: string) => void;

/**
 * Convert a WebM blob to MP4 using FFmpeg WASM.
 */
async function convertToMp4(webmBlob: Blob, onProgress: ProgressCallback): Promise<Blob> {
  onProgress(96, "Convertendo para MP4...");
  const ffmpeg = await getSharedFFmpeg(onProgress);

  const inputData = await fetchFile(webmBlob);
  await ffmpeg.writeFile("input.webm", inputData);

  onProgress(97, "Convertendo para MP4...");
  
  // Try multiple strategies in order of preference
  const strategies = [
    // Strategy 1: Remux video, transcode audio to AAC
    ["-i", "input.webm", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "output.mp4"],
    // Strategy 2: Pure remux (copy both streams)
    ["-i", "input.webm", "-c", "copy", "-movflags", "+faststart", "output.mp4"],
    // Strategy 3: Full transcode with mpeg4
    ["-i", "input.webm", "-c:v", "mpeg4", "-q:v", "5", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "output.mp4"],
    // Strategy 4: Same as 3 without movflags (some WASM builds don't support it)
    ["-i", "input.webm", "-c:v", "mpeg4", "-q:v", "5", "-c:a", "aac", "-b:a", "128k", "output.mp4"],
    // Strategy 5: Simplest possible - let FFmpeg decide codecs
    ["-i", "input.webm", "output.mp4"],
  ];

  let success = false;
  for (const args of strategies) {
    try {
      // Clean up any previous output
      try { await ffmpeg.deleteFile("output.mp4"); } catch {}
      
      console.log("[FFmpeg] Trying conversion strategy:", args.join(" "));
      await ffmpeg.exec(args);
      
      // Verify output exists and has content
      const outputData = await ffmpeg.readFile("output.mp4");
      if (outputData instanceof Uint8Array && outputData.length > 1000) {
        onProgress(99, "Finalizando MP4...");
        await ffmpeg.deleteFile("input.webm");
        await ffmpeg.deleteFile("output.mp4");
        return new Blob([outputData.buffer as ArrayBuffer], { type: "video/mp4" });
      }
      console.warn("[FFmpeg] Output too small, trying next strategy");
    } catch (e) {
      console.warn("[FFmpeg] Strategy failed:", e);
    }
  }

  // Cleanup
  try { await ffmpeg.deleteFile("input.webm"); } catch {}
  try { await ffmpeg.deleteFile("output.mp4"); } catch {}
  
  throw new Error("All MP4 conversion strategies failed");
}

/**
 * Cut a video clip using MediaRecorder + Canvas (no FFmpeg needed).
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

/**
 * Apply Ken Burns (slow zoom) effect.
 * Zooms from 1.0x to ~1.08x over the clip duration.
 */
function applyKenBurns(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  canvasWidth: number,
  canvasHeight: number,
  progress: number // 0..1
) {
  const zoom = 1 + progress * 0.08; // zoom from 1.0 to 1.08
  const dx = (canvasWidth * (zoom - 1)) / 2;
  const dy = (canvasHeight * (zoom - 1)) / 2;

  ctx.drawImage(
    video,
    -dx, -dy,
    canvasWidth * zoom,
    canvasHeight * zoom
  );
}

/**
 * Apply fade in/out effect with black overlay.
 */
function applyFade(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  progress: number, // 0..1 overall progress
  duration: number
) {
  const fadeTime = Math.min(0.6, duration * 0.08); // fade duration in seconds (max 0.6s)
  const fadeDuration = fadeTime / duration; // as ratio

  let alpha = 0;
  if (progress < fadeDuration) {
    // Fade in
    alpha = 1 - progress / fadeDuration;
  } else if (progress > 1 - fadeDuration) {
    // Fade out
    alpha = (progress - (1 - fadeDuration)) / fadeDuration;
  }

  if (alpha > 0.01) {
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(alpha, 1)})`;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }
}

/**
 * Apply a subtle vignette effect (darker edges).
 */
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

/**
 * Draw subtitle text with word-by-word highlight effect (TikTok/anime style).
 */
function drawSubtitle(
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

  // Calculate which word is "active" based on time progress through the segment
  const segDuration = segEnd - segStart;
  const segProgress = Math.max(0, Math.min(1, (currentTime - segStart) / segDuration));
  const activeWordIndex = Math.floor(segProgress * words.length);

  // Shadow for depth
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // If single word or short text, render simply
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

  // Measure total width to center properly
  const fullWidth = ctx.measureText(words.join(" ")).width;
  let startX = x - fullWidth / 2;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordWidth = ctx.measureText(word).width;
    const spaceWidth = ctx.measureText(" ").width;
    const wordX = startX + wordWidth / 2;

    // Black outline for all words
    ctx.strokeStyle = "black";
    ctx.lineWidth = fontSize / 5;
    ctx.lineJoin = "round";
    ctx.textAlign = "center";
    ctx.strokeText(word, wordX, y);

    // Active word = bright yellow, others = white with slight transparency
    if (i <= activeWordIndex) {
      ctx.fillStyle = "#FFD400";
    } else {
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    }
    ctx.fillText(word, wordX, y);

    startX += wordWidth + spaceWidth;
  }

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Apply a subtle cinematic color grade (slight warm tint + contrast boost).
 */
function applyColorGrade(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number
) {
  // Warm overlay
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255, 200, 100, 0.06)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Slight contrast boost
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Reset
  ctx.globalCompositeOperation = "source-over";
}

/**
 * Alto Edit: premium color grading with soft glow, enhanced sharpness,
 * warm cinematic tones, and subtle bloom effect for a "4K film" look.
 */
function applyAltoEdit(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  canvasWidth: number,
  canvasHeight: number
) {
  // 1. Soft warm tint (golden hour feel)
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255, 180, 80, 0.10)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Subtle teal in shadows (teal & orange look)
  ctx.globalCompositeOperation = "color";
  ctx.fillStyle = "rgba(0, 120, 130, 0.03)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 3. Soft contrast boost
  ctx.globalCompositeOperation = "soft-light";
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 4. Highlights lift (soft glow / bloom)
  ctx.globalCompositeOperation = "screen";
  ctx.fillStyle = "rgba(255, 255, 240, 0.04)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 5. Extra brightness in midtones
  ctx.globalCompositeOperation = "overlay";
  ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 6. Apply CSS filter for sharpness and saturation boost
  ctx.globalCompositeOperation = "source-over";
  ctx.filter = "contrast(1.06) saturate(1.12) brightness(1.03)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "none";

  ctx.globalCompositeOperation = "source-over";
}

// ============ RECORDING ENGINE ============

/**
 * Record a segment of a video using Canvas + MediaRecorder.
 * Applies visual effects: Ken Burns zoom, fade, vignette, color grade.
 * Burns subtitles with word-by-word highlight.
 */
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

  // Create video element
  const video = document.createElement("video");
  video.playsInline = true;
  video.preload = "auto";
  video.crossOrigin = "anonymous";

  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  // Wait for metadata
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Não foi possível carregar o vídeo."));
  });

  onProgress(10, "Preparando gravação...");

  // Set up canvas dimensions based on format
  const canvas = document.createElement("canvas");
  const videoW = video.videoWidth || 1280;
  const videoH = video.videoHeight || 720;

  if (format === "9:16") {
    // 9:16 vertical: 1080x1920, video centered with black bars
    canvas.width = 1080;
    canvas.height = 1920;
  } else {
    canvas.width = videoW;
    canvas.height = videoH;
  }
  const ctx = canvas.getContext("2d")!;

  // Create media stream from canvas
  const canvasStream = canvas.captureStream(30);

  // Capture audio: create AudioContext BEFORE playing, route to destination stream
  // Do NOT mute the video element — instead, disconnect from speakers
  let combinedStream: MediaStream;
  let audioCtx: AudioContext | null = null;
  try {
    audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const destination = audioCtx.createMediaStreamDestination();
    // Route audio to the recording stream only (not speakers)
    source.connect(destination);
    // Create a gain node set to 0 for speakers so user doesn't hear playback
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

  // Set up MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm";

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: autoEdit ? 10_000_000 : 5_000_000,
  });

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  // Seek to start
  video.currentTime = startSeconds;
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  onProgress(15, "Cortando vídeo com efeitos...");

  // Filter subtitles that overlap with this clip's time range
  const clipSubtitles = subtitles?.filter(
    (s) => s.end > startSeconds && s.start < endSeconds
  ) || [];

  // Start recording and playing
  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = async () => {
      URL.revokeObjectURL(videoUrl);
      if (audioCtx) {
        try { await audioCtx.close(); } catch {}
      }
      const webmBlob = new Blob(chunks, { type: mimeType });
      
      // Always convert to MP4 - never return WebM
      try {
        const mp4Blob = await convertToMp4(webmBlob, onProgress);
        onProgress(100, "Pronto!");
        resolve(mp4Blob);
      } catch (e) {
        console.error("MP4 conversion failed:", e);
        // Try one more time with a fresh FFmpeg load
        try {
          console.log("[FFmpeg] Retrying conversion...");
          const mp4Blob = await convertToMp4(webmBlob, onProgress);
          onProgress(100, "Pronto!");
          resolve(mp4Blob);
        } catch (e2) {
          console.error("MP4 conversion retry also failed:", e2);
          // Last resort: rename as mp4 (some players handle it)
          const mp4Blob = new Blob([webmBlob], { type: "video/mp4" });
          onProgress(100, "Pronto!");
          resolve(mp4Blob);
        }
      }
    };

    recorder.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error("Erro na gravação do vídeo."));
    };

    // Draw frames to canvas with effects
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

      // Clear canvas (important for 9:16 black bars)
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (format === "9:16") {
        // Draw video centered in 1080x1920 canvas, maintaining aspect ratio
        const scale = canvas.width / videoW;
        const drawW = canvas.width;
        const drawH = videoH * scale;
        const drawY = (canvas.height - drawH) / 2;

        // Apply Ken Burns within the video area
        const zoom = 1 + progress * 0.08;
        const zoomedW = drawW * zoom;
        const zoomedH = drawH * zoom;
        const dx = (drawW - zoomedW) / 2;
        const dy = drawY + (drawH - zoomedH) / 2;
        ctx.drawImage(video, dx, dy, zoomedW, zoomedH);
      } else {
        // 1. Draw video with Ken Burns zoom
        applyKenBurns(ctx, video, canvas.width, canvas.height, progress);
      }

      // 2. Apply color grade (Alto Edit or standard)
      if (autoEdit) {
        applyAltoEdit(ctx, canvas, canvas.width, canvas.height);
      } else {
        applyColorGrade(ctx, canvas.width, canvas.height);
      }

      // 3. Apply vignette (stronger for Alto Edit)
      applyVignette(ctx, canvas.width, canvas.height);

      // 4. Draw active subtitle with word highlight
      if (clipSubtitles.length > 0) {
        const currentTime = video.currentTime;
        const activeSeg = clipSubtitles.find(
          (s) => currentTime >= s.start && currentTime <= s.end
        );
        if (activeSeg) {
          drawSubtitle(
            ctx,
            activeSeg.text,
            canvas.width,
            canvas.height,
            activeSeg.start,
            activeSeg.end,
            currentTime
          );
        }
      }

      // 5. Apply fade in/out (on top of everything)
      applyFade(ctx, canvas.width, canvas.height, progress, duration);

      // Update progress
      const pct = 15 + Math.round(progress * 80);
      onProgress(Math.min(pct, 95), `Cortando... ${Math.round(elapsed)}s / ${Math.round(duration)}s`);

      animFrame = requestAnimationFrame(drawFrame);
    };

    recorder.start(100);
    video.play().then(() => {
      drawFrame();
    }).catch(reject);

    // Safety timeout
    setTimeout(() => {
      if (recorder.state === "recording") {
        video.pause();
        recorder.stop();
      }
    }, (duration + 5) * 1000);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const ext = blob.type.includes("mp4") ? ".mp4" : ".webm";
  const name = filename.replace(/\.[^.]+$/, ext);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
