import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import Navbar from "@/components/Navbar";
import {
  ArrowRight,
  Download,
  Edit3,
  Play,
  RefreshCw,
  Scissors,
  Check,
} from "lucide-react";

type Clip = {
  id: number;
  title: string;
  duration: string;
  timestamp: string;
  score: number;
};

const mockClips: Clip[] = [
  { id: 1, title: "Momento de impacto emocional", duration: "0:42", timestamp: "3:15 - 3:57", score: 95 },
  { id: 2, title: "Insight principal do vídeo", duration: "0:38", timestamp: "7:22 - 8:00", score: 91 },
  { id: 3, title: "Trecho com maior engajamento", duration: "0:55", timestamp: "12:05 - 13:00", score: 88 },
  { id: 4, title: "Gancho viral de abertura", duration: "0:31", timestamp: "0:10 - 0:41", score: 85 },
];

const processingSteps = [
  "Baixando vídeo...",
  "Transcrevendo áudio com IA...",
  "Analisando momentos de engajamento...",
  "Detectando rostos e enquadramento...",
  "Gerando cortes otimizados...",
  "Adicionando legendas animadas...",
  "Finalizando exportação...",
];

const AppPage = () => {
  const [searchParams] = useSearchParams();
  const initialUrl = searchParams.get("url") || "";
  const [url, setUrl] = useState(initialUrl);
  const [phase, setPhase] = useState<"input" | "processing" | "results">(
    initialUrl ? "processing" : "input"
  );
  const [progress, setProgress] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [clips, setClips] = useState<Clip[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [subtitleColor, setSubtitleColor] = useState("#00e5ff");

  useEffect(() => {
    if (phase !== "processing") return;
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          setPhase("results");
          setClips(mockClips);
          return 100;
        }
        const newP = p + 1.5;
        setStepIndex(Math.min(Math.floor((newP / 100) * processingSteps.length), processingSteps.length - 1));
        return newP;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [phase]);

  const handleGenerate = () => {
    if (!url.trim()) return;
    setProgress(0);
    setStepIndex(0);
    setPhase("processing");
  };

  const startEdit = (clip: Clip) => {
    setEditingId(clip.id);
    setEditValue(clip.title);
  };

  const saveEdit = (id: number) => {
    setClips((prev) => prev.map((c) => (c.id === id ? { ...c, title: editValue } : c)));
    setEditingId(null);
  };

  const colors = ["#00e5ff", "#a855f7", "#facc15", "#22c55e", "#f43f5e"];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-28 px-6 pb-16 max-w-4xl mx-auto">
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
              onClick={handleGenerate}
              size="lg"
              className="h-12 px-8 gap-2 glow-primary font-semibold"
              disabled={phase === "processing"}
            >
              <Scissors className="w-4 h-4" />
              Gerar Cortes
            </Button>
          </div>
        </div>

        {/* Processing */}
        {phase === "processing" && (
          <div className="glass rounded-2xl p-10 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-pulse-glow">
              <Scissors className="w-8 h-8 text-primary animate-spin" style={{ animationDuration: "3s" }} />
            </div>
            <h3 className="font-display text-xl font-semibold mb-2">Processando seu vídeo</h3>
            <p className="text-primary text-sm font-medium mb-6">{processingSteps[stepIndex]}</p>
            <Progress value={progress} className="h-2 mb-3" />
            <p className="text-xs text-muted-foreground">{Math.round(progress)}% concluído</p>
          </div>
        )}

        {/* Results */}
        {phase === "results" && (
          <div className="animate-slide-up">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-2xl font-bold">
                Seus <span className="text-gradient">cortes</span>
              </h2>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => { setPhase("processing"); setProgress(0); setStepIndex(0); }}>
                <RefreshCw className="w-4 h-4" />
                Gerar mais cortes
              </Button>
            </div>

            {/* Subtitle color picker */}
            <div className="glass rounded-xl p-4 mb-6 flex items-center gap-4 flex-wrap">
              <span className="text-sm text-muted-foreground">Cor da legenda:</span>
              <div className="flex gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${subtitleColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setSubtitleColor(c)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {clips.map((clip) => (
                <div key={clip.id} className="glass rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4 group hover:border-primary/30 transition-all">
                  {/* Mock video preview */}
                  <div className="w-full sm:w-32 aspect-[9/16] bg-secondary rounded-lg flex items-center justify-center shrink-0 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/60" />
                    <Play className="w-8 h-8 text-primary relative z-10" />
                    {/* Mock subtitle bar */}
                    <div className="absolute bottom-3 left-2 right-2 text-center z-10">
                      <span
                        className="text-[8px] font-bold px-1 py-0.5 rounded"
                        style={{ color: subtitleColor, textShadow: `0 0 8px ${subtitleColor}40` }}
                      >
                        legenda automática
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0">
                    {editingId === clip.id ? (
                      <div className="flex gap-2 mb-2">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="h-8 text-sm bg-secondary/80"
                        />
                        <Button size="sm" variant="ghost" onClick={() => saveEdit(clip.id)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <h4 className="font-display font-semibold mb-1 flex items-center gap-2">
                        {clip.title}
                        <button onClick={() => startEdit(clip)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <Edit3 className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        </button>
                      </h4>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>⏱ {clip.duration}</span>
                      <span>📍 {clip.timestamp}</span>
                      <span className="text-primary font-semibold">🔥 {clip.score}% viral</span>
                    </div>
                  </div>

                  <Button size="sm" className="gap-2 shrink-0">
                    <Download className="w-4 h-4" />
                    Download
                  </Button>
                </div>
              ))}
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
              Suportamos qualquer vídeo público do YouTube.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default AppPage;
