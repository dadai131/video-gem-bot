export type Clip = {
  title: string;
  start_seconds: number;
  end_seconds: number;
  score: number;
  reason: string;
};

type ProgressCallback = (percent: number, status: string) => void;

interface FrameScore {
  time: number;
  sceneChange: number;
  audioEnergy: number;
}

/**
 * Analyze a video file 100% in the browser using Canvas + Web Audio APIs.
 * Returns the top moments based on scene changes and audio peaks.
 */
export async function analyzeVideoLocally(
  file: File,
  onProgress: ProgressCallback
): Promise<Clip[]> {
  onProgress(5, "Carregando vídeo...");

  const videoUrl = URL.createObjectURL(file);

  try {
    // Step 1: Get video duration
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = videoUrl;

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Não foi possível carregar o vídeo."));
    });

    const duration = video.duration;
    if (!duration || !isFinite(duration)) {
      throw new Error("Duração do vídeo inválida.");
    }

    // Step 2: Extract scene change scores via Canvas
    onProgress(10, "Analisando mudanças de cena...");
    const sceneScores = await extractSceneChanges(video, duration, onProgress);

    // Step 3: Extract audio energy
    onProgress(60, "Analisando picos de áudio...");
    const audioScores = await extractAudioEnergy(file, duration, onProgress);

    // Step 4: Combine and find best moments
    onProgress(85, "Identificando melhores momentos...");
    const combined = combineScores(sceneScores, audioScores, duration);
    const clips = findBestClips(combined, duration);

    onProgress(100, "Análise concluída!");
    return clips;
  } finally {
    URL.revokeObjectURL(videoUrl);
  }
}

async function extractSceneChanges(
  video: HTMLVideoElement,
  duration: number,
  onProgress: ProgressCallback
): Promise<FrameScore[]> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Use a small resolution for fast comparison
  const W = 160;
  const H = 90;
  canvas.width = W;
  canvas.height = H;

  const interval = 1; // 1 frame per second
  const totalFrames = Math.floor(duration / interval);
  const scores: FrameScore[] = [];

  let prevData: Uint8ClampedArray | null = null;

  for (let i = 0; i <= totalFrames; i++) {
    const time = i * interval;
    video.currentTime = time;

    await new Promise<void>((resolve) => {
      const handler = () => {
        video.removeEventListener("seeked", handler);
        resolve();
      };
      video.addEventListener("seeked", handler);
    });

    ctx.drawImage(video, 0, 0, W, H);
    const imageData = ctx.getImageData(0, 0, W, H);
    const curData = imageData.data;

    let diff = 0;
    if (prevData) {
      // Calculate average RGB difference
      const pixelCount = W * H;
      let totalDiff = 0;
      for (let p = 0; p < curData.length; p += 4) {
        totalDiff +=
          Math.abs(curData[p] - prevData[p]) +
          Math.abs(curData[p + 1] - prevData[p + 1]) +
          Math.abs(curData[p + 2] - prevData[p + 2]);
      }
      diff = totalDiff / (pixelCount * 3 * 255); // Normalize 0-1
    }

    scores.push({ time, sceneChange: diff, audioEnergy: 0 });
    prevData = new Uint8ClampedArray(curData);

    // Progress: 10-55%
    const pct = 10 + (i / totalFrames) * 45;
    onProgress(Math.round(pct), `Analisando frame ${i + 1}/${totalFrames + 1}...`);
  }

  return scores;
}

async function extractAudioEnergy(
  file: File,
  duration: number,
  onProgress: ProgressCallback
): Promise<Map<number, number>> {
  const energyMap = new Map<number, number>();

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const windowSize = sampleRate; // 1 second windows

    const totalWindows = Math.floor(channelData.length / windowSize);

    for (let i = 0; i < totalWindows; i++) {
      const start = i * windowSize;
      let sumSquares = 0;
      for (let j = start; j < start + windowSize && j < channelData.length; j++) {
        sumSquares += channelData[j] * channelData[j];
      }
      const rms = Math.sqrt(sumSquares / windowSize);
      energyMap.set(i, rms);

      // Progress: 60-80%
      const pct = 60 + (i / totalWindows) * 20;
      onProgress(Math.round(pct), "Analisando áudio...");
    }

    await audioCtx.close();
  } catch {
    // Audio decode might fail for some formats - proceed with scene-only analysis
    console.warn("Não foi possível analisar o áudio. Usando apenas análise visual.");
  }

  return energyMap;
}

function combineScores(
  sceneScores: FrameScore[],
  audioEnergy: Map<number, number>,
  duration: number
): FrameScore[] {
  // Normalize audio energy
  const audioValues = Array.from(audioEnergy.values());
  const maxAudio = Math.max(...audioValues, 0.001);

  // Normalize scene change
  const maxScene = Math.max(...sceneScores.map((s) => s.sceneChange), 0.001);

  return sceneScores.map((s) => {
    const timeIndex = Math.floor(s.time);
    const normalizedAudio = (audioEnergy.get(timeIndex) || 0) / maxAudio;
    const normalizedScene = s.sceneChange / maxScene;

    return {
      time: s.time,
      sceneChange: normalizedScene,
      audioEnergy: normalizedAudio,
    };
  });
}

function findBestClips(scores: FrameScore[], duration: number): Clip[] {
  // Compute combined score per second
  const combined = scores.map((s) => ({
    time: s.time,
    score: s.sceneChange * 0.4 + s.audioEnergy * 0.6,
  }));

  // Find peaks (local maxima above threshold)
  const mean = combined.reduce((a, b) => a + b.score, 0) / combined.length;
  const threshold = mean * 1.5;

  const peaks = combined.filter((c) => c.score > threshold);

  if (peaks.length === 0) {
    // Fallback: just take evenly spaced clips
    return createEvenClips(duration);
  }

  // Group nearby peaks into clusters (within 20 seconds)
  const clusters: { times: number[]; maxScore: number }[] = [];
  for (const peak of peaks) {
    const lastCluster = clusters[clusters.length - 1];
    if (lastCluster && peak.time - lastCluster.times[lastCluster.times.length - 1] < 20) {
      lastCluster.times.push(peak.time);
      lastCluster.maxScore = Math.max(lastCluster.maxScore, peak.score);
    } else {
      clusters.push({ times: [peak.time], maxScore: peak.score });
    }
  }

  // Sort by score, take top 6
  clusters.sort((a, b) => b.maxScore - a.maxScore);
  const topClusters = clusters.slice(0, 6);

  // Sort by time for consistent ordering
  topClusters.sort((a, b) => a.times[0] - b.times[0]);

  return topClusters.map((cluster, i) => {
    const centerTime = cluster.times[Math.floor(cluster.times.length / 2)];
    const clipDuration = Math.min(30, Math.max(15, cluster.times.length * 2));
    const start = Math.max(0, centerTime - clipDuration / 2);
    const end = Math.min(duration, start + clipDuration);
    const scorePercent = Math.round(cluster.maxScore * 100);

    return {
      title: `Momento ${i + 1} — Alta intensidade`,
      start_seconds: Math.round(start),
      end_seconds: Math.round(end),
      score: Math.min(scorePercent, 100),
      reason: getClipReason(cluster, scores),
    };
  });
}

function getClipReason(
  cluster: { times: number[]; maxScore: number },
  scores: FrameScore[]
): string {
  const centerIdx = Math.floor(cluster.times.length / 2);
  const centerTime = cluster.times[centerIdx];
  const s = scores.find((sc) => sc.time === centerTime);

  if (!s) return "Momento de alta atividade detectado.";

  if (s.sceneChange > 0.6 && s.audioEnergy > 0.6) {
    return "Mudança visual intensa + pico de áudio. Trecho muito dinâmico.";
  } else if (s.sceneChange > 0.6) {
    return "Grande mudança visual — cortes rápidos ou transição de cena.";
  } else if (s.audioEnergy > 0.6) {
    return "Pico de energia no áudio — momento intenso ou empolgante.";
  }
  return "Combinação de atividade visual e sonora acima da média.";
}

function createEvenClips(duration: number): Clip[] {
  const count = Math.min(4, Math.floor(duration / 30));
  if (count === 0) {
    return [{
      title: "Vídeo completo",
      start_seconds: 0,
      end_seconds: Math.round(duration),
      score: 50,
      reason: "Vídeo curto — mostrando inteiro.",
    }];
  }

  const segmentLen = duration / count;
  return Array.from({ length: count }, (_, i) => ({
    title: `Trecho ${i + 1}`,
    start_seconds: Math.round(i * segmentLen),
    end_seconds: Math.round((i + 1) * segmentLen),
    score: 50,
    reason: "Distribuição uniforme — sem picos significativos detectados.",
  }));
}
