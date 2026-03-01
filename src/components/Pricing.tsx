import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";

const plans = [
  {
    name: "Grátis",
    price: "R$ 0",
    period: "/mês",
    desc: "Perfeito para testar",
    features: [
      "2 vídeos por mês",
      "3 cortes por vídeo",
      "Legendas automáticas",
      "Download em 720p",
    ],
    cta: "Começar grátis",
    highlight: false,
  },
  {
    name: "Pro",
    price: "R$ 49",
    period: "/mês",
    desc: "Para criadores de conteúdo",
    features: [
      "20 vídeos por mês",
      "5 cortes por vídeo",
      "Legendas personalizáveis",
      "Download em 1080p",
      "Sem marca d'água",
      "Prioridade no processamento",
    ],
    cta: "Assinar Pro",
    highlight: true,
  },
  {
    name: "Business",
    price: "R$ 149",
    period: "/mês",
    desc: "Para agências e equipes",
    features: [
      "Vídeos ilimitados",
      "10 cortes por vídeo",
      "API de integração",
      "Download em 4K",
      "Suporte prioritário",
      "Multi-usuários",
    ],
    cta: "Falar com vendas",
    highlight: false,
  },
];

const Pricing = () => {
  return (
    <section className="py-24 px-6" id="pricing">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-display font-bold text-center mb-4">
          Planos e <span className="text-gradient">preços</span>
        </h2>
        <p className="text-muted-foreground text-center mb-16 max-w-xl mx-auto">
          Escolha o plano ideal para o seu volume de criação.
        </p>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <div
              key={i}
              className={`rounded-2xl p-8 flex flex-col transition-all duration-300 ${
                plan.highlight
                  ? "glass glow-primary border-primary/40 scale-[1.02]"
                  : "glass hover:border-primary/20"
              }`}
            >
              {plan.highlight && (
                <div className="text-xs font-bold text-primary tracking-widest uppercase mb-4">
                  Mais popular
                </div>
              )}
              <h3 className="font-display text-xl font-bold mb-1">{plan.name}</h3>
              <p className="text-muted-foreground text-sm mb-6">{plan.desc}</p>
              <div className="mb-8">
                <span className="text-4xl font-display font-bold">{plan.price}</span>
                <span className="text-muted-foreground text-sm">{plan.period}</span>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((f, j) => (
                  <li key={j} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                variant={plan.highlight ? "default" : "outline"}
                className="w-full"
                size="lg"
              >
                {plan.cta}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
