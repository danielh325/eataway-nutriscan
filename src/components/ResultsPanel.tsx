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
  menuImageBase64?: string;
  menuMimeType?: string;
  isRefining?: boolean;
}

export const ResultsPanel = ({ dishes, restaurantContext, onSaveDish, isLoggedIn, menuImageBase64, menuMimeType, isRefining }: ResultsPanelProps) => {
  const totalDishes = dishes.length;
  const availableNutrition = dishes.filter((d) => d.nutrition !== "unavailable").length;
  const highConfidence = dishes.filter((d) => d.confidence === "high").length;

  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const abortRef = useRef(false);
  const [activeGenerations, setActiveGenerations] = useState<Set<number>>(new Set());

  const dishKey = dishes.map(d => d.dish).join("|");

  useEffect(() => {
    abortRef.current = false;
    let cancelled = false;

    const generateAllImages = async () => {
      const dishesNeedingImages = dishes
        .map((d, i) => ({ dish: d, index: i }))
        .filter(({ dish }) => !dish.dish_image_url);

      if (dishesNeedingImages.length === 0) return;

      for (const { dish, index } of dishesNeedingImages) {
        if (cancelled || abortRef.current) break;
        setActiveGenerations(prev => new Set(prev).add(index));

        let retries = 0;
        const maxRetries = 8;
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

            const isRateLimited =
              data?.error === "Rate limit exceeded" ||
              error?.message?.includes("429") ||
              error?.status === 429;

            if (isRateLimited) {
              retries++;
              const delay = 3000 * Math.pow(2, retries - 1);
              console.warn(`Rate limited for ${dish.dish}, retry ${retries}/${maxRetries} in ${delay}ms`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }

            if (!cancelled && !abortRef.current && data?.image_url) {
              setGeneratedImages(prev => ({ ...prev, [index]: data.image_url }));
              success = true;
            } else if (error || data?.error) {
              console.warn("Image generation failed for", dish.dish, data?.error || error);
            }
            break;
          } catch (err: any) {
            const msg = JSON.stringify(err) + (err?.message || "");
            if (msg.includes("429") || msg.includes("Rate limit") || msg.includes("rate limit")) {
              retries++;
              const delay = 3000 * Math.pow(2, retries - 1);
              console.warn(`Rate limited (catch) for ${dish.dish}, retry ${retries}/${maxRetries}`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            console.warn("Image generation error for", dish.dish);
            break;
          }
        }

        setActiveGenerations(prev => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });

        // Delay between dishes to reduce rate limits
        if (!cancelled && !abortRef.current) {
          await new Promise(r => setTimeout(r, 1500));
        }
      }
    };

    generateAllImages();

    return () => {
      cancelled = true;
      abortRef.current = true;
    };
  }, [dishKey]);

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