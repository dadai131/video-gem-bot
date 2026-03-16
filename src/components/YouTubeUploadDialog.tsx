import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Youtube, Loader2, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Clip } from "@/lib/videoAnalyzer";

interface YouTubeUploadDialogProps {
  file: File | null;
  clips: Clip[];
  localVideoUrl: string | null;
}

const WEBHOOK_KEY = "zapier_youtube_webhook_url";

const YouTubeUploadDialog = ({ file, clips, localVideoUrl }: YouTubeUploadDialogProps) => {
  const [open, setOpen] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState(() => localStorage.getItem(WEBHOOK_KEY) || "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState<"public" | "unlisted" | "private">("unlisted");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number | "full">( "full");
  const [step, setStep] = useState<"config" | "details">(
    () => localStorage.getItem(WEBHOOK_KEY) ? "details" : "config"
  );

  useEffect(() => {
    if (webhookUrl) localStorage.setItem(WEBHOOK_KEY, webhookUrl);
  }, [webhookUrl]);

  // Pre-fill title from file or clip
  useEffect(() => {
    if (open && !title) {
      if (selectedClipIndex !== "full" && clips[selectedClipIndex as number]) {
        setTitle(clips[selectedClipIndex as number].title);
        setDescription(clips[selectedClipIndex as number].reason || "");
      } else if (file) {
        setTitle(file.name.replace(/\.[^.]+$/, ""));
      }
    }
  }, [open, selectedClipIndex]);

  const handleSaveWebhook = () => {
    if (!webhookUrl.startsWith("https://hooks.zapier.com/")) {
      toast({
        title: "URL inválida",
        description: "A URL precisa começar com https://hooks.zapier.com/",
        variant: "destructive",
      });
      return;
    }
    localStorage.setItem(WEBHOOK_KEY, webhookUrl);
    setStep("details");
    toast({ title: "Webhook salvo!", description: "URL do Zapier configurada." });
  };

  const handleUpload = async () => {
    if (!file || !webhookUrl || !title.trim()) return;

    setUploading(true);
    setUploadProgress(10);

    try {
      setUploadProgress(30);

      // Build payload
      const payload: Record<string, any> = {
        title: title.trim(),
        description: description.trim(),
        privacy,
        filename: file.name,
        filesize: file.size,
        timestamp: new Date().toISOString(),
        triggered_from: window.location.origin,
      };

      // If a specific clip is selected, include timing info
      if (selectedClipIndex !== "full" && clips[selectedClipIndex as number]) {
        const clip = clips[selectedClipIndex as number];
        payload.clip_start = clip.start_seconds;
        payload.clip_end = clip.end_seconds;
        payload.clip_title = clip.title;
        payload.clip_score = clip.score;
      }

      // If there's a published video URL, include it
      if (localVideoUrl) {
        payload.video_preview_url = localVideoUrl;
      }

      setUploadProgress(60);

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "no-cors",
        body: JSON.stringify(payload),
      });

      setUploadProgress(100);

      toast({
        title: "Dados enviados ao Zapier! ✅",
        description: "Verifique o histórico do seu Zap para confirmar que foi disparado.",
      });

      // Reset after success
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 1500);
    } catch (error) {
      console.error("Erro ao enviar webhook:", error);
      toast({
        title: "Erro no envio",
        description: "Não foi possível enviar os dados ao Zapier. Verifique a URL.",
        variant: "destructive",
      });
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" disabled={!file}>
          <Youtube className="w-4 h-4" />
          YouTube
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Youtube className="w-5 h-5 text-red-500" />
            Enviar para YouTube via Zapier
          </DialogTitle>
          <DialogDescription>
            Envie os dados do vídeo para o Zapier, que fará o upload no seu canal.
          </DialogDescription>
        </DialogHeader>

        {uploading ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3">
              {uploadProgress < 100 ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin shrink-0" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">
                  {uploadProgress < 100 ? "Enviando dados ao Zapier..." : "Enviado com sucesso!"}
                </p>
                <Progress value={uploadProgress} className="h-1.5 mt-2" />
              </div>
              <span className="text-xs text-muted-foreground">{uploadProgress}%</span>
            </div>
          </div>
        ) : step === "config" ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-secondary/50 p-4 space-y-2">
              <p className="text-sm font-semibold flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                Configure seu Webhook do Zapier
              </p>
              <p className="text-xs text-muted-foreground">
                Crie um Zap com o trigger "Webhooks by Zapier → Catch Hook" e cole a URL abaixo.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">URL do Webhook</label>
              <Input
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className="bg-secondary/80"
              />
            </div>

            <div className="rounded-lg border border-border/50 p-3 space-y-1">
              <p className="text-xs font-semibold">📋 Como configurar no Zapier:</p>
              <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Crie um novo Zap no Zapier</li>
                <li>Trigger: <strong>Webhooks by Zapier → Catch Hook</strong></li>
                <li>Copie a URL do webhook e cole acima</li>
                <li>Action: <strong>YouTube → Upload Video</strong></li>
                <li>Mapeie os campos: title, description, privacy</li>
              </ol>
            </div>

            <Button onClick={handleSaveWebhook} className="w-full gap-2 glow-primary">
              <CheckCircle2 className="w-4 h-4" />
              Salvar e continuar
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {/* Webhook status */}
            <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                  {webhookUrl}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-xs h-7"
                onClick={() => setStep("config")}
              >
                Alterar
              </Button>
            </div>

            {/* Clip selection */}
            {clips.length > 0 && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Qual vídeo enviar?</label>
                <Select
                  value={String(selectedClipIndex)}
                  onValueChange={(v) => {
                    const val = v === "full" ? "full" : Number(v);
                    setSelectedClipIndex(val);
                    if (val !== "full" && clips[val as number]) {
                      setTitle(clips[val as number].title);
                      setDescription(clips[val as number].reason || "");
                    } else if (file) {
                      setTitle(file.name.replace(/\.[^.]+$/, ""));
                      setDescription("");
                    }
                  }}
                >
                  <SelectTrigger className="bg-secondary/80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Vídeo completo</SelectItem>
                    {clips.map((clip, i) => (
                      <SelectItem key={i} value={String(i)}>
                        Clip {i + 1}: {clip.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Título</label>
              <Input
                placeholder="Título do vídeo no YouTube"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="bg-secondary/80"
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Descrição</label>
              <Textarea
                placeholder="Descrição do vídeo..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="bg-secondary/80 resize-none"
              />
            </div>

            {/* Privacy */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Visibilidade</label>
              <Select value={privacy} onValueChange={(v) => setPrivacy(v as any)}>
                <SelectTrigger className="bg-secondary/80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">🌍 Público</SelectItem>
                  <SelectItem value="unlisted">🔗 Não listado</SelectItem>
                  <SelectItem value="private">🔒 Privado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Warning */}
            <div className="flex items-start gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 p-3">
              <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground">
                O Zapier receberá os <strong>metadados</strong> do vídeo. Para o upload funcionar,
                o Zap precisa ter acesso ao arquivo (via URL pública ou Google Drive).
              </p>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!title.trim() || !webhookUrl}
              className="w-full gap-2 glow-primary"
            >
              <Youtube className="w-4 h-4" />
              Enviar para o Zapier
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default YouTubeUploadDialog;
