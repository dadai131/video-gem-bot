import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Navbar from "@/components/Navbar";
import VideoTimeline from "@/components/VideoTimeline";
import SubtitleEditor from "@/components/SubtitleEditor";
import ExportDialog from "@/components/ExportDialog";
import YouTubeUploadDialog from "@/components/YouTubeUploadDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { analyzeVideoLocally, type Clip } from "@/lib/videoAnalyzer";
import { cutVideoClip, cutAllClips, downloadBlob, type VideoFormat } from "@/lib/videoCutter";
import { trimVideo, extractAudioWav } from "@/lib/videoEditor";
import type { SubtitleSegment } from "@/lib/subtitleUtils";
import {
  ArrowRight,
  Play,
  RefreshCw,
  Scissors,
  Flame,
  SkipForward,
  SkipBack,
  Upload,
  FileVideo,
  Download,
  Loader2,
  Film,
  Type,
  Search,
  Mic,
  Bell,
  Smartphone,
} from "lucide-react";

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const AppPage = () => {
  const [searchParams] = useSearchParams();
  const initialUrl = searchParams.get("url") || "";
  const [url, setUrl] = useState(initialUrl);
  const [phase, setPhase] = useState<"input" | "processing" | "results">("input");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [activeClip, setActiveClip] = useState<number>(0);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [youtubeTranscript, setYoutubeTranscript] = useState<string | null>(null);

  // Upload state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<"youtube" | "upload">(initialUrl ? "youtube" : "youtube");
  const [isDragging, setIsDragging] = useState(false);

  // Cutting state
  const [cuttingClip, setCuttingClip] = useState<number | null>(null);
  const [cuttingAll, setCuttingAll] = useState(false);
  const [cutProgress, setCutProgress] = useState(0);
  const [cutStatus, setCutStatus] = useState("");

  // YouTube download state
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [showYtdlpInstructions, setShowYtdlpInstructions] = useState(false);

  // Main tabs
  const [mainTab, setMainTab] = useState<string>("analyze");

  // Editor state
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  // Subtitle state
  const [subtitles, setSubtitles] = useState<SubtitleSegment[]>([]);
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [transcribeStatus, setTranscribeStatus] = useState("");

  // Alto Edit mode & format
  const [autoEdit, setAutoEdit] = useState(false);
  const [videoFormat, setVideoFormat] = useState<VideoFormat>("original");
  const whisperWorkerRef = useRef<Worker | null>(null);

  const playerRef = useRef<HTMLIFrameElement>(null);
  const nativePlayerRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-start if URL came from query params or file from hero upload
  useEffect(() => {
    if (initialUrl) {
      handleGenerateYoutube(initialUrl);
    } else if (searchParams.get("mode") === "upload") {
      const file = (window as any).__clipmaster_upload as File | undefined;
      if (file) {
        delete (window as any).__clipmaster_upload;
        handleFileSelect(file);
        setMode("upload");
      }
    }
  }, []);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    };
  }, [localVideoUrl]);

  // Track video time
  useEffect(() => {
    const video = nativePlayerRef.current;
    if (!video) return;
    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoaded = () => {
      const dur = video.duration;
      if (dur && isFinite(dur)) {
        setVideoDuration(dur);
        setTrimEnd(dur);
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("loadedmetadata", onLoaded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("loadedmetadata", onLoaded);
    };
  }, [localVideoUrl]);

  const handleGenerateYoutube = async (overrideUrl?: string) => {
    const targetUrl = overrideUrl || url;
    if (!targetUrl.trim()) return;

    setPhase("processing");
    setProgress(10);
    setStatusText("Extraindo transcrição do vídeo...");

    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 2, 85));
    }, 500);

    try {
      setProgress(20);
      setStatusText("Analisando transcrição com IA...");

      const response = await supabase.functions.invoke("analyze-video", {
        body: { url: targetUrl },
      });

      clearInterval(progressInterval);

      const data = response.data;
      const error = response.error;

      if (error) {
        const msg = data?.error || error.message || "Erro ao analisar vídeo";
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      setProgress(95);
      setStatusText("Preparando resultados...");

      setVideoId(data.videoId);
      setClips(data.clips || []);
      setActiveClip(0);

      // Store transcript for reference but don't parse into subtitles
      // YouTube mode only shows scene suggestions
      if (data.transcript) {
        setYoutubeTranscript(data.transcript);
      }

      await new Promise((r) => setTimeout(r, 500));
      setProgress(100);
      setPhase("results");
    } catch (e: any) {
      clearInterval(progressInterval);
      console.error(e);
      toast({
        title: "Erro",
        description: e.message || "Não foi possível analisar o vídeo.",
        variant: "destructive",
      });
      setPhase("input");
    }
  };

  const handleFileSelect = (file: File) => {
    const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Formato inválido",
        description: "Use arquivos MP4, WebM, MOV ou MKV.",
        variant: "destructive",
      });
      return;
    }
    setUploadedFile(file);
    // Immediately create preview URL
    const objUrl = URL.createObjectURL(file);
    if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
    setLocalVideoUrl(objUrl);
  };

  const handleAnalyzeUpload = async () => {
    if (!uploadedFile) return;

    setPhase("processing");
    setProgress(5);
    setStatusText("Carregando vídeo...");
    setVideoId(null);

    try {
      const resultClips = await analyzeVideoLocally(uploadedFile, (pct, status) => {
        setProgress(pct);
        setStatusText(status);
      });

      setClips(resultClips);
      setActiveClip(0);
      setPhase("results");
      setMainTab("analyze");
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro na análise",
        description: e.message || "Não foi possível analisar o vídeo.",
        variant: "destructive",
      });
      setPhase("input");
    }
  };

  const handleCutClip = async (index: number) => {
    if (!uploadedFile || cuttingClip !== null || cuttingAll) return;
    const clip = clips[index];
    if (!clip) return;

    setCuttingClip(index);
    setCutProgress(0);
    setCutStatus("Iniciando...");

    try {
      const blob = await cutVideoClip(
        uploadedFile,
        clip.start_seconds,
        clip.end_seconds,
        index,
        (pct, status) => {
          setCutProgress(pct);
          setCutStatus(status);
        },
        subtitles.length > 0 ? subtitles : undefined,
        autoEdit,
        videoFormat
      );

      const safeName = clip.title.replace(/[^a-zA-Z0-9À-ú\s-]/g, "").trim().replace(/\s+/g, "_");
      downloadBlob(blob, `${safeName}_clip${index + 1}.mp4`);

      toast({ title: "Clip exportado!", description: `"${clip.title}" salvo com sucesso.` });
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro ao cortar",
        description: e.message || "Não foi possível cortar o vídeo.",
        variant: "destructive",
      });
    } finally {
      setCuttingClip(null);
    }
  };

  const handleCutAll = async () => {
    if (!uploadedFile || cuttingClip !== null || cuttingAll) return;

    setCuttingAll(true);
    setCutProgress(0);

    try {
      const results = await cutAllClips(
        uploadedFile,
        clips,
        (clipIdx, pct, status) => {
          const overallPct = Math.round(((clipIdx + pct / 100) / clips.length) * 100);
          setCutProgress(overallPct);
          setCutStatus(`Cortando clip ${clipIdx + 1}/${clips.length}...`);
        },
        subtitles.length > 0 ? subtitles : undefined,
        autoEdit,
        videoFormat
      );

      for (const { blob, title } of results) {
        const safeName = title.replace(/[^a-zA-Z0-9À-ú\s-]/g, "").trim().replace(/\s+/g, "_");
        downloadBlob(blob, `${safeName}.mp4`);
        await new Promise((r) => setTimeout(r, 300));
      }

      toast({ title: "Todos os clips exportados!", description: `${results.length} clips salvos.` });
    } catch (e: any) {
      console.error(e);
      toast({
        title: "Erro ao cortar",
        description: e.message || "Não foi possível cortar os vídeos.",
        variant: "destructive",
      });
    } finally {
      setCuttingAll(false);
    }
  };

  const handleDownloadYoutube = async () => {
    if (!videoId || downloading) return;

    setDownloading(true);
    setDownloadStatus("Buscando link de download...");
    setShowYtdlpInstructions(false);

    try {
      const response = await supabase.functions.invoke("download-youtube", {
        body: { videoId },
      });

      const data = response.data;
      if (data?.error || response.error) {
        if (data?.fallback) {
          setShowYtdlpInstructions(true);
          toast({
            title: "Download automático indisponível",
            description: "Use o yt-dlp no seu PC para baixar o vídeo (instruções abaixo).",
            variant: "destructive",
          });
          return;
        }
        throw new Error(data?.error || response.error?.message || "Erro desconhecido");
      }

      setDownloadStatus("Baixando vídeo...");

      const videoUrl = data.type === "progressive" ? data.url : data.videoUrl;
      if (!videoUrl) throw new Error("URL de download não encontrada");

      const videoRes = await fetch(videoUrl);
      if (!videoRes.ok) throw new Error("Falha ao baixar o vídeo do YouTube");

      const blob = await videoRes.blob();
      const file = new File([blob], `youtube_${videoId}.mp4`, { type: "video/mp4" });

      setUploadedFile(file);
      const objUrl = URL.createObjectURL(file);
      if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(objUrl);
      setMode("upload");

      toast({
        title: "Vídeo baixado!",
        description: "Agora você pode usar as abas Editar e Legendar com Whisper.",
      });
    } catch (e: any) {
      console.error("Download YouTube error:", e);
      setShowYtdlpInstructions(true);
      toast({
        title: "Erro no download",
        description: e.message || "Não foi possível baixar o vídeo.",
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
      setDownloadStatus("");
    }
  };

  const handleTrimExport = async () => {
    if (!uploadedFile) return;
    setCutProgress(0);
    setCuttingAll(true);
    setCutStatus("Exportando trecho...");

    try {
      const blob = await trimVideo(uploadedFile, trimStart, trimEnd, (pct, status) => {
        setCutProgress(pct);
        setCutStatus(status);
      });
      const name = uploadedFile.name.replace(/\.[^.]+$/, "") + "_trim.mp4";
      downloadBlob(blob, name);
      toast({ title: "Vídeo cortado exportado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setCuttingAll(false);
    }
  };

  // Whisper transcription
  const handleTranscribe = async () => {
    if (!uploadedFile) return;

    setTranscribing(true);
    setTranscribeProgress(0);
    setTranscribeStatus("Extraindo áudio do vídeo...");

    try {
      // Step 1: Extract audio WAV
      const wavBlob = await extractAudioWav(uploadedFile, (pct, status) => {
        setTranscribeProgress(Math.round(pct * 0.3));
        setTranscribeStatus(status);
      });

      setTranscribeProgress(30);
      setTranscribeStatus("Iniciando Whisper...");

      // Step 2: Start whisper worker
      const audioBuffer = await wavBlob.arrayBuffer();

      const worker = new Worker(
        new URL("../lib/whisperWorker.ts", import.meta.url),
        { type: "module" }
      );
      whisperWorkerRef.current = worker;

      worker.onmessage = (event) => {
        const msg = event.data;
        if (msg.type === "progress") {
          setTranscribeProgress(30 + Math.round((msg.progress || 0) * 0.7));
          setTranscribeStatus(msg.status || "Processando...");
        } else if (msg.type === "result") {
          const segs: SubtitleSegment[] = (msg.segments || []).map(
            (s: any, i: number) => ({
              id: i + 1,
              start: s.start,
              end: s.end,
              text: s.text,
            })
          );
          setSubtitles(segs);
          setTranscribing(false);
          setTranscribeProgress(100);
          setTranscribeStatus("Transcrição concluída!");
          toast({
            title: "Legendas geradas!",
            description: `${segs.length} segmentos transcritos.`,
          });
          worker.terminate();
          whisperWorkerRef.current = null;
        } else if (msg.type === "error") {
          setTranscribing(false);
          toast({
            title: "Erro na transcrição",
            description: msg.error || "Falha ao transcrever.",
            variant: "destructive",
          });
          worker.terminate();
          whisperWorkerRef.current = null;
        }
      };

      worker.postMessage({ type: "transcribe", audioData: audioBuffer });
    } catch (e: any) {
      setTranscribing(false);
      toast({
        title: "Erro",
        description: e.message || "Não foi possível extrair o áudio.",
        variant: "destructive",
      });
    }
  };

  const playClip = (index: number) => {
    setActiveClip(index);
    const clip = clips[index];
    if (!clip) return;

    if (mode === "youtube" && videoId && playerRef.current) {
      playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.start_seconds)}&end=${Math.floor(clip.end_seconds)}&autoplay=1&rel=0`;
    } else if (mode === "upload" && nativePlayerRef.current) {
      nativePlayerRef.current.currentTime = clip.start_seconds;
      nativePlayerRef.current.play();
    }
  };

  const seekTo = (time: number) => {
    if (nativePlayerRef.current) {
      nativePlayerRef.current.currentTime = time;
    }
  };

  const nextClip = () => playClip((activeClip + 1) % clips.length);
  const prevClip = () => playClip((activeClip - 1 + clips.length) % clips.length);

  const resetAll = () => {
    setPhase("input");
    setClips([]);
    setVideoId(null);
    setUploadedFile(null);
    setSubtitles([]);
    setYoutubeTranscript(null);
    setTrimStart(0);
    setTrimEnd(0);
    setVideoDuration(0);
    setMainTab("analyze");
    setUrl("");
    setProgress(0);
    setStatusText("");
    setMode("youtube");
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(null);
    }
    if (whisperWorkerRef.current) {
      whisperWorkerRef.current.terminate();
      whisperWorkerRef.current = null;
    }
  };

  // Drag-and-drop handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback(() => setIsDragging(false), []);
  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, []);

  const isCutting = cuttingClip !== null || cuttingAll;
  const hasVideo = !!uploadedFile && !!localVideoUrl;
  const hasYoutubeResults = mode === "youtube" && phase === "results" && !!videoId;

  // ====== RENDER ======

  // Input phase (no video loaded yet)
  if (phase === "input" && !hasVideo) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-28 px-6 pb-16 max-w-5xl mx-auto">
          <div className="glass rounded-2xl p-6 mb-8">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "youtube" | "upload")}>
              <TabsList className="mb-4 bg-secondary/60">
                <TabsTrigger value="youtube" className="gap-2">
                  <Play className="w-3.5 h-3.5" />
                  YouTube
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="w-3.5 h-3.5" />
                  Upload de Arquivo
                </TabsTrigger>
              </TabsList>

              <TabsContent value="youtube">
                <label className="text-sm text-muted-foreground mb-2 block">Link do YouTube</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    type="url"
                    placeholder="https://youtube.com/watch?v=..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="flex-1 h-12 bg-secondary/80 border-border/60"
                  />
                  <Button
                    onClick={() => handleGenerateYoutube()}
                    size="lg"
                    className="h-12 px-8 gap-2 glow-primary font-semibold"
                    disabled={false}
                  >
                    <Scissors className="w-4 h-4" />
                    Analisar Vídeo
                  </Button>
                </div>

                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-border/60" />
                </div>

                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const file = e.dataTransfer.files[0];
                    if (file) {
                      handleFileSelect(file);
                      setMode("upload");
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:border-primary/30 hover:bg-secondary/30"
                  }`}
                >
                  <div className="flex items-center justify-center gap-3">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Arraste um vídeo aqui ou clique para fazer upload</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="upload">
                <div
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border/60 hover:border-primary/30 hover:bg-secondary/30"
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileSelect(f);
                    }}
                  />
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-muted-foreground" />
                    <p className="font-semibold text-sm">Arraste um vídeo aqui ou clique para selecionar</p>
                    <p className="text-xs text-muted-foreground">MP4, WebM, MOV ou MKV</p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Empty states */}
          {mode === "youtube" && (
            <div className="text-center py-20 animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-6">
                <ArrowRight className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">Cole um link acima para começar</h3>
              <p className="text-muted-foreground text-sm">
                A IA vai analisar a transcrição e identificar os melhores momentos para cortes.
              </p>
            </div>
          )}

          {mode === "upload" && (
            <div className="text-center py-20 animate-fade-in">
              <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-6">
                <FileVideo className="w-8 h-8 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold mb-2">Faça upload de um vídeo</h3>
              <p className="text-muted-foreground text-sm">
                A análise e edição rodam 100% no seu navegador — sem custos e sem enviar dados.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Processing phase
  if (phase === "processing") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-28 px-6 pb-16 max-w-5xl mx-auto">
          <div className="relative glass rounded-2xl p-10 text-center animate-fade-in">
            {/* Bell badge with percentage */}
            <div className="absolute -top-4 right-6 flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-1.5 rounded-full shadow-lg animate-bounce" style={{ animationDuration: "2s" }}>
              <Bell className="w-4 h-4" />
              <span className="text-sm font-bold">{Math.round(progress)}%</span>
            </div>

            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-pulse-glow">
              <Scissors className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: "3s" }} />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">
              {mode === "youtube" ? "Analisando seu vídeo com IA" : "Analisando vídeo no seu navegador"}
            </h3>
            <p className="text-primary text-sm font-medium mb-6">{statusText}</p>
            <Progress value={progress} className="h-2 mb-3" />
            <p className="text-xs text-muted-foreground">{Math.round(progress)}% concluído</p>
            {mode === "upload" && (
              <p className="text-xs text-muted-foreground mt-2">
                100% local — nenhum dado é enviado para servidores
              </p>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-6 gap-2 text-muted-foreground hover:text-destructive"
              onClick={resetAll}
            >
              <RefreshCw className="w-4 h-4" />
              Descartar e começar de novo
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Main workspace: video loaded (results or upload-only)
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 px-6 pb-16 max-w-6xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FileVideo className="w-5 h-5 text-primary" />
            <div>
              <h2 className="font-display text-lg font-bold truncate max-w-xs">
                {uploadedFile?.name || "Vídeo do YouTube"}
              </h2>
              {uploadedFile && (
                <p className="text-xs text-muted-foreground">
                  {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB • {formatTime(videoDuration)}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!uploadedFile && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      handleFileSelect(f);
                      setMode("upload");
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-4 h-4" />
                  Upload de arquivo
                </Button>
              </>
            )}
            {hasVideo && (
              <ExportDialog
                file={uploadedFile}
                subtitles={subtitles}
                trimStart={trimStart}
                trimEnd={trimEnd}
                duration={videoDuration}
              />
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={resetAll}>
              <RefreshCw className="w-4 h-4" />
              Novo vídeo
            </Button>
          </div>
        </div>

        {/* Cutting progress overlay */}
        {isCutting && (
          <div className="glass rounded-2xl p-4 mb-4 animate-fade-in">
            <div className="flex items-center gap-4">
              <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-semibold">{cutStatus}</p>
                <Progress value={cutProgress} className="h-1.5 mt-2" />
              </div>
              <span className="text-xs text-muted-foreground">{cutProgress}%</span>
            </div>
          </div>
        )}

        {/* Main tabs */}
        <Tabs value={mainTab} onValueChange={setMainTab}>
          <TabsList className="mb-4 bg-secondary/60">
            <TabsTrigger value="analyze" className="gap-2">
              <Search className="w-3.5 h-3.5" />
              Analisar
            </TabsTrigger>
            {hasVideo && (
              <TabsTrigger value="edit" className="gap-2">
                <Film className="w-3.5 h-3.5" />
                Editar
              </TabsTrigger>
            )}
            {hasVideo && (
              <TabsTrigger value="subtitles" className="gap-2">
                <Type className="w-3.5 h-3.5" />
                Legendar
              </TabsTrigger>
            )}
          </TabsList>

          {/* ========== ANALYZE TAB ========== */}
          <TabsContent value="analyze">
            {/* If uploaded but not analyzed yet */}
            {hasVideo && clips.length === 0 && (
              <div className="glass rounded-2xl p-8 text-center">
                <Search className="w-10 h-10 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-display text-lg font-semibold mb-2">Analisar vídeo</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Identifique automaticamente os melhores momentos do vídeo.
                </p>
                <Button onClick={handleAnalyzeUpload} className="gap-2 glow-primary">
                  <Scissors className="w-4 h-4" />
                  Analisar Vídeo Localmente
                </Button>
              </div>
            )}

            {/* Results */}
            {clips.length > 0 && (
              <div className="animate-slide-up">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-xl font-bold">
                    Melhores <span className="text-gradient">momentos</span>
                  </h2>
                  {mode === "upload" && uploadedFile && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant={videoFormat === "9:16" ? "default" : "outline"}
                        size="sm"
                        className={`gap-2 ${videoFormat === "9:16" ? "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white border-0 shadow-lg shadow-pink-500/25" : ""}`}
                        onClick={() => setVideoFormat(videoFormat === "9:16" ? "original" : "9:16")}
                      >
                        <Smartphone className="w-4 h-4" />
                        9:16
                      </Button>
                      <Button
                        variant={autoEdit ? "default" : "outline"}
                        size="sm"
                        className={`gap-2 ${autoEdit ? "bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0 shadow-lg shadow-amber-500/25" : ""}`}
                        onClick={() => setAutoEdit(!autoEdit)}
                      >
                        <Flame className="w-4 h-4" />
                        Alto Edit
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-2 glow-primary"
                        onClick={handleCutAll}
                        disabled={isCutting}
                      >
                        {cuttingAll ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Exportar todos
                      </Button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                  {/* Player */}
                  <div className="lg:col-span-3">
                    <div className="glass rounded-xl overflow-hidden">
                      <div className="aspect-video">
                        {mode === "youtube" && videoId ? (
                          <iframe
                            ref={playerRef}
                            src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(clips[activeClip]?.start_seconds || 0)}&end=${Math.floor(clips[activeClip]?.end_seconds || 0)}&autoplay=0&rel=0`}
                            className="w-full h-full"
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : localVideoUrl ? (
                          <video
                            ref={nativePlayerRef}
                            src={localVideoUrl}
                            controls
                            className="w-full h-full bg-background"
                          />
                        ) : null}
                      </div>
                      <div className="p-4 flex items-center justify-between">
                        <div>
                          <h3 className="font-display font-semibold text-sm">
                            {clips[activeClip]?.title}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatTime(clips[activeClip]?.start_seconds || 0)} → {formatTime(clips[activeClip]?.end_seconds || 0)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={prevClip}>
                            <SkipBack className="w-4 h-4" />
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            {activeClip + 1}/{clips.length}
                          </span>
                          <Button variant="ghost" size="icon" onClick={nextClip}>
                            <SkipForward className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Clips list */}
                  <div className="lg:col-span-2 space-y-3">
                    <p className="text-sm text-muted-foreground mb-2">
                      {clips.length} trechos identificados {mode === "youtube" ? "pela IA" : "pela análise local"}
                    </p>
                    {clips.map((clip, i) => (
                      <div
                        key={i}
                        className={`w-full text-left glass rounded-xl p-4 transition-all hover:border-primary/30 ${
                          activeClip === i ? "border-primary/50 glow-border" : ""
                        }`}
                      >
                        <div className="flex items-start gap-3 cursor-pointer" onClick={() => playClip(i)}>
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Play className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-display text-sm font-semibold truncate">
                              {clip.title}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatTime(clip.start_seconds)} → {formatTime(clip.end_seconds)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                              {clip.reason}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Flame className="w-3.5 h-3.5 text-primary" />
                            <span className="text-xs font-semibold text-primary">{clip.score}</span>
                          </div>
                        </div>
                        {mode === "upload" && uploadedFile && (
                          <div className="mt-3 pt-3 border-t border-border/30">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full gap-2 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCutClip(i);
                              }}
                              disabled={isCutting}
                            >
                              {cuttingClip === i ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5" />
                              )}
                              {cuttingClip === i ? "Cortando..." : "Exportar clip"}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Download YouTube video button */}
                {mode === "youtube" && videoId && !uploadedFile && (
                  <div className="mt-6 glass rounded-xl p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Download className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-semibold">Baixar vídeo para editar</h3>
                        <p className="text-xs text-muted-foreground">
                          Baixe o vídeo para usar as abas Editar e Legendar com Whisper
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={handleDownloadYoutube}
                      disabled={downloading}
                      className="w-full gap-2 glow-primary"
                    >
                      {downloading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                      {downloading ? downloadStatus : "Baixar vídeo do YouTube"}
                    </Button>

                    {showYtdlpInstructions && (
                      <div className="rounded-lg bg-secondary/50 p-4 space-y-2">
                        <p className="text-sm font-semibold text-foreground">
                          📥 Alternativa: baixe com yt-dlp no seu PC
                        </p>
                        <p className="text-xs text-muted-foreground">
                          O download automático não está disponível para este vídeo (proteção do YouTube).
                          Use o <strong>yt-dlp</strong> no seu computador:
                        </p>
                        <div className="rounded bg-background/80 p-3 font-mono text-xs space-y-1">
                          <p className="text-muted-foreground"># Instalar (precisa de Python):</p>
                          <p className="text-foreground">pip install yt-dlp</p>
                          <p className="text-muted-foreground mt-2"># Baixar vídeo MP4:</p>
                          <p className="text-foreground">yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]" --merge-output-format mp4 "https://youtube.com/watch?v={videoId}"</p>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Depois, faça upload do arquivo .mp4 aqui para editar e legendar.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* ========== EDIT TAB ========== */}
          <TabsContent value="edit">
            <div className="space-y-6">
              {/* Video preview */}
              <div className="glass rounded-xl overflow-hidden">
                <div className="aspect-video">
                  <video
                    ref={nativePlayerRef}
                    src={localVideoUrl || ""}
                    controls
                    className="w-full h-full bg-background"
                  />
                </div>
              </div>

              {/* Timeline */}
              <div className="glass rounded-xl p-4">
                <h3 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
                  <Scissors className="w-4 h-4 text-primary" />
                  Timeline — Cortar vídeo
                </h3>
                <VideoTimeline
                  duration={videoDuration}
                  currentTime={currentTime}
                  trimStart={trimStart}
                  trimEnd={trimEnd}
                  onTrimChange={(s, e) => {
                    setTrimStart(s);
                    setTrimEnd(e);
                  }}
                  onSeek={seekTo}
                  markers={clips.map((c) => ({
                    time: c.start_seconds,
                    label: c.title,
                  }))}
                />

                <div className="mt-4 flex items-center gap-3">
                  <Button
                    onClick={handleTrimExport}
                    disabled={isCutting}
                    className="gap-2"
                  >
                    {isCutting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4" />
                    )}
                    Exportar trecho selecionado
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    {formatTime(trimStart)} → {formatTime(trimEnd)} ({formatTime(trimEnd - trimStart)})
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ========== SUBTITLES TAB ========== */}
          <TabsContent value="subtitles">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Video preview */}
              <div className="space-y-4">
                <div className="glass rounded-xl overflow-hidden">
                  <div className="aspect-video relative">
                    {hasVideo ? (
                      <video
                        ref={nativePlayerRef}
                        src={localVideoUrl || ""}
                        controls
                        className="w-full h-full bg-background"
                      />
                    ) : null}
                  </div>
                </div>

                {/* Transcribe button - only for local files */}
                {hasVideo && (
                  <div className="glass rounded-xl p-4">
                    <Button
                      onClick={handleTranscribe}
                      disabled={transcribing}
                      className="w-full gap-2 glow-primary"
                    >
                      {transcribing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                      {transcribing ? "Transcrevendo..." : "Gerar legendas automaticamente"}
                    </Button>

                    {transcribing && (
                      <div className="mt-3">
                        <p className="text-xs text-muted-foreground mb-1">{transcribeStatus}</p>
                        <Progress value={transcribeProgress} className="h-1.5" />
                        <p className="text-xs text-muted-foreground mt-1">{transcribeProgress}%</p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mt-3">
                      Usa Whisper (IA) 100% no navegador. ~75MB na primeira vez (fica em cache).
                      Pode demorar alguns minutos dependendo do vídeo.
                    </p>
                  </div>
                )}

              </div>

              {/* Subtitle editor */}
              <div className="glass rounded-xl p-4">
                <h3 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
                  <Type className="w-4 h-4 text-primary" />
                  Editor de Legendas
                </h3>
                <SubtitleEditor
                  segments={subtitles}
                  onSegmentsChange={setSubtitles}
                  onSeekTo={seekTo}
                  filename={uploadedFile?.name.replace(/\.[^.]+$/, "") || "youtube_subtitles"}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default AppPage;
