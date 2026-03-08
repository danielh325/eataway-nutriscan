import { useState } from "react";
import { MenuUploader } from "@/components/MenuUploader";
import { ResultsPanel } from "@/components/ResultsPanel";
import { AnalysisSkeleton } from "@/components/LoadingSkeleton";
import { DailyLog } from "@/components/DailyLog";
import { DishData } from "@/components/DishCard";
import { Sparkles, Shield, Database, LogIn, LogOut, BookOpen } from "lucide-react";
import { analyzeMenu } from "@/lib/api/menu";
import eatawayLogo from "@/assets/eataway-logo.png";
import { analyzeMenu } from "@/lib/api/menu";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";

interface RestaurantContextData {
  type?: string;
  cuisine?: string;
  portion_style?: string;
  price_tier?: string;
}

const Index = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<DishData[] | null>(null);
  const [restaurantContext, setRestaurantContext] = useState<RestaurantContextData | null>(null);
  const [showDailyLog, setShowDailyLog] = useState(false);
  const { toast } = useToast();
  const { user, loading: authLoading, signOut } = useAuth();

  const handleImageUpload = async (file: File) => {
    setIsProcessing(true);
    setShowDailyLog(false);
    
    const response = await analyzeMenu(file);
    
    if (response.error) {
      toast({
        title: "Analysis Failed",
        description: response.error,
        variant: "destructive",
      });
      setResults(null);
      setRestaurantContext(null);
    } else if (response.dishes) {
      setResults(response.dishes);
      setRestaurantContext(response.restaurant_context || null);
      toast({
        title: "Menu Analyzed",
        description: `Found ${response.dishes.length} dishes`,
      });
    }
    
    setIsProcessing(false);
  };

  const handleReset = () => {
    setResults(null);
    setRestaurantContext(null);
    setShowDailyLog(false);
  };

  const handleSignIn = async () => {
    const { error } = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (error) {
      toast({ title: "Sign-in failed", description: error.message, variant: "destructive" });
    }
  };

  const handleSaveDish = async (dish: DishData, adjustedCalories: number, adjustedProtein: number, adjustedCarbs: number, adjustedFat: number, portionMultiplier: number) => {
    if (!user) {
      toast({ title: "Sign in to save", description: "Log in with Google to track your meals.", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("meal_logs").insert({
      user_id: user.id,
      dish_name: dish.dish,
      calories_kcal: adjustedCalories,
      protein_g: adjustedProtein,
      carbs_g: adjustedCarbs,
      fat_g: adjustedFat,
      confidence: dish.confidence,
      confidence_score: dish.confidence_score || null,
      portion_multiplier: portionMultiplier,
      ingredients: dish.ingredients_detected || [],
      notes: dish.notes || null,
    });

    if (error) {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Dish Logged", description: `${dish.dish} added to today's log` });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 glass-panel sticky top-0 z-50">
        <div className="container max-w-4xl px-4 py-3 md:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center glow-primary">
                <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 11h.01M11 15h.01M16 16c1-1.3 1.6-2.7 1.8-4.2C18 10.5 18 9.2 17.6 8c-.5-1.3-1.5-2.4-2.8-3.1C13.5 4.2 12 4 10.5 4.2 9 4.5 7.7 5.3 6.8 6.5 5.8 7.7 5.3 9.2 5.3 10.8c0 1.6.5 3.2 1.5 4.4" />
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M10 18v4M14 18v4" />
                </svg>
              </div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">NutriScan</h1>
            </div>
            <div className="flex items-center gap-2">
              {user && (
                <button
                  onClick={() => { setShowDailyLog(!showDailyLog); setResults(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-medium border border-border rounded-xl hover:bg-secondary transition-colors"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Daily Log</span>
                </button>
              )}
              {(results || isProcessing) && (
                <button
                  onClick={handleReset}
                  disabled={isProcessing}
                  className="px-3 py-2 text-xs md:text-sm font-medium border border-primary/40 text-primary rounded-xl hover:bg-primary/10 transition-colors disabled:opacity-50"
                >
                  New Scan
                </button>
              )}
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
                    className="flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-medium bg-primary text-primary-foreground rounded-xl hover:opacity-90 transition-opacity glow-primary"
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

      <main className={`container px-4 py-8 md:py-12 ${results ? 'max-w-7xl' : 'max-w-4xl'}`}>
        {showDailyLog ? (
          <DailyLog />
        ) : isProcessing ? (
          <AnalysisSkeleton />
        ) : !results ? (
          <div className="space-y-10 md:space-y-12">
            {/* Hero Section */}
            <div className="text-center space-y-4 animate-fade-in">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Photo to Nutrition
                <br />
                <span className="text-primary">in Seconds</span>
              </h2>
              <p className="text-base md:text-lg text-muted-foreground max-w-lg mx-auto">
                Upload a menu photo and get verified nutritional estimates for every dish.
                Adjust portions and ingredients in real-time.
              </p>
            </div>

            {/* Upload Area */}
            <MenuUploader onImageUpload={handleImageUpload} isProcessing={isProcessing} />

            {/* Features */}
            <div className="grid md:grid-cols-3 gap-4 md:gap-6 pt-4 md:pt-8">
              <div className="flex items-start gap-3 md:gap-4 p-4 md:p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
                <Sparkles className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5 text-primary" />
                <div>
                  <h3 className="font-medium mb-1 text-sm md:text-base">Multi-Step Pipeline</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Context detection, ingredient decomposition, and visual portion calibration
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:gap-4 p-4 md:p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
                <Database className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5 text-primary" />
                <div>
                  <h3 className="font-medium mb-1 text-sm md:text-base">Interactive Adjustments</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Portion sliders and ingredient toggles for real-time nutrition updates
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:gap-4 p-4 md:p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-colors">
                <Shield className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5 text-primary" />
                <div>
                  <h3 className="font-medium mb-1 text-sm md:text-base">Daily Health Log</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Track scans against personalized calorie, protein, carbs, and fat goals
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ResultsPanel dishes={results} restaurantContext={restaurantContext} onSaveDish={handleSaveDish} isLoggedIn={!!user} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-auto">
        <div className="container max-w-4xl px-4 py-5 md:py-6">
          <p className="text-[10px] md:text-xs text-center text-muted-foreground font-mono">
            VERIFIED EXTRACTION PIPELINE • TRANSPARENCY {'>'} COMPLETENESS
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
