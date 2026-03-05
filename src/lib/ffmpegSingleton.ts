import { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;

export type ProgressCallback = (percent: number, status: string) => void;

export async function getSharedFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  // Prevent multiple simultaneous loads
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });

    onProgress?.(2, "Preparando motor de vídeo...");

    try {
      // Use jsdelivr CDN which has proper CORS headers
      // Match core version to the @ffmpeg/ffmpeg package version 0.12.10
      const CORE_VERSION = "0.12.6";
      const CDN = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

      onProgress?.(4, "Baixando motor de vídeo (~30MB, só na 1ª vez)...");

      // Fetch core JS as blob URL
      const coreResponse = await fetch(`${CDN}/ffmpeg-core.js`);
      if (!coreResponse.ok) throw new Error(`Failed to fetch ffmpeg-core.js: ${coreResponse.status}`);
      const coreBlob = new Blob([await coreResponse.text()], { type: "text/javascript" });
      const coreURL = URL.createObjectURL(coreBlob);

      onProgress?.(6, "Baixando WASM (~30MB)...");

      // Fetch WASM as blob URL
      const wasmResponse = await fetch(`${CDN}/ffmpeg-core.wasm`);
      if (!wasmResponse.ok) throw new Error(`Failed to fetch ffmpeg-core.wasm: ${wasmResponse.status}`);
      const wasmBlob = new Blob([await wasmResponse.arrayBuffer()], { type: "application/wasm" });
      const wasmURL = URL.createObjectURL(wasmBlob);

      onProgress?.(8, "Inicializando motor de vídeo...");

      // Load with timeout
      const loadPromise = ffmpeg.load({ coreURL, wasmURL });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("FFmpeg load timeout (90s). Recarregue a página e tente novamente.")), 90000)
      );

      await Promise.race([loadPromise, timeoutPromise]);

      // Cleanup blob URLs after successful load
      URL.revokeObjectURL(coreURL);
      URL.revokeObjectURL(wasmURL);

      ffmpegInstance = ffmpeg;
      ffmpegLoaded = true;
      loadingPromise = null;
      onProgress?.(10, "Motor de vídeo pronto!");
      return ffmpeg;
    } catch (e) {
      loadingPromise = null;
      ffmpegInstance = null;
      ffmpegLoaded = false;
      console.error("[FFmpeg] Load failed:", e);
      throw e;
    }
  })();

  return loadingPromise;
}
