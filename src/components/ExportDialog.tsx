import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, FileVideo, FileText, Film, Loader2, AlertTriangle } from "lucide-react";
import type { SubtitleSegment } from "@/lib/subtitleUtils";
import { generateSRT, downloadSRT } from "@/lib/subtitleUtils";
import { trimVideo } from "@/lib/videoEditor";
import { exportWithBurnedSubtitles, exportVideoAndSubtitles } from "@/lib/exportModule";
import { downloadBlob } from "@/lib/videoCutter";

interface ExportDialogProps {
  file: File | null;
  subtitles: SubtitleSegment[];
  trimStart: number;
  trimEnd: number;
  duration: number;
}

const ExportDialog = ({
  file,
  subtitles,
  trimStart,
  trimEnd,
  duration,
}: ExportDialogProps) => {
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState("");
  const [open, setOpen] = useState(false);

  const isTrimmed = trimStart > 0 || trimEnd < duration;
  const hasSubtitles = subtitles.length > 0;

  const handleExportVideo = async () => {
    if (!file) return;
    setExporting(true);
    try {
      let blob: Blob;
      if (isTrimmed) {
        blob = await trimVideo(file, trimStart, trimEnd, (p, s) => {
          setExportProgress(p);
          setExportStatus(s);
        });
      } else {
        blob = new Blob([await file.arrayBuffer()], { type: "video/mp4" });
      }
      const name = file.name.replace(/\.[^.]+$/, "") + (isTrimmed ? "_cortado" : "") + ".mp4";
      downloadBlob(blob, name);
    } catch (e: any) {
      console.error(e);
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleExportSRT = () => {
    if (!hasSubtitles) return;
    const srt = generateSRT(subtitles);
    const name = file?.name.replace(/\.[^.]+$/, "") || "video";
    downloadSRT(srt, name);
  };

  const handleExportBurnIn = async () => {
    if (!file || !hasSubtitles) return;
    setExporting(true);
    try {
      const srt = generateSRT(subtitles);
      const blob = await exportWithBurnedSubtitles(file, srt, (p, s) => {
        setExportProgress(p);
        setExportStatus(s);
      });
      const name = file.name.replace(/\.[^.]+$/, "") + "_legendado.mp4";
      downloadBlob(blob, name);
    } catch (e: any) {
      console.error(e);
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  const handleExportBoth = async () => {
    if (!file || !hasSubtitles) return;
    setExporting(true);
    try {
      const srt = generateSRT(subtitles);
      const { videoBlob, subtitledBlob } = await exportVideoAndSubtitles(file, srt, (p, s) => {
        setExportProgress(p);
        setExportStatus(s);
      });
      const baseName = file.name.replace(/\.[^.]+$/, "");
      downloadBlob(videoBlob, `${baseName}.mp4`);
      await new Promise((r) => setTimeout(r, 500));
      downloadBlob(subtitledBlob, `${baseName}_legendado.mp4`);
      // Also download SRT
      await new Promise((r) => setTimeout(r, 300));
      downloadSRT(srt, baseName);
    } catch (e: any) {
      console.error(e);
    } finally {
      setExporting(false);
      setExportProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 glow-primary" disabled={!file}>
          <Download className="w-4 h-4" />
          Exportar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Exportar vídeo</DialogTitle>
          <DialogDescription>Escolha como deseja exportar seu projeto.</DialogDescription>
        </DialogHeader>

        {exporting ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium">{exportStatus}</p>
                <Progress value={exportProgress} className="h-1.5 mt-2" />
              </div>
              <span className="text-xs text-muted-foreground">{exportProgress}%</span>
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-2">
            {/* Export video */}
            <button
              onClick={handleExportVideo}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-secondary/30 transition-all text-left"
            >
              <FileVideo className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Vídeo {isTrimmed ? "cortado" : "original"} (MP4)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isTrimmed
                    ? "Exporta apenas o trecho selecionado na timeline"
                    : "Exporta o vídeo sem alterações"}
                </p>
              </div>
            </button>

            {/* Export SRT */}
            <button
              onClick={handleExportSRT}
              disabled={!hasSubtitles}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-secondary/30 transition-all text-left disabled:opacity-40 disabled:pointer-events-none"
            >
              <FileText className="w-5 h-5 text-accent mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Legenda separada (.srt)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasSubtitles
                    ? `${subtitles.length} legendas para download`
                    : "Gere legendas primeiro na aba Legendar"}
                </p>
              </div>
            </button>

            {/* Export burn-in */}
            <button
              onClick={handleExportBurnIn}
              disabled={!hasSubtitles}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-secondary/30 transition-all text-left disabled:opacity-40 disabled:pointer-events-none"
            >
              <Film className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Vídeo com legenda embutida</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasSubtitles ? (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 text-yellow-500" />
                      Re-encode completo — mais lento
                    </span>
                  ) : (
                    "Gere legendas primeiro na aba Legendar"
                  )}
                </p>
              </div>
            </button>

            {/* Export both (video + subtitled + srt) */}
            <button
              onClick={handleExportBoth}
              disabled={!hasSubtitles}
              className="w-full flex items-start gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 hover:bg-primary/10 transition-all text-left disabled:opacity-40 disabled:pointer-events-none"
            >
              <Download className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">Pacote completo (tudo junto)</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {hasSubtitles
                    ? "Baixa: vídeo sem legenda + vídeo com legenda + arquivo .srt"
                    : "Gere legendas primeiro na aba Legendar"}
                </p>
              </div>
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ExportDialog;
