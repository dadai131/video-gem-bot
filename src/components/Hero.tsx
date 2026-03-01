import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRight, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import heroBg from "@/assets/hero-bg.jpg";

const Hero = () => {
  const [url, setUrl] = useState("");
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      navigate(`/app?url=${encodeURIComponent(url)}`);
    }
  };

  const handleFileSelect = (file: File) => {
    const validTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];
    if (!validTypes.includes(file.type)) return;
    // Store file in sessionStorage-like approach: navigate to app and let it handle
    // We use a global to pass the file since it can't go through URL
    (window as any).__clipmaster_upload = file;
    navigate("/app?mode=upload");
  };

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-20 px-6 overflow-hidden">
      {/* Background image */}
      <div className="absolute inset-0 z-0">
        <img src={heroBg} alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/60 via-background/80 to-background" />
      </div>

      {/* Glow orbs */}
      <div className="absolute top-1/3 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 text-xs font-medium text-primary mb-8">
          <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          Powered by AI
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-display font-bold leading-tight mb-6">
          Transforme vídeos em{" "}
          <span className="text-gradient">cortes virais</span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto mb-10 leading-relaxed">
          Cole o link do YouTube e receba cortes otimizados para Shorts, Reels e
          TikTok — com legendas automáticas e formatação 9:16.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
          <Input
            type="url"
            placeholder="Cole o link do YouTube aqui..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="flex-1 h-12 bg-secondary/80 border-border/60 text-foreground placeholder:text-muted-foreground"
          />
          <Button type="submit" size="lg" className="h-12 px-8 gap-2 glow-primary font-semibold">
            Gerar Cortes
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>

        {/* Upload file option */}
        <div className="flex items-center gap-3 max-w-xl mx-auto mt-4">
          <div className="flex-1 h-px bg-border/40" />
          <span className="text-xs text-muted-foreground">ou</span>
          <div className="flex-1 h-px bg-border/40" />
        </div>

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
        <Button
          variant="ghost"
          size="sm"
          className="mt-3 gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-4 h-4" />
          Upload de arquivo do vídeo
        </Button>

        <p className="text-xs text-muted-foreground mt-3">
          Grátis para testar · Sem cartão de crédito
        </p>
      </div>
    </section>
  );
};

export default Hero;
