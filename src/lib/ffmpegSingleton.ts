import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoaded = false;
let loadingPromise: Promise<FFmpeg> | null = null;

export type ProgressCallback = (percent: number, status: string) => void;

const BASE_URL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";

export async function getSharedFFmpeg(onProgress?: ProgressCallback): Promise<FFmpeg> {
  if (ffmpegInstance && ffmpegLoaded) return ffmpegInstance;

  // Prevent multiple simultaneous loads
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const ffmpeg = new FFmpeg();

    ffmpeg.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });

    onProgress?.(2, "Baixando motor de vídeo (~30MB, só na 1ª vez)...");

    try {
      // Use direct URLs for UMD build (no blob conversion needed)
      const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript");
      onProgress?.(5, "Baixando motor de vídeo (WASM)...");

      const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm");
      onProgress?.(8, "Inicializando motor de vídeo...");

      // Load with timeout to prevent infinite hang
      const loadPromise = ffmpeg.load({ coreURL, wasmURL });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("FFmpeg load timeout (60s). Recarregue a página e tente novamente.")), 60000)
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
      throw e;
    }
  })();

  return loadingPromise;
}
