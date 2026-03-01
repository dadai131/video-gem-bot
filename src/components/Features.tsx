import {
  Captions,
  Focus,
  Gauge,
  MonitorSmartphone,
  Sparkles,
  TrendingUp,
} from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "Detecção inteligente",
    desc: "IA identifica picos de engajamento, emoção na voz e palavras-chave relevantes.",
  },
  {
    icon: MonitorSmartphone,
    title: "Formato 9:16",
    desc: "Reformatação automática para Shorts, Reels e TikTok.",
  },
  {
    icon: Captions,
    title: "Legendas animadas",
    desc: "Legendas sincronizadas com destaque dinâmico de palavras-chave.",
  },
  {
    icon: Focus,
    title: "Foco no rosto",
    desc: "Detecção automática de rosto com zoom inteligente.",
  },
  {
    icon: TrendingUp,
    title: "Otimização viral",
    desc: "Seleção de trechos com maior potencial de retenção e viralização.",
  },
  {
    icon: Gauge,
    title: "Processamento rápido",
    desc: "Receba seus cortes prontos em poucos minutos.",
  },
];

const Features = () => {
  return (
    <section className="py-24 px-6 bg-surface">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-4">
          Recursos <span className="text-gradient">poderosos</span>
        </h2>
        <p className="text-muted-foreground text-center mb-16 max-w-xl mx-auto">
          Tudo que você precisa para criar cortes profissionais automaticamente.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <div
              key={i}
              className="glass rounded-xl p-6 group hover:border-primary/30 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                <f.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
