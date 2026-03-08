import { useState, useEffect, useRef } from "react";
import { DishCard, DishData } from "./DishCard";
import { RestaurantContext } from "./RestaurantContext";
import { Utensils, BarChart3, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { extractMenuImages, MenuImageMatch } from "@/lib/api/menu";

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

  // Image state
  const [generatedImages, setGeneratedImages] = useState<Record<number, string>>({});
  const [imageLoadingIndex, setImageLoadingIndex] = useState<number | null>(null);
  const abortRef = useRef(false);
  const [activeGenerations, setActiveGenerations] = useState<Set<number>>(new Set());
  const [extractingMenuImages, setExtractingMenuImages] = useState(false);
  const [menuExtractedImages, setMenuExtractedImages] = useState<Record<number, string>>({});

  // Use dish names as stable key to avoid restarting image generation on refinement
  const dishKey = dishes.map(d => d.dish).join("|");

  useEffect(() => {
    abortRef.current = false;
    let cancelled = false;

    const processImages = async () => {
      // Step 1: Try to extract real food images from the menu photo
      const matchedIndices = new Set<number>();

      if (menuImageBase64 && menuMimeType) {
        setExtractingMenuImages(true);
        const dishNames = dishes.map(d => d.dish);

        try {
          const matches = await extractMenuImages(menuImageBase64, menuMimeType, dishNames);
          console.log(`Extracted ${matches.length} real food images from menu`);

          for (const match of matches) {
            if (cancelled || abortRef.current) break;
            // Find the dish index that matches
            const dishIndex = dishes.findIndex(
              d => d.dish.toLowerCase() === match.dish_name.toLowerCase()
            );
            if (dishIndex !== -1 && match.image_url) {
              matchedIndices.add(dishIndex);
              setMenuExtractedImages(prev => ({ ...prev, [dishIndex]: match.image_url }));
              // Also mark as having a real image
              setGeneratedImages(prev => ({ ...prev, [dishIndex]: match.image_url }));
            }
          }
        } catch (err) {
          console.warn("Menu image extraction failed, falling back to AI generation:", err);
        }
        setExtractingMenuImages(false);
      }

      if (cancelled || abortRef.current) return;

      // Step 2: Generate AI images for dishes that don't have real photos
      const dishesNeedingImages = dishes
        .map((d, i) => ({ dish: d, index: i }))
        .filter(({ dish, index }) =>
          !matchedIndices.has(index) &&
          !dish.dish_image_url
        );

      if (dishesNeedingImages.length === 0) return;

      const generateOne = async ({ dish, index }: { dish: DishData; index: number }) => {
        if (cancelled || abortRef.current) return;
        setActiveGenerations(prev => new Set(prev).add(index));

        let retries = 0;
        const maxRetries = 6;
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

            // Check for rate limit in data response or error
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
            }

            if (!success && (error || data?.error)) {
              console.warn("Image generation skipped for", dish.dish);
            }
            break;
          } catch (err: any) {
            const msg = JSON.stringify(err) + (err?.message || "") + (err?.context?.body || "");
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
      };

      // Process in pairs of 2 with shorter delay
      for (let i = 0; i < dishesNeedingImages.length; i += 2) {
        if (cancelled || abortRef.current) break;
        const batch = dishesNeedingImages.slice(i, i + 2);
        await Promise.all(batch.map(item => generateOne(item)));
        if (!cancelled && !abortRef.current && i + 2 < dishesNeedingImages.length) {
          await new Promise(r => setTimeout(r, 800));
        }
      }
    };

    processImages();

    return () => {
      cancelled = true;
      abortRef.current = true;
    };
  }, [dishes, menuImageBase64, menuMimeType]);

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
        {extractingMenuImages && (
          <div className="pt-2 text-xs font-mono text-muted-foreground text-center animate-pulse">
            Extracting food photos from menu…
          </div>
        )}
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
              imageLoading={activeGenerations.has(index) || (extractingMenuImages && !generatedImages[index])}
              imageQueued={!dish.dish_image_url && !generatedImages[index] && !activeGenerations.has(index) && (activeGenerations.size > 0 || extractingMenuImages)}
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