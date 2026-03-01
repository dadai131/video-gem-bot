import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import Navbar from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  ArrowRight,
  Play,
  RefreshCw,
  Scissors,
  Flame,
  SkipForward,
  SkipBack,
} from "lucide-react";

type Clip = {
  title: string;
  start_seconds: number;
  end_seconds: number;
  score: number;
  reason: string;
};

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
  const playerRef = useRef<HTMLIFrameElement>(null);

  // Auto-start if URL came from query params
  useEffect(() => {
    if (initialUrl) handleGenerate(initialUrl);
  }, []);

  const handleGenerate = async (overrideUrl?: string) => {
    const targetUrl = overrideUrl || url;
    if (!targetUrl.trim()) return;

    setPhase("processing");
    setProgress(10);
    setStatusText("Extraindo transcrição do vídeo...");

    // Animate progress while waiting
    const progressInterval = setInterval(() => {
      setProgress((p) => Math.min(p + 2, 85));
    }, 500);

    try {
      setProgress(20);
      setStatusText("Analisando transcrição com IA...");

      const { data, error } = await supabase.functions.invoke("analyze-video", {
        body: { url: targetUrl },
      });

      clearInterval(progressInterval);

      if (error) throw new Error(error.message || "Erro ao analisar vídeo");
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

  const playClip = (index: number) => {
    setActiveClip(index);
    const clip = clips[index];
    if (!clip || !videoId) return;

    // Update iframe src to play from clip start
    if (playerRef.current) {
      playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.start_seconds)}&end=${Math.floor(clip.end_seconds)}&autoplay=1&rel=0`;
    }
  };

  const nextClip = () => {
    const next = (activeClip + 1) % clips.length;
    playClip(next);
  };

  const prevClip = () => {
    const prev = (activeClip - 1 + clips.length) % clips.length;
    playClip(prev);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 px-6 pb-16 max-w-5xl mx-auto">
        {/* URL Input */}
        <div className="glass rounded-2xl p-6 mb-8">
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
              onClick={() => handleGenerate()}
              size="lg"
              className="h-12 px-8 gap-2 glow-primary font-semibold"
              disabled={phase === "processing"}
            >
              <Scissors className="w-4 h-4" />
              Analisar Vídeo
            </Button>
          </div>
        </div>

        {/* Processing */}
        {phase === "processing" && (
          <div className="glass rounded-2xl p-10 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-pulse-glow">
              <Scissors className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: "3s" }} />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">Analisando seu vídeo com IA</h3>
            <p className="text-primary text-sm font-medium mb-6">{statusText}</p>
            <Progress value={progress} className="h-2 mb-3" />
            <p className="text-xs text-muted-foreground">{Math.round(progress)}% concluído</p>
          </div>
        )}

        {/* Results */}
        {phase === "results" && videoId && clips.length > 0 && (
          <div className="animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold">
                Melhores <span className="text-gradient">momentos</span>
              </h2>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => {
                  setPhase("input");
                  setClips([]);
                  setVideoId(null);
                }}
              >
                <RefreshCw className="w-4 h-4" />
                Novo vídeo
              </Button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              {/* Player */}
              <div className="lg:col-span-3">
                <div className="glass rounded-xl overflow-hidden">
                  <div className="aspect-video">
                    <iframe
                      ref={playerRef}
                      src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(clips[activeClip]?.start_seconds || 0)}&end=${Math.floor(clips[activeClip]?.end_seconds || 0)}&autoplay=0&rel=0`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
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
                  {clips.length} trechos identificados pela IA
                </p>
                {clips.map((clip, i) => (
                  <button
                    key={i}
                    onClick={() => playClip(i)}
                    className={`w-full text-left glass rounded-xl p-4 transition-all hover:border-primary/30 ${
                      activeClip === i ? "border-primary/50 glow-border" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
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
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {phase === "input" && (
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
      </div>
    </div>
  );
};

export default AppPage;
