import { useState } from "react";
import { MenuUploader } from "@/components/MenuUploader";
import { ResultsPanel } from "@/components/ResultsPanel";
import { DishData } from "@/components/DishCard";
import { Utensils, Sparkles, Shield, Database } from "lucide-react";

// Demo data for showcase
const DEMO_RESULTS: DishData[] = [
  {
    dish: "Grilled Chicken Alfredo",
    confidence: "medium",
    ingredients_detected: ["grilled chicken breast", "fettuccine pasta", "alfredo sauce", "parmesan"],
    nutrition: {
      calories_kcal: "750–920",
      protein_g: "35–45",
      carbs_g: "60–75",
      fat_g: "38–50",
      sodium_mg: "900–1200",
    },
    data_sources: ["USDA FoodData Central", "Nutritionix"],
    notes: "Portion size not specified; values are estimates within standard serving ranges.",
  },
  {
    dish: "Caesar Salad",
    confidence: "high",
    ingredients_detected: ["romaine lettuce", "parmesan cheese", "croutons", "caesar dressing", "anchovy"],
    nutrition: {
      calories_kcal: "320–400",
      protein_g: "8–12",
      carbs_g: "15–22",
      fat_g: "24–32",
      sodium_mg: "650–850",
    },
    data_sources: ["USDA FoodData Central"],
    notes: "Based on typical restaurant portion of 200g.",
  },
  {
    dish: "House Special",
    confidence: "low",
    ingredients_detected: ["unknown"],
    nutrition: "unavailable",
    data_sources: [],
    reason: "Insufficient ingredient specificity to compute verified nutrition",
  },
  {
    dish: "Margherita Pizza",
    confidence: "medium",
    ingredients_detected: ["pizza dough", "tomato sauce", "mozzarella", "fresh basil", "olive oil"],
    nutrition: {
      calories_kcal: "800–1100",
      protein_g: "28–38",
      carbs_g: "95–120",
      fat_g: "30–45",
      sodium_mg: "1500–2000",
    },
    data_sources: ["USDA FoodData Central", "Edamam"],
    notes: "Based on 12-inch pizza. Values may vary by crust thickness.",
  },
];

const Index = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<DishData[] | null>(null);

  const handleImageUpload = async (file: File) => {
    setIsProcessing(true);
    // Simulate processing delay for demo
    await new Promise((resolve) => setTimeout(resolve, 2500));
    setResults(DEMO_RESULTS);
    setIsProcessing(false);
  };

  const handleReset = () => {
    setResults(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-foreground">
        <div className="container max-w-4xl py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-foreground text-primary-foreground rounded-lg flex items-center justify-center">
                <Utensils className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">NutriScan</h1>
                <p className="text-xs text-muted-foreground font-mono">MENU → NUTRITION</p>
              </div>
            </div>
            {results && (
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm font-medium border-2 border-foreground rounded-lg hover:bg-secondary transition-colors"
              >
                Scan New Menu
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="container max-w-4xl py-12">
        {!results ? (
          <div className="space-y-12">
            {/* Hero Section */}
            <div className="text-center space-y-4 animate-fade-in">
              <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
                Photo to Nutrition
                <br />
                <span className="text-muted-foreground">in Seconds</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-lg mx-auto">
                Upload a menu photo and get verified nutritional estimates for every dish.
                No guessing. No hallucinated numbers.
              </p>
            </div>

            {/* Upload Area */}
            <MenuUploader onImageUpload={handleImageUpload} isProcessing={isProcessing} />

            {/* Features */}
            <div className="grid md:grid-cols-3 gap-6 pt-8">
              <div className="flex items-start gap-4 p-5 rounded-lg border border-border hover:border-foreground transition-colors">
                <Sparkles className="w-6 h-6 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">OCR Extraction</h3>
                  <p className="text-sm text-muted-foreground">
                    Advanced text recognition handles blurry photos and stylized fonts
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 rounded-lg border border-border hover:border-foreground transition-colors">
                <Database className="w-6 h-6 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Verified Data</h3>
                  <p className="text-sm text-muted-foreground">
                    Nutrition sourced from USDA, Nutritionix, and trusted databases
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-5 rounded-lg border border-border hover:border-foreground transition-colors">
                <Shield className="w-6 h-6 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-medium mb-1">Confidence Scores</h3>
                  <p className="text-sm text-muted-foreground">
                    Transparency on data quality—ranges over false precision
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ResultsPanel dishes={results} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="container max-w-4xl py-6">
          <p className="text-xs text-center text-muted-foreground font-mono">
            TRANSPARENCY {'>'} COMPLETENESS • NO HALLUCINATED NUMBERS
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Index;
