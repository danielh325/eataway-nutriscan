import { ChevronDown, ChevronUp, Database, AlertCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { NutritionBar } from "./NutritionBar";
import { ConfidenceBadge } from "./ConfidenceBadge";

export interface DishData {
  dish: string;
  confidence: "high" | "medium" | "low";
  ingredients_detected: string[];
  nutrition: {
    calories_kcal: string;
    protein_g: string;
    carbs_g: string;
    fat_g: string;
    fiber_g?: string;
    sugar_g?: string;
    sodium_mg: string;
  } | "unavailable";
  data_sources: string[];
  notes?: string;
  reason?: string;
}

interface DishCardProps {
  dish: DishData;
  index: number;
}

export const DishCard = ({ dish, index }: DishCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasNutrition = dish.nutrition !== "unavailable";

  const parseRange = (value: string) => {
    const parts = value.split("–").map((v) => parseFloat(v.trim()));
    return { min: parts[0], max: parts[1] || parts[0] };
  };

  return (
    <div
      className="border-2 border-foreground rounded-lg overflow-hidden animate-slide-up bg-card"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <span className="font-mono text-xs text-muted-foreground w-8 shrink-0">
            #{String(index + 1).padStart(2, "0")}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-lg tracking-tight truncate">
              {dish.dish}
            </h3>
            {hasNutrition && dish.nutrition !== "unavailable" && (
              <p className="text-sm text-muted-foreground font-mono mt-0.5">
                {dish.nutrition.calories_kcal} kcal
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ConfidenceBadge confidence={dish.confidence} />
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t-2 border-foreground">
          {/* Ingredients */}
          <div className="p-5 border-b border-border">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-3">
              Detected Ingredients
            </p>
            <div className="flex flex-wrap gap-2">
              {(dish.ingredients_detected || []).map((ingredient, i) => (
                <span
                  key={i}
                  className="px-3 py-1.5 bg-secondary text-sm rounded-full border border-border"
                >
                  {ingredient}
                </span>
              ))}
            </div>
          </div>

          {/* Nutrition */}
          {hasNutrition && dish.nutrition !== "unavailable" ? (
            <div className="p-5 border-b border-border">
              <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-4">
                Nutrition Estimate
              </p>
              <div className="space-y-4">
                <NutritionBar
                  label="Calories"
                  value={dish.nutrition.calories_kcal}
                  unit="kcal"
                  max={1000}
                  color="foreground"
                />
                <NutritionBar
                  label="Protein"
                  value={dish.nutrition.protein_g}
                  unit="g"
                  max={100}
                  color="success"
                />
                <NutritionBar
                  label="Carbs"
                  value={dish.nutrition.carbs_g}
                  unit="g"
                  max={150}
                  color="warning"
                />
                <NutritionBar
                  label="Fat"
                  value={dish.nutrition.fat_g}
                  unit="g"
                  max={80}
                  color="destructive"
                />
                <NutritionBar
                  label="Sodium"
                  value={dish.nutrition.sodium_mg}
                  unit="mg"
                  max={2000}
                  color="muted-foreground"
                />
              </div>
            </div>
          ) : (
            <div className="p-5 border-b border-border">
              <div className="flex items-start gap-3 p-4 bg-secondary rounded-lg">
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

          {/* Data Sources & Notes */}
          <div className="p-5 bg-secondary/30">
            {(dish.data_sources?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Database className="w-3.5 h-3.5" />
                <span>Sources: {dish.data_sources.join(", ")}</span>
              </div>
            )}
            {dish.notes && (
              <p className="text-xs text-muted-foreground italic">{dish.notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
