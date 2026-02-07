import { DishCard, DishData } from "./DishCard";
import { FileText, Utensils, BarChart3 } from "lucide-react";

interface ResultsPanelProps {
  dishes: DishData[];
  menuSections?: { section: string; items: { name: string; description?: string }[] }[];
}

export const ResultsPanel = ({ dishes, menuSections }: ResultsPanelProps) => {
  const totalDishes = dishes.length;
  const availableNutrition = dishes.filter((d) => d.nutrition !== "unavailable").length;
  const highConfidence = dishes.filter((d) => d.confidence === "high").length;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Stats Header */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border-2 border-foreground rounded-lg text-center">
          <Utensils className="w-5 h-5 mx-auto mb-2" />
          <p className="text-2xl font-bold font-mono">{totalDishes}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Dishes Found</p>
        </div>
        <div className="p-4 border-2 border-foreground rounded-lg text-center">
          <BarChart3 className="w-5 h-5 mx-auto mb-2" />
          <p className="text-2xl font-bold font-mono">{availableNutrition}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">With Data</p>
        </div>
        <div className="p-4 border-2 border-foreground rounded-lg text-center">
          <FileText className="w-5 h-5 mx-auto mb-2" />
          <p className="text-2xl font-bold font-mono">{highConfidence}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">High Conf.</p>
        </div>
      </div>

      {/* Dishes List */}
      <div className="space-y-4">
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
      <div className="p-4 bg-secondary rounded-lg border border-border">
        <p className="text-xs text-muted-foreground text-center">
          All nutrition values are estimates based on standard serving sizes.
          Actual values may vary by restaurant preparation.
        </p>
      </div>
    </div>
  );
};
