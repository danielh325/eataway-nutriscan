import { useState, useEffect } from "react";
import { MenuUploader } from "@/components/MenuUploader";
import { ResultsPanel } from "@/components/ResultsPanel";
import { AnalysisSkeleton } from "@/components/LoadingSkeleton";
import { DailyLog } from "@/components/DailyLog";
import { DishData } from "@/components/DishCard";
import { Sparkles, Shield, Database, BookOpen } from "lucide-react";
import { analyzeMenu, refineMenu } from "@/lib/api/menu";
import { ocrMenuImage } from "@/lib/ocrMenu";
import { preloadClipModels } from "@/lib/clipVerify";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

interface RestaurantContextData {
  type?: string;
  cuisine?: string;
  portion_style?: string;
  price_tier?: string;
}

const Index = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [results, setResults] = useState<DishData[] | null>(null);
  const [restaurantContext, setRestaurantContext] = useState<RestaurantContextData | null>(null);
  const [menuImageBase64, setMenuImageBase64] = useState<string | undefined>();
  const [menuMimeType, setMenuMimeType] = useState<string | undefined>();
  const [showDailyLog, setShowDailyLog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleImageUpload = async (file: File) => {
    setIsProcessing(true);
    setIsRefining(false);
    setShowDailyLog(false);

    // Run client-side OCR in parallel with the AI analysis call so the
    // text is available to enrich the prompt without adding latency.
    const ocrPromise = ocrMenuImage(file).catch(() => ({ text: "", confidence: 0, durationMs: 0 }));
    const ocr = await ocrPromise;

    const response = await analyzeMenu(file, ocr.text);

    if (response.error) {
      toast({
        title: "Analysis Failed",
        description: response.error,
        variant: "destructive",
      });
      setResults(null);
      setRestaurantContext(null);
      setIsProcessing(false);
      return;
    }

    if (response.dishes) {
      setResults(response.dishes);
      setRestaurantContext(response.restaurant_context || null);
      setMenuImageBase64(response.imageBase64);
      setMenuMimeType(response.mimeType);
      setIsProcessing(false);

      toast({
        title: "Menu Analyzed",
        description: `Found ${response.dishes.length} dishes — refining accuracy…`,
      });

      setIsRefining(true);
      const refined = await refineMenu(
        response.dishes,
        response.restaurant_context || null,
        response.imageBase64,
        response.mimeType
      );

      if (refined.dishes && refined.dishes.length > 0) {
        setResults(prev => {
          if (!prev) return refined.dishes!;
          return prev.map(original => {
            const match = refined.dishes!.find(
              r => r.dish?.toLowerCase().trim() === original.dish?.toLowerCase().trim() ||
                   r.dish?.toLowerCase().includes(original.dish?.toLowerCase()) ||
                   original.dish?.toLowerCase().includes(r.dish?.toLowerCase())
            );
            if (!match) return original;
            return {
              ...original,
              nutrition: match.nutrition || original.nutrition,
              confidence: match.confidence || original.confidence,
              confidence_score: match.confidence_score ?? original.confidence_score,
              data_sources: match.data_sources || original.data_sources,
              verification_notes: match.verification_notes || original.verification_notes,
            };
          });
        });

        toast({
          title: "Accuracy Refined",
          description: "Ensemble verification complete — nutrition updated",
        });
      }
      setIsRefining(false);
    } else {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setResults(null);
    setRestaurantContext(null);
    setMenuImageBase64(undefined);
    setMenuMimeType(undefined);
    setShowDailyLog(false);
    setIsRefining(false);
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
    <div className={results ? 'max-w-7xl mx-auto' : 'max-w-4xl mx-auto'}>
      {/* Action buttons */}
      <div className="flex justify-end gap-2 mb-6">
        {user && (
          <button
            onClick={() => { setShowDailyLog(!showDailyLog); setResults(null); }}
            className="flex items-center gap-1.5 px-3 py-2 text-xs md:text-sm font-medium border border-border rounded-xl hover:bg-secondary transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Daily Log</span>
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
      </div>

      {showDailyLog ? (
        <DailyLog />
      ) : isProcessing ? (
        <AnalysisSkeleton />
      ) : !results ? (
        <div className="space-y-10 md:space-y-12">
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

          <MenuUploader onImageUpload={handleImageUpload} isProcessing={isProcessing} />

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
        <ResultsPanel
          dishes={results}
          restaurantContext={restaurantContext}
          onSaveDish={handleSaveDish}
          isLoggedIn={!!user}
          menuImageBase64={menuImageBase64}
          menuMimeType={menuMimeType}
          isRefining={isRefining}
        />
      )}
    </div>
  );
};

export default Index;
