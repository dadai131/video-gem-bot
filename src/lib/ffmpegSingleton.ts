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
      const coreURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript");
      onProgress?.(3, "Baixando motor de vídeo (WASM)...");
      
      const wasmURL = await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, "application/wasm");
      onProgress?.(8, "Inicializando motor de vídeo...");

      await ffmpeg.load({ coreURL, wasmURL });

      ffmpegInstance = ffmpeg;
      ffmpegLoaded = true;
      loadingPromise = null;
      onProgress?.(10, "Motor de vídeo pronto!");
      return ffmpeg;
    } catch (e) {
      loadingPromise = null;
      throw e;
    }
  })();

  return loadingPromise;
}
