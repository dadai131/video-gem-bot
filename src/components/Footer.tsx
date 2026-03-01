import { Scissors } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border py-12 px-6">
      <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          <Scissors className="w-5 h-5 text-primary" />
          <span className="font-display font-bold text-lg">ClipMaster AI</span>
        </div>
        <p className="text-muted-foreground text-sm">
          © 2026 ClipMaster AI. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
};

export default Footer;
