import { DishCard, DishData } from "./DishCard";
import { RestaurantContext } from "./RestaurantContext";
import { FileText, Utensils, BarChart3 } from "lucide-react";

interface RestaurantContextData {
  type?: string;
  cuisine?: string;
  portion_style?: string;
  price_tier?: string;
}

interface ResultsPanelProps {
  dishes: DishData[];
  restaurantContext?: RestaurantContextData | null;
}

export const ResultsPanel = ({ dishes, restaurantContext }: ResultsPanelProps) => {
  const totalDishes = dishes.length;
  const availableNutrition = dishes.filter((d) => d.nutrition !== "unavailable").length;
  const highConfidence = dishes.filter((d) => d.confidence === "high").length;

  return (
    <div className="space-y-6 md:space-y-8 animate-fade-in">
      {/* Restaurant Context */}
      {restaurantContext && (
        <div className="space-y-2">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            Restaurant Context
          </p>
          <RestaurantContext context={restaurantContext} />
        </div>
      )}

      {/* Stats Header */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        <div className="p-3 md:p-4 border-2 border-foreground rounded-xl text-center">
          <Utensils className="w-5 h-5 mx-auto mb-2" />
          <p className="text-2xl font-bold font-mono">{totalDishes}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">Dishes</p>
        </div>
        <div className="p-3 md:p-4 border-2 border-foreground rounded-xl text-center">
          <BarChart3 className="w-5 h-5 mx-auto mb-2" />
          <p className="text-2xl font-bold font-mono">{availableNutrition}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">With Data</p>
        </div>
        <div className="p-3 md:p-4 border-2 border-foreground rounded-xl text-center">
          <FileText className="w-5 h-5 mx-auto mb-2" />
          <p className="text-2xl font-bold font-mono">{highConfidence}</p>
          <p className="text-[10px] md:text-xs text-muted-foreground uppercase tracking-wider">High Conf.</p>
        </div>
      </div>

      {/* Dishes List */}
      <div className="space-y-3 md:space-y-4">
        <h2 className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Analyzed Dishes
        </h2>
        <div className="space-y-3">
          {dishes.map((dish, index) => (
            <DishCard key={index} dish={dish} index={index} />
          ))}
        </div>
      </div>

      {/* Footer Note */}
      <div className="p-3 md:p-4 bg-secondary rounded-xl border border-border">
        <p className="text-xs text-muted-foreground text-center">
          All nutrition values are estimates. Use portion sliders and ingredient toggles to refine.
          Actual values may vary by restaurant preparation.
        </p>
      </div>
    </div>
  );
};
