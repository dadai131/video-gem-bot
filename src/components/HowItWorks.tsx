import { Scissors, Sparkles, Zap } from "lucide-react";

const steps = [
  {
    icon: Zap,
    title: "Cole o link",
    description: "Basta colar o link do seu vídeo do YouTube no campo acima.",
  },
  {
    icon: Sparkles,
    title: "IA processa",
    description: "Nossa IA detecta os melhores momentos, transcreve e reformata.",
  },
  {
    icon: Scissors,
    title: "Baixe os cortes",
    description: "Receba de 3 a 5 cortes prontos para Shorts, Reels e TikTok.",
  },
];

const HowItWorks = () => {
  return (
    <section className="py-24 px-6 relative">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-4">
          Como <span className="text-gradient">funciona</span>
        </h2>
        <p className="text-muted-foreground text-center mb-16 max-w-xl mx-auto">
          Três passos simples para transformar vídeos longos em clipes virais.
        </p>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, i) => (
            <div
              key={i}
              className="glass rounded-2xl p-8 text-center group hover:glow-border transition-all duration-500"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-6 group-hover:bg-primary/20 transition-colors">
                <step.icon className="w-7 h-7 text-primary" />
              </div>
              <div className="text-xs font-bold text-primary mb-3 tracking-widest uppercase">
                Passo {i + 1}
              </div>
              <h3 className="text-xl font-display font-semibold mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
