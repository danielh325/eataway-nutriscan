import { useState } from "react";
import { MenuUploader } from "@/components/MenuUploader";
import { ResultsPanel } from "@/components/ResultsPanel";
import { AnalysisSkeleton } from "@/components/LoadingSkeleton";
import { DishData } from "@/components/DishCard";
import { Sparkles, Shield, Database } from "lucide-react";
import { analyzeMenu } from "@/lib/api/menu";
import { useToast } from "@/hooks/use-toast";

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
  const { toast } = useToast();

  const handleImageUpload = async (file: File) => {
    setIsProcessing(true);
    
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
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-foreground">
        <div className="container max-w-4xl px-4 py-5 md:py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 md:w-10 md:h-10 bg-foreground text-primary-foreground rounded-xl flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                  <path d="M12 6v6l4 2" />
                  <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
                  <path d="M7 17l1.5-3M17 17l-1.5-3" />
                </svg>
              </div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">NutriScan</h1>
            </div>
            {(results || isProcessing) && (
              <button
                onClick={handleReset}
                disabled={isProcessing}
                className="px-3 md:px-4 py-2 text-sm font-medium border-2 border-foreground rounded-lg hover:bg-secondary transition-colors disabled:opacity-50"
              >
                New Scan
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-4xl px-4 py-8 md:py-12">
        {isProcessing ? (
          <div className="space-y-8">
            <MenuUploader onImageUpload={handleImageUpload} isProcessing={isProcessing} />
            <AnalysisSkeleton />
          </div>
        ) : !results ? (
          <div className="space-y-10 md:space-y-12">
            {/* Hero Section */}
            <div className="text-center space-y-4 animate-fade-in">
              <h2 className="text-3xl md:text-5xl font-bold tracking-tight">
                Photo to Nutrition
                <br />
                <span className="text-muted-foreground">in Seconds</span>
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
              <div className="flex items-start gap-3 md:gap-4 p-4 md:p-5 rounded-xl border border-border hover:border-foreground transition-colors">
                <Sparkles className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1 text-sm md:text-base">Multi-Step Pipeline</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Context detection, ingredient decomposition, and visual portion calibration
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:gap-4 p-4 md:p-5 rounded-xl border border-border hover:border-foreground transition-colors">
                <Database className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1 text-sm md:text-base">Interactive Adjustments</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Portion sliders and ingredient toggles for real-time nutrition updates
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 md:gap-4 p-4 md:p-5 rounded-xl border border-border hover:border-foreground transition-colors">
                <Shield className="w-5 h-5 md:w-6 md:h-6 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1 text-sm md:text-base">Confidence Scores</h3>
                  <p className="text-xs md:text-sm text-muted-foreground">
                    Numeric confidence with low-score items flagged for manual review
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ResultsPanel dishes={results} restaurantContext={restaurantContext} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
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
