export type ProgressCallback = (percent: number, status: string) => void;

/**
 * Cut a video clip using MediaRecorder + Canvas (no FFmpeg needed).
 * Records the video playing on a canvas from startSeconds to endSeconds.
 */
export async function cutVideoClip(
  file: File,
  startSeconds: number,
  endSeconds: number,
  clipIndex: number,
  onProgress: ProgressCallback
): Promise<Blob> {
  onProgress(5, "Preparando vídeo...");
  return recordVideoSegment(file, startSeconds, endSeconds, onProgress);
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

/**
 * Record a segment of a video using Canvas + MediaRecorder.
 * This approach works in all modern browsers without WASM or special headers.
 */
async function recordVideoSegment(
  file: File,
  startSeconds: number,
  endSeconds: number,
  onProgress: ProgressCallback
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

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

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
