import { Scissors, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Navbar = () => {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2">
          <Scissors className="w-6 h-6 text-primary" />
          <span className="font-display font-bold text-xl">ClipMaster AI</span>
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          <a href="#pricing" className="hover:text-foreground transition-colors">Preços</a>
          <Link to="/app" className="hover:text-foreground transition-colors">App</Link>
        </div>
        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-full hover:bg-secondary/60 transition-colors">
            <Bell className="w-5 h-5 text-muted-foreground" />
            <span className="absolute top-1 right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
          </button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Login</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/app">Começar grátis</Link>
          </Button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
