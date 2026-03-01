import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { analyzeVideoLocally, type Clip } from "@/lib/videoAnalyzer";
import { cutVideoClip, cutAllClips, downloadBlob } from "@/lib/videoCutter";
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

  const playerRef = useRef<HTMLIFrameElement>(null);
  const nativePlayerRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-start if URL came from query params
  useEffect(() => {
    if (initialUrl) handleGenerateYoutube(initialUrl);
  }, []);

  // Cleanup object URL
  useEffect(() => {
    return () => {
      if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
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

      // supabase-js puts non-2xx body in data even when error is set
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

      const objUrl = URL.createObjectURL(uploadedFile);
      if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(objUrl);
      setClips(resultClips);
      setActiveClip(0);
      setPhase("results");
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
        }
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
        }
      );

      for (const { blob, title } of results) {
        const safeName = title.replace(/[^a-zA-Z0-9À-ú\s-]/g, "").trim().replace(/\s+/g, "_");
        downloadBlob(blob, `${safeName}.mp4`);
        // Small delay between downloads
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

  const nextClip = () => playClip((activeClip + 1) % clips.length);
  const prevClip = () => playClip((activeClip - 1 + clips.length) % clips.length);

  const resetAll = () => {
    setPhase("input");
    setClips([]);
    setVideoId(null);
    setUploadedFile(null);
    if (localVideoUrl) {
      URL.revokeObjectURL(localVideoUrl);
      setLocalVideoUrl(null);
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 px-6 pb-16 max-w-5xl mx-auto">
        {/* Input Area */}
        {phase !== "results" && (
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
                    disabled={phase === "processing"}
                  >
                    <Scissors className="w-4 h-4" />
                    Analisar Vídeo
                  </Button>
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
                      : uploadedFile
                        ? "border-primary/40 bg-primary/5"
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
                  {uploadedFile ? (
                    <div className="flex flex-col items-center gap-3">
                      <FileVideo className="w-10 h-10 text-primary" />
                      <p className="font-semibold text-sm">{uploadedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(uploadedFile.size / 1024 / 1024).toFixed(1)} MB
                      </p>
                      <p className="text-xs text-muted-foreground">Clique para trocar o arquivo</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <Upload className="w-10 h-10 text-muted-foreground" />
                      <p className="font-semibold text-sm">Arraste um vídeo aqui ou clique para selecionar</p>
                      <p className="text-xs text-muted-foreground">MP4, WebM, MOV ou MKV</p>
                    </div>
                  )}
                </div>
                {uploadedFile && (
                  <Button
                    onClick={handleAnalyzeUpload}
                    size="lg"
                    className="mt-4 h-12 px-8 gap-2 glow-primary font-semibold w-full sm:w-auto"
                    disabled={phase === "processing"}
                  >
                    <Scissors className="w-4 h-4" />
                    Analisar Vídeo Localmente
                  </Button>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Processing */}
        {phase === "processing" && (
          <div className="glass rounded-2xl p-10 text-center animate-fade-in">
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
          </div>
        )}

        {/* Cutting progress overlay */}
        {isCutting && phase === "results" && (
          <div className="glass rounded-2xl p-6 mb-6 animate-fade-in">
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

        {/* Results */}
        {phase === "results" && clips.length > 0 && (
          <div className="animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold">
                Melhores <span className="text-gradient">momentos</span>
              </h2>
              <div className="flex items-center gap-2">
                {mode === "upload" && uploadedFile && (
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
                )}
                <Button variant="outline" size="sm" className="gap-2" onClick={resetAll}>
                  <RefreshCw className="w-4 h-4" />
                  Novo vídeo
                </Button>
              </div>
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
                        className="w-full h-full bg-black"
                      />
                    ) : null}
                  </div>
                  {/* Player controls */}
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
                    {/* Download button for upload mode */}
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
          </div>
        )}

        {/* Empty state */}
        {phase === "input" && !uploadedFile && mode === "youtube" && (
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

        {phase === "input" && mode === "upload" && !uploadedFile && (
          <div className="text-center py-20 animate-fade-in">
            <div className="w-20 h-20 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-6">
              <FileVideo className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">Faça upload de um vídeo</h3>
            <p className="text-muted-foreground text-sm">
              A análise roda 100% no seu navegador — sem custos e sem enviar dados.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppPage;
