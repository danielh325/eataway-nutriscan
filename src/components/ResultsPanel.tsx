import { useState, useEffect, useRef } from "react";
import { DishCard, DishData } from "./DishCard";
import { RestaurantContext } from "./RestaurantContext";
import { Utensils, BarChart3, ShieldCheck, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractMenuImages, verifyDishPhoto, MenuImageBBox } from "@/lib/api/menu";
import { cropImageRegion } from "@/lib/cropMenuImage";
import { Button } from "@/components/ui/button";

interface RestaurantContextData {
  type?: string;
  cuisine?: string;
  portion_style?: string;
  price_tier?: string;
}

interface ResultsPanelProps {
  dishes: DishData[];
  restaurantContext?: RestaurantContextData | null;
  onSaveDish?: (dish: DishData, calories: number, protein: number, carbs: number, fat: number, portionMultiplier: number) => void;
  isLoggedIn?: boolean;
  menuImageBase64?: string;
  menuMimeType?: string;
  isRefining?: boolean;
}

export const ResultsPanel = ({ dishes, restaurantContext, onSaveDish, isLoggedIn, menuImageBase64, menuMimeType, isRefining }: ResultsPanelProps) => {
  const totalDishes = dishes.length;
  const availableNutrition = dishes.filter((d) => d.nutrition !== "unavailable").length;
  const highConfidence = dishes.filter((d) => d.confidence === "high").length;

  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [imageBBoxes, setImageBBoxes] = useState<Record<number, MenuImageBBox>>({});
  const abortRef = useRef(false);
  const [activeGenerations, setActiveGenerations] = useState<Set<number>>(new Set());

  const dishKey = dishes.map(d => d.dish).join("|");

  useEffect(() => {
    abortRef.current = false;
    let cancelled = false;

    const run = async () => {
      // Step 1: Try to extract real photos from the menu image
      const menuMatches: Record<string, { url: string; bbox?: MenuImageBBox | null }> = {};
      if (menuImageBase64 && menuMimeType) {
        try {
          const dishNames = dishes.map(d => d.dish);
          const matches = await extractMenuImages(menuImageBase64, menuMimeType, dishNames);
          for (const m of matches) {
            if (m.image_url && m.dish_name) {
              menuMatches[m.dish_name.toLowerCase()] = { url: m.image_url, bbox: m.bbox };
            }
          }
          console.log(`Menu extraction found ${Object.keys(menuMatches).length} dish photos`);
        } catch (err) {
          console.warn("Menu image extraction failed, will generate all:", err);
        }
      }

      // Apply menu-extracted images immediately
      if (!cancelled && !abortRef.current) {
        const extracted: Record<number, string> = {};
        const bboxes: Record<number, MenuImageBBox> = {};
        dishes.forEach((d, i) => {
          const match = menuMatches[d.dish.toLowerCase()];
          if (match) {
            extracted[i] = match.url;
            if (match.bbox) bboxes[i] = match.bbox;
          }
        });
        if (Object.keys(extracted).length > 0) {
          setGeneratedImages(prev => ({ ...prev, ...extracted }));
          setImageBBoxes(prev => ({ ...prev, ...bboxes }));
        }
      }

      // Step 2: AI-generate images ONLY for dishes that have no image
      const dishesNeedingImages = dishes
        .map((d, i) => ({ dish: d, index: i }))
        .filter(({ dish, index }) => !dish.dish_image_url && !menuMatches[dish.dish.toLowerCase()]);

      if (dishesNeedingImages.length === 0) return;
      console.log(`Generating AI images for ${dishesNeedingImages.length} dishes without menu photos`);

      let consecutiveFailures = 0;

      for (const { dish, index } of dishesNeedingImages) {
        if (cancelled || abortRef.current) break;
        // Stop all generation after 2 consecutive failures (likely rate limited or out of credits)
        if (consecutiveFailures >= 2) {
          console.warn("Too many consecutive failures — stopping image generation");
          break;
        }
        setActiveGenerations(prev => new Set(prev).add(index));

        try {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-dish-image`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
              },
              body: JSON.stringify({
                dish_name: dish.dish,
                cooking_method: dish.cooking_method,
                ingredients: dish.ingredients_detected?.slice(0, 5),
              }),
            }
          );

          if (response.status === 402) {
            console.warn("AI credits exhausted (402) — stopping all image generation");
            abortRef.current = true;
            break;
          }

          if (response.status === 429) {
            console.warn(`Rate limited (429) for ${dish.dish} — skipping`);
            consecutiveFailures++;
            // Skip this dish, don't retry endlessly
            continue;
          }

          if (response.ok) {
            const data = await response.json();
            if (!cancelled && !abortRef.current && data?.image_url) {
              setGeneratedImages(prev => ({ ...prev, [index]: data.image_url }));
              consecutiveFailures = 0; // reset on success
            }
          } else {
            console.warn("Image generation failed for", dish.dish, response.status);
            consecutiveFailures++;
          }
        } catch (err) {
          console.warn("Image generation error for", dish.dish, err);
          consecutiveFailures++;
        }

        setActiveGenerations(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });

        if (!cancelled && !abortRef.current) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      abortRef.current = true;
    };
  }, [dishKey]);

  const handleExportJSON = () => {
    const exportData = dishes.map((dish, index) => ({
      dish_name: dish.dish,
      confidence: dish.confidence,
      confidence_score: dish.confidence_score ?? null,
      nutrition: dish.nutrition,
      ingredients_detected: dish.ingredients_detected || [],
      default_ingredients: dish.default_ingredients || [],
      optional_additions: dish.optional_additions || [],
      optional_removals: dish.optional_removals || [],
      cooking_method: dish.cooking_method || null,
      portion_size_g: dish.portion_size_g || null,
      recipe: dish.recipe || null,
      per_ingredient_nutrition: dish.per_ingredient_nutrition || null,
      allergens: dish.allergens || [],
      data_sources: dish.data_sources || [],
      notes: dish.notes || null,
      verification_notes: dish.verification_notes || null,
      image_url: generatedImages[index] || dish.dish_image_url || null,
    }));

    const blob = new Blob([JSON.stringify({ restaurant_context: restaurantContext || null, dishes: exportData }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "menu-export.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in">
      {/* Summary header — sticky on scroll */}
      <div className="sticky top-0 z-10 glass-panel rounded-2xl px-4 py-3 mb-6">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 pb-3 border-b border-border/50">
          {restaurantContext && (
            <div className="flex-1 min-w-0">
              <RestaurantContext context={restaurantContext} />
            </div>
          )}
          <div className="flex items-center gap-4 md:gap-6 text-sm font-mono text-muted-foreground shrink-0">
            <span className="flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5" />
              {totalDishes} dishes
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              {availableNutrition} analyzed
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              {highConfidence} high conf.
            </span>
            <Button variant="outline" size="sm" onClick={handleExportJSON} className="ml-auto gap-1.5 rounded-xl">
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Export for Ordering App</span>
              <span className="md:hidden">Export</span>
            </Button>
          </div>
        </div>
        {isRefining && (
          <div className="pt-2 text-xs font-mono text-primary text-center animate-pulse">
            ✦ Refining accuracy with ensemble verification…
          </div>
        )}
      </div>

      {/* Responsive masonry-like grid */}
      <div className="columns-1 md:columns-2 xl:columns-3 gap-4 space-y-4">
        {dishes.map((dish, index) => (
          <div key={index} className="break-inside-avoid">
            <DishCard
              dish={dish}
              index={index}
              onSave={onSaveDish}
              isLoggedIn={isLoggedIn}
              externalImage={generatedImages[index]}
              imageBBox={imageBBoxes[index]}
              imageLoading={activeGenerations.has(index)}
              imageQueued={!dish.dish_image_url && !generatedImages[index] && !activeGenerations.has(index) && activeGenerations.size > 0}
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 p-4 glass-panel rounded-2xl">
        <p className="text-xs text-muted-foreground text-center">
          Multi-method verified estimates. Expand dishes to adjust portions and ingredients.
          {!isLoggedIn && " Sign in to save dishes to your daily health log."}
        </p>
      </div>
    </div>
  );
};