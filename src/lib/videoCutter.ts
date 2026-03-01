import type { SubtitleSegment } from "./subtitleUtils";

export type ProgressCallback = (percent: number, status: string) => void;

/**
 * Cut a video clip using MediaRecorder + Canvas (no FFmpeg needed).
 * Records the video playing on a canvas from startSeconds to endSeconds.
 * Optionally burns subtitles into the clip.
 */
export async function cutVideoClip(
  file: File,
  startSeconds: number,
  endSeconds: number,
  clipIndex: number,
  onProgress: ProgressCallback,
  subtitles?: SubtitleSegment[]
): Promise<Blob> {
  onProgress(5, "Preparando vídeo...");
  return recordVideoSegment(file, startSeconds, endSeconds, onProgress, subtitles);
}

export async function cutAllClips(
  file: File,
  clips: { start_seconds: number; end_seconds: number; title: string }[],
  onProgress: (clipIndex: number, percent: number, status: string) => void,
  subtitles?: SubtitleSegment[]
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
      subtitles
    );
    results.push({ blob, title: clip.title });
  }

  return results;
}

/**
 * Draw subtitle text on a canvas context (anime/TikTok style).
 */
function drawSubtitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasWidth: number,
  canvasHeight: number
) {
  const fontSize = Math.round(canvasHeight / 14);
  ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";

  const upperText = text.toUpperCase();
  const x = canvasWidth / 2;
  const y = canvasHeight - canvasHeight / 8;

  // Shadow for depth
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Black outline
  ctx.strokeStyle = "black";
  ctx.lineWidth = fontSize / 5;
  ctx.lineJoin = "round";
  ctx.strokeText(upperText, x, y);

  // Yellow fill
  ctx.fillStyle = "#FFD400";
  ctx.fillText(upperText, x, y);

  // Reset shadow
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

/**
 * Record a segment of a video using Canvas + MediaRecorder.
 * This approach works in all modern browsers without WASM or special headers.
 * When subtitles are provided, they are burned into the video.
 */
async function recordVideoSegment(
  file: File,
  startSeconds: number,
  endSeconds: number,
  onProgress: ProgressCallback,
  subtitles?: SubtitleSegment[]
): Promise<Blob> {
  const duration = endSeconds - startSeconds;

  // Create video element
  const video = document.createElement("video");
  video.muted = false;
  video.playsInline = true;
  video.preload = "auto";

  const videoUrl = URL.createObjectURL(file);
  video.src = videoUrl;

  // Wait for metadata
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Não foi possível carregar o vídeo."));
  });

  onProgress(10, "Preparando gravação...");

  // Set up canvas with video dimensions
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d")!;

  // Create media stream from canvas
  const canvasStream = canvas.captureStream(30); // 30 fps

  // Try to capture audio from the video element
  let combinedStream: MediaStream;
  try {
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(video);
    const destination = audioCtx.createMediaStreamDestination();
    source.connect(destination);
    source.connect(audioCtx.destination); // So we can hear it (muted below)

    // Combine video (canvas) + audio tracks
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
    // If audio capture fails, just use video-only
    combinedStream = canvasStream;
  }

  // Mute the video element so user doesn't hear playback
  video.muted = true;

  // Set up MediaRecorder
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
    ? "video/webm;codecs=vp8,opus"
    : "video/webm";

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 5_000_000, // 5 Mbps
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

  onProgress(15, "Cortando vídeo...");

  // Filter subtitles that overlap with this clip's time range
  const clipSubtitles = subtitles?.filter(
    (s) => s.end > startSeconds && s.start < endSeconds
  ) || [];

  // Start recording and playing
  return new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      URL.revokeObjectURL(videoUrl);
      const blob = new Blob(chunks, { type: mimeType });
      onProgress(100, "Pronto!");
      resolve(blob);
    };

    recorder.onerror = (e) => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error("Erro na gravação do vídeo."));
    };

    // Draw frames to canvas
    let animFrame: number;
    const drawFrame = () => {
      if (video.currentTime >= endSeconds || video.ended) {
        cancelAnimationFrame(animFrame);
        video.pause();
        recorder.stop();
        return;
      }

      // Draw video frame
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Draw active subtitle if any
      if (clipSubtitles.length > 0) {
        const currentTime = video.currentTime;
        const activeSeg = clipSubtitles.find(
          (s) => currentTime >= s.start && currentTime <= s.end
        );
        if (activeSeg) {
          drawSubtitle(ctx, activeSeg.text, canvas.width, canvas.height);
        }
      }

      // Update progress
      const elapsed = video.currentTime - startSeconds;
      const pct = 15 + Math.round((elapsed / duration) * 80);
      onProgress(Math.min(pct, 95), `Cortando... ${Math.round(elapsed)}s / ${Math.round(duration)}s`);

      animFrame = requestAnimationFrame(drawFrame);
    };

    recorder.start(100); // Collect data every 100ms
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
  // Change extension to .webm since we use MediaRecorder
  const webmName = filename.replace(/\.[^.]+$/, ".webm");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = webmName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
