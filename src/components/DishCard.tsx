import { ChevronDown, ChevronUp, Database, AlertCircle, AlertTriangle, SlidersHorizontal, Save, BookOpen, ShieldCheck, ImageIcon, Loader2 } from "lucide-react";
import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { NutritionBar } from "./NutritionBar";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { PortionSlider } from "./PortionSlider";
import { IngredientToggles } from "./IngredientToggles";


export interface PerIngredientNutrition {
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface DishRecipe {
  method?: string;
  key_quantities?: string[];
}

export interface DishData {
  dish: string;
  confidence: "high" | "medium" | "low";
  confidence_score?: number;
  ingredients_detected: string[];
  default_ingredients?: string[];
  optional_additions?: string[];
  optional_removals?: string[];
  cooking_method?: string;
  portion_size_g?: number;
  recipe?: DishRecipe;
  verification_notes?: string;
  has_image_in_menu?: boolean;
  dish_image_url?: string;
  nutrition: {
    calories_kcal: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
    fiber_g?: string;
    sugar_g?: string;
    sodium_mg: string;
  } | "unavailable";
  per_ingredient_nutrition?: Record<string, PerIngredientNutrition>;
  data_sources: string[];
  notes?: string;
  reason?: string;
}

interface DishCardProps {
  dish: DishData;
  index: number;
  onSave?: (dish: DishData, calories: number, protein: number, carbs: number, fat: number, portionMultiplier: number) => void;
  isLoggedIn?: boolean;
  externalImage?: string;
  imageLoading?: boolean;
}

const parseRangeMid = (value: string): number => {
  const parts = value.split("–").map((v) => parseFloat(v.trim()));
  if (parts.length === 2) return (parts[0] + parts[1]) / 2;
  const dashParts = value.split("-").map((v) => parseFloat(v.trim()));
  if (dashParts.length === 2 && !isNaN(dashParts[0]) && !isNaN(dashParts[1])) return (dashParts[0] + dashParts[1]) / 2;
  return parseFloat(value) || 0;
};
const findIngredientNutrition = (name: string, perIngr: Record<string, PerIngredientNutrition>): PerIngredientNutrition | null => {
  const lower = name.toLowerCase();
  if (perIngr[name]) return perIngr[name];
  for (const key of Object.keys(perIngr)) {
    if (key.toLowerCase() === lower) return perIngr[key];
  }
  for (const key of Object.keys(perIngr)) {
    const keyLower = key.toLowerCase();
    if (keyLower.includes(lower) || lower.includes(keyLower)) return perIngr[key];
  }
  return null;
};

export const DishCard = ({ dish, index, onSave, isLoggedIn, externalImage, imageLoading: externalImageLoading }: DishCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [portionMultiplier, setPortionMultiplier] = useState(1);
  const [removedIngredients, setRemovedIngredients] = useState<Set<string>>(new Set());
  const [addedIngredients, setAddedIngredients] = useState<Set<string>>(new Set());
  const generatedImage = externalImage || dish.dish_image_url || null;
  const imageLoading = externalImageLoading || false;
  const hasNutrition = dish.nutrition !== "unavailable";
  const isLowConfidence = dish.confidence === "low";
  const adjustedNutrition = useMemo(() => {
    if (!hasNutrition || dish.nutrition === "unavailable") return null;

    const base = {
      calories_kcal: parseRangeMid(dish.nutrition.calories_kcal),
      protein_g: parseRangeMid(dish.nutrition.protein_g),
      carbs_g: parseRangeMid(dish.nutrition.carbs_g),
      fat_g: parseRangeMid(dish.nutrition.fat_g),
      sodium_mg: parseRangeMid(dish.nutrition.sodium_mg),
    };

    // Subtract removed ingredients
    const perIngr = dish.per_ingredient_nutrition || {};
    for (const name of removedIngredients) {
      const n = findIngredientNutrition(name, perIngr);
      if (n) {
        base.calories_kcal -= n.calories_kcal;
        base.protein_g -= n.protein_g;
        base.carbs_g -= n.carbs_g;
        base.fat_g -= n.fat_g;
      }
    }

    // Add added ingredients
    for (const name of addedIngredients) {
      const n = findIngredientNutrition(name, perIngr);
      if (n) {
        base.calories_kcal += n.calories_kcal;
        base.protein_g += n.protein_g;
        base.carbs_g += n.carbs_g;
        base.fat_g += n.fat_g;
      }
    }

    // Apply portion multiplier
    return {
      calories_kcal: Math.round(base.calories_kcal * portionMultiplier),
      protein_g: Math.round(base.protein_g * portionMultiplier),
      carbs_g: Math.round(base.carbs_g * portionMultiplier),
      fat_g: Math.round(base.fat_g * portionMultiplier),
      sodium_mg: Math.round(base.sodium_mg * portionMultiplier),
    };
  }, [dish, portionMultiplier, removedIngredients, addedIngredients, hasNutrition]);

  const toggleRemove = (ingredient: string) => {
    setRemovedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(ingredient)) next.delete(ingredient);
      else next.add(ingredient);
      return next;
    });
  };

  const toggleAdd = (ingredient: string) => {
    setAddedIngredients(prev => {
      const next = new Set(prev);
      if (next.has(ingredient)) next.delete(ingredient);
      else next.add(ingredient);
      return next;
    });
  };

  return (
    <div
      className={cn(
        "border-2 rounded-xl overflow-hidden animate-slide-up bg-card transition-all",
        isLowConfidence ? "border-destructive/50" : "border-foreground"
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Low confidence banner */}
      {isLowConfidence && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive text-xs font-mono">
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>LOW CONFIDENCE — MANUAL REVIEW RECOMMENDED</span>
        </div>
      )}

      {/* Dish Image */}
      {generatedImage && (
        <div className="w-full h-40 md:h-48 overflow-hidden">
          <img
            src={generatedImage}
            alt={dish.dish}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      {imageLoading && (
        <div className="w-full h-40 md:h-48 bg-secondary flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-mono">Generating image…</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-4 md:p-5 cursor-pointer hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0">
          <span className="font-mono text-xs text-muted-foreground w-7 shrink-0">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-base md:text-lg tracking-tight truncate">
              {dish.dish}
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              {adjustedNutrition && (
                <span className="text-sm text-muted-foreground font-mono">
                  {adjustedNutrition.calories_kcal} kcal
                </span>
              )}
              {dish.cooking_method && (
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                  {dish.cooking_method}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-3 shrink-0">
          <ConfidenceBadge confidence={dish.confidence} score={dish.confidence_score} />
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t-2 border-foreground/20">
          {/* Ingredients */}
          <div className="p-4 md:p-5 border-b border-border">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
              Detected Ingredients
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(dish.ingredients_detected || []).map((ingredient, i) => (
                <span
                  key={i}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded-full border transition-all",
                    removedIngredients.has(ingredient)
                      ? "bg-destructive/10 border-destructive/30 text-destructive line-through opacity-60"
                      : "bg-secondary border-border"
                  )}
                  onClick={() => {
                    if (dish.optional_removals?.includes(ingredient)) toggleRemove(ingredient);
                  }}
                  role={dish.optional_removals?.includes(ingredient) ? "button" : undefined}
                >
                  {ingredient}
                </span>
              ))}
            </div>
          </div>

          {/* Ingredient Toggles */}
          {((dish.optional_additions?.length || 0) > 0 || (dish.optional_removals?.length || 0) > 0) && (
            <div className="p-4 md:p-5 border-b border-border">
              <IngredientToggles
                additions={dish.optional_additions || []}
                removals={dish.optional_removals || []}
                activeAdditions={addedIngredients}
                activeRemovals={removedIngredients}
                onToggleAdd={toggleAdd}
                onToggleRemove={toggleRemove}
              />
            </div>
          )}

          {/* Portion Slider */}
          {hasNutrition && (
            <div className="p-4 md:p-5 border-b border-border">
              <PortionSlider
                defaultPortion={dish.portion_size_g || 300}
                multiplier={portionMultiplier}
                onMultiplierChange={setPortionMultiplier}
              />
            </div>
          )}

          {/* Nutrition */}
          {hasNutrition && adjustedNutrition ? (
            <div className="p-4 md:p-5 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                  Adjusted Nutrition
                </p>
                {(portionMultiplier !== 1 || removedIngredients.size > 0 || addedIngredients.size > 0) && (
                  <span className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">
                    MODIFIED
                  </span>
                )}
              </div>
              <div className="space-y-3">
                <NutritionBar
                  label="Calories"
                  value={String(adjustedNutrition.calories_kcal)}
                  unit="kcal"
                  max={1000}
                  color="foreground"
                />
                <NutritionBar
                  label="Protein"
                  value={String(adjustedNutrition.protein_g)}
                  unit="g"
                  max={100}
                  color="success"
                />
                <NutritionBar
                  label="Carbs"
                  value={String(adjustedNutrition.carbs_g)}
                  unit="g"
                  max={150}
                  color="warning"
                />
                <NutritionBar
                  label="Fat"
                  value={String(adjustedNutrition.fat_g)}
                  unit="g"
                  max={80}
                  color="destructive"
                />
                <NutritionBar
                  label="Sodium"
                  value={String(adjustedNutrition.sodium_mg)}
                  unit="mg"
                  max={2000}
                  color="muted-foreground"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 md:p-5 border-b border-border">
              <div className="flex items-start gap-3 p-3 bg-secondary rounded-lg">
                <AlertCircle className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sm">Nutrition Unavailable</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {dish.reason || "Insufficient ingredient specificity to compute verified nutrition"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Recipe */}
          {dish.recipe?.method && (
            <div className="p-4 md:p-5 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-3.5 h-3.5 text-muted-foreground" />
                <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Recipe</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{dish.recipe.method}</p>
              {dish.recipe.key_quantities && dish.recipe.key_quantities.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {dish.recipe.key_quantities.map((q, i) => (
                    <span key={i} className="px-2 py-0.5 text-[10px] font-mono bg-secondary rounded-full border border-border">
                      {q}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Data Sources, Verification & Notes */}
          <div className="p-4 md:p-5 bg-secondary/30">
            {(dish.data_sources?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Database className="w-3.5 h-3.5" />
                <span>Sources: {dish.data_sources.join(", ")}</span>
              </div>
            )}
            {dish.confidence_score !== undefined && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Confidence: {(dish.confidence_score * 100).toFixed(0)}%</span>
              </div>
            )}
            {dish.verification_notes && (
              <div className="flex items-start gap-2 text-xs text-muted-foreground mb-2">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{dish.verification_notes}</span>
              </div>
            )}
            {dish.notes && (
              <p className="text-xs text-muted-foreground italic mb-2">{dish.notes}</p>
            )}
            {onSave && hasNutrition && adjustedNutrition && (
              <button
                onClick={() => onSave(dish, adjustedNutrition.calories_kcal, adjustedNutrition.protein_g, adjustedNutrition.carbs_g, adjustedNutrition.fat_g, portionMultiplier)}
                className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-foreground text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
              >
                <Save className="w-3.5 h-3.5" />
                {isLoggedIn ? "Save to Daily Log" : "Sign in to Save"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
