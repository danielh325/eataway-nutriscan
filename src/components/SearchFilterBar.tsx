import { GoalCategory, GOAL_CATEGORIES } from "@/data/types";
import { CATEGORY_ICONS } from "@/data/categoryIcons";

interface SearchFilterBarProps {
  activeGoal: GoalCategory;
  onGoalChange: (c: GoalCategory) => void;
}

export default function SearchFilterBar({ activeGoal, onGoalChange }: SearchFilterBarProps) {
  return (
    <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
      <div className="flex gap-2 pb-1">
        {GOAL_CATEGORIES.map((cat) => {
          const active = activeGoal === cat;
          return (
            <button
              key={cat}
              onClick={() => onGoalChange(cat)}
              className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all whitespace-nowrap ${
              active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-secondary/60 text-secondary-foreground hover:bg-secondary"
              }`}
            >
              <img
                src={CATEGORY_ICONS[cat]}
                alt={cat}
                className="w-5 h-5 object-contain"
              />
              {cat}
            </button>
          );
        })}
      </div>
    </div>
  );
}
