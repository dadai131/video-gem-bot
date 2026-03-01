import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SubtitleSegment } from "@/lib/subtitleUtils";
import { generateSRT, downloadSRT } from "@/lib/subtitleUtils";
import { Download, Play, Trash2, Plus } from "lucide-react";

interface SubtitleEditorProps {
  segments: SubtitleSegment[];
  onSegmentsChange: (segments: SubtitleSegment[]) => void;
  onSeekTo: (time: number) => void;
  filename?: string;
}

const SubtitleEditor = ({
  segments,
  onSegmentsChange,
  onSeekTo,
  filename = "legendas",
}: SubtitleEditorProps) => {
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.round((s % 1) * 100);
    return `${m}:${sec.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
  };

  const parseTimeInput = (value: string): number => {
    // Accept formats: 1:23.45, 83.45, 1:23
    const parts = value.split(":");
    if (parts.length === 2) {
      const mins = parseFloat(parts[0]) || 0;
      const secs = parseFloat(parts[1]) || 0;
      return mins * 60 + secs;
    }
    return parseFloat(value) || 0;
  };

  const updateSegment = (index: number, field: keyof SubtitleSegment, value: any) => {
    const updated = [...segments];
    updated[index] = { ...updated[index], [field]: value };
    onSegmentsChange(updated);
  };

  const deleteSegment = (index: number) => {
    const updated = segments.filter((_, i) => i !== index);
    onSegmentsChange(updated.map((s, i) => ({ ...s, id: i + 1 })));
  };

  const addSegment = () => {
    const lastEnd = segments.length > 0 ? segments[segments.length - 1].end : 0;
    onSegmentsChange([
      ...segments,
      { id: segments.length + 1, start: lastEnd, end: lastEnd + 3, text: "" },
    ]);
  };

  const handleDownload = () => {
    const srt = generateSRT(segments);
    downloadSRT(srt, filename);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {segments.length} {segments.length === 1 ? "legenda" : "legendas"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addSegment}>
            <Plus className="w-3.5 h-3.5" />
            Adicionar
          </Button>
          <Button
            variant="default"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={handleDownload}
            disabled={segments.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            Baixar .srt
          </Button>
        </div>
      </div>

      {/* Segments list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {segments.map((seg, i) => (
          <div
            key={seg.id}
            className="glass rounded-lg p-3 space-y-2 group"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
                {i + 1}
              </span>
              <Input
                value={formatTime(seg.start)}
                onChange={(e) => updateSegment(i, "start", parseTimeInput(e.target.value))}
                className="h-7 text-xs w-20 bg-secondary/60"
                title="Início"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                value={formatTime(seg.end)}
                onChange={(e) => updateSegment(i, "end", parseTimeInput(e.target.value))}
                className="h-7 text-xs w-20 bg-secondary/60"
                title="Fim"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => onSeekTo(seg.start)}
                title="Ir para este ponto"
              >
                <Play className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 text-destructive"
                onClick={() => deleteSegment(i)}
                title="Remover"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
            <textarea
              value={seg.text}
              onChange={(e) => updateSegment(i, "text", e.target.value)}
              className="w-full bg-secondary/40 border border-border/40 rounded-md px-2 py-1.5 text-sm resize-none min-h-[36px] focus:outline-none focus:ring-1 focus:ring-primary/50"
              rows={1}
            />
          </div>
        ))}
      </div>

      {segments.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Nenhuma legenda gerada ainda. Clique em "Gerar legendas" para começar.
        </div>
      )}
    </div>
  );
};

export default SubtitleEditor;
