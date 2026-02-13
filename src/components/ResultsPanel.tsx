import { DishCard, DishData } from "./DishCard";
import { RestaurantContext } from "./RestaurantContext";
import { Utensils, BarChart3, ShieldCheck } from "lucide-react";

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

  return (
    <div className="animate-fade-in">
      {/* Top summary bar */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-6 pb-4 border-b border-border">
        {restaurantContext && (
          <RestaurantContext context={restaurantContext} />
        )}
        <div className="flex items-center gap-6 ml-auto text-sm font-mono text-muted-foreground">
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

      {/* Dishes grid — 2 columns on wide screens */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {dishes.map((dish, index) => (
          <DishCard key={index} dish={dish} index={index} onSave={onSaveDish} isLoggedIn={isLoggedIn} />
        ))}
      </div>

      {/* Footer Note */}
      <div className="mt-6 p-3 bg-secondary/50 rounded-xl border border-border">
        <p className="text-xs text-muted-foreground text-center">
          Multi-method verified estimates. Use portion sliders and ingredient toggles to refine.
          {!isLoggedIn && " Sign in to save dishes to your daily health log."}
        </p>
      </div>
    </div>
  );
};
