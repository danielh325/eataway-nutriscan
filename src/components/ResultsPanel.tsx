import { useState, useEffect, useRef } from "react";
import { DishCard, DishData } from "./DishCard";
import { RestaurantContext } from "./RestaurantContext";
import { Utensils, BarChart3, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
}

export const ResultsPanel = ({ dishes, restaurantContext, onSaveDish, isLoggedIn }: ResultsPanelProps) => {
  const totalDishes = dishes.length;
  const availableNutrition = dishes.filter((d) => d.nutrition !== "unavailable").length;
  const highConfidence = dishes.filter((d) => d.confidence === "high").length;

  // Sequential image generation to avoid rate limits
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [imageLoadingIndex, setImageLoadingIndex] = useState<number | null>(null);
  const abortRef = useRef(false);

  const [activeGenerations, setActiveGenerations] = useState<Set<number>>(new Set());

  useEffect(() => {
    abortRef.current = false;
    const dishesNeedingImages = dishes
      .map((d, i) => ({ dish: d, index: i }))
      .filter(({ dish }) => !dish.has_image_in_menu && !dish.dish_image_url);

    if (dishesNeedingImages.length === 0) return;

    let cancelled = false;
    const generateSequentially = async () => {
      for (const { dish, index } of dishesNeedingImages) {
        if (cancelled || abortRef.current) break;

        setActiveGenerations(prev => new Set(prev).add(index));

        let retries = 0;
        const maxRetries = 4;
        let success = false;

        while (retries < maxRetries && !cancelled && !abortRef.current && !success) {
          try {
            const { data, error } = await supabase.functions.invoke("generate-dish-image", {
              body: {
                dish_name: dish.dish,
                cooking_method: dish.cooking_method,
                ingredients: dish.ingredients_detected?.slice(0, 5),
              },
            });

            // Handle rate limit from response body
            if (data?.error === "Rate limit exceeded") {
              retries++;
              const delay = 3000 * Math.pow(2, retries - 1);
              console.warn(`Rate limited for ${dish.dish}, retry ${retries}/${maxRetries} in ${delay}ms`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }

            if (!cancelled && !abortRef.current && data?.image_url) {
              setGeneratedImages(prev => ({ ...prev, [index]: data.image_url }));
              success = true;
            }

            if (error || data?.error) {
              console.warn("Image generation failed for", dish.dish, error?.message || data?.error);
            }
            break;
          } catch (err: any) {
            // supabase.functions.invoke throws on non-2xx — check for rate limit
            const msg = err?.message || err?.context?.body || "";
            if (typeof msg === "string" && msg.includes("Rate limit")) {
              retries++;
              const delay = 3000 * Math.pow(2, retries - 1);
              console.warn(`Rate limited (catch) for ${dish.dish}, retry ${retries}/${maxRetries} in ${delay}ms`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            console.warn("Image generation error for", dish.dish, err);
            break;
          }
        }

        setActiveGenerations(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });

        // Wait between dishes to avoid rate limits
        if (!cancelled && !abortRef.current) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
      setImageLoadingIndex(null);
    };

    generateSequentially();

    return () => {
      cancelled = true;
      abortRef.current = true;
    };
  }, [dishes]);

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
          </div>
        </div>
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
              imageLoading={activeGenerations.has(index)}
              imageQueued={!dish.has_image_in_menu && !dish.dish_image_url && !generatedImages[index] && !activeGenerations.has(index) && activeGenerations.size > 0}
            />
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-8 p-4 bg-secondary/50 rounded-xl border border-border">
        <p className="text-xs text-muted-foreground text-center">
          Multi-method verified estimates. Expand dishes to adjust portions and ingredients.
          {!isLoggedIn && " Sign in to save dishes to your daily health log."}
        </p>
      </div>
    </div>
  );
};