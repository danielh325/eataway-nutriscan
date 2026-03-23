import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { ScanLine, Compass, BookOpen, LogIn, LogOut } from "lucide-react";
import eatawayLogo from "@/assets/eataway-logo.png";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";
import { useToast } from "@/hooks/use-toast";

const tabs = [
  { path: "/", label: "Scan", icon: ScanLine },
  { path: "/explore", label: "Explore", icon: Compass },
];

export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading, signOut } = useAuth();
  const { toast } = useToast();

  const handleSignIn = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) {
      toast({ title: "Sign-in failed", description: error.message, variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border/50 glass-panel sticky top-0 z-50">
        <div className="container max-w-7xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src={eatawayLogo}
                alt="EatAway"
                className="h-10 md:h-12 w-auto cursor-pointer"
                onClick={() => navigate("/")}
              />
              {/* Tab navigation */}
              <nav className="flex items-center gap-1 ml-2">
                {tabs.map((tab) => {
                  const isActive = location.pathname === tab.path;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.path}
                      onClick={() => navigate(tab.path)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              {!authLoading && (
                user ? (
                  <button
                    onClick={signOut}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-medium border border-border rounded-xl hover:bg-secondary transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Sign Out</span>
                  </button>
                ) : (
                  <button
                    onClick={handleSignIn}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span className="hidden md:inline">Sign In</span>
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 container max-w-7xl px-4 py-6 md:py-10">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-auto">
        <div className="container max-w-7xl px-4 py-4">
          <p className="text-[10px] md:text-xs text-center text-muted-foreground font-mono">
            EATAWAY NUTRISCAN • VERIFIED EXTRACTION PIPELINE
          </p>
        </div>
      </footer>
    </div>
  );
}
