import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

interface IngredientTogglesProps {
  additions: string[];
  removals: string[];
  activeAdditions: Set<string>;
  activeRemovals: Set<string>;
  onToggleAdd: (ingredient: string) => void;
  onToggleRemove: (ingredient: string) => void;
}

export const IngredientToggles = ({
  additions,
  removals,
  activeAdditions,
  activeRemovals,
  onToggleAdd,
  onToggleRemove,
}: IngredientTogglesProps) => {
  return (
    <div className="space-y-3">
      <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Customize Ingredients
      </p>

      {additions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Add</p>
          <div className="flex flex-wrap gap-1.5">
            {additions.map((item) => {
              const isActive = activeAdditions.has(item);
              return (
                <button
                  key={item}
                  onClick={() => onToggleAdd(item)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-all",
                    isActive
                      ? "bg-success/15 border-success/40 text-success"
                      : "bg-secondary border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  <Plus className="w-3 h-3" />
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {removals.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-mono text-muted-foreground uppercase">Remove</p>
          <div className="flex flex-wrap gap-1.5">
            {removals.map((item) => {
              const isActive = activeRemovals.has(item);
              return (
                <button
                  key={item}
                  onClick={() => onToggleRemove(item)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border transition-all",
                    isActive
                      ? "bg-destructive/15 border-destructive/40 text-destructive line-through"
                      : "bg-secondary border-border text-muted-foreground hover:border-foreground/30"
                  )}
                >
                  <Minus className="w-3 h-3" />
                  {item}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
