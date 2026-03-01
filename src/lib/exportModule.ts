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
 * Export video with burned-in subtitles using Canvas + MediaRecorder.
 * Draws subtitle text directly on the canvas while recording.
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

  // Try to capture audio
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

  onProgress(10, "Renderizando vídeo com legendas...");

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

      // Draw active subtitles
      const activeSeg = segments.find(
        (s) => currentTime >= s.start && currentTime <= s.end
      );
      if (activeSeg) {
        const fontSize = Math.round(canvas.height / 15);
        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";

        const text = activeSeg.text.toUpperCase();
        const x = canvas.width / 2;
        const y = canvas.height - canvas.height / 8;

        // Black outline
        ctx.strokeStyle = "black";
        ctx.lineWidth = fontSize / 6;
        ctx.lineJoin = "round";
        ctx.strokeText(text, x, y);

        // Yellow fill
        ctx.fillStyle = "#FFD400";
        ctx.fillText(text, x, y);
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

    // Safety timeout
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

  // 1. Clean video (just copy)
  onProgress(5, "Exportando vídeo sem legenda...");
  const videoBlob = new Blob([await file.arrayBuffer()], { type: "video/mp4" });

  // 2. Burned subtitles
  const subtitledBlob = await exportWithBurnedSubtitles(file, srtContent, (p, s) => {
    onProgress(Math.round(10 + p * 0.9), s);
  });

  return { videoBlob, subtitledBlob };
}
