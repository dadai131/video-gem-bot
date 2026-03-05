import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;

export type ProgressCallback = (percent: number, status: string) => void;

export async function getSharedFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });

    onProgress?.(2, "Preparando motor de vídeo...");

    try {
      const CORE_VERSION = "0.12.6";
      const CDN = `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/umd`;

      onProgress?.(5, "Baixando motor de vídeo (~30MB, só na 1ª vez)...");

      // Use toBlobURL which handles fetch + blob creation properly
      const coreURL = await toBlobURL(`${CDN}/ffmpeg-core.js`, "text/javascript");

      onProgress?.(7, "Baixando WASM...");

      const wasmURL = await toBlobURL(`${CDN}/ffmpeg-core.wasm`, "application/wasm");

      onProgress?.(9, "Inicializando motor de vídeo...");

      // Load without workerURL to force single-threaded mode (no SharedArrayBuffer needed)
      const loadPromise = ffmpeg.load({
        coreURL,
        wasmURL,
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("FFmpeg load timeout (120s). Recarregue a página.")), 120000)
      );

      await Promise.race([loadPromise, timeoutPromise]);

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
