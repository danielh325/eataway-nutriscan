import { cn } from "@/lib/utils";

interface NutritionBarProps {
  label: string;
  value: string;
  unit: string;
  max: number;
  color: string;
}

export const NutritionBar = ({ label, value, unit, max, color }: NutritionBarProps) => {
  const parseRange = (val: string) => {
    // Handle both en-dash "–" and hyphen "-" range separators
    const enDashParts = val.split("–").map((v) => parseFloat(v.trim()));
    if (enDashParts.length === 2 && !isNaN(enDashParts[0]) && !isNaN(enDashParts[1])) {
      return { min: enDashParts[0], max: enDashParts[1] };
    }
    const hyphenParts = val.split("-").map((v) => parseFloat(v.trim()));
    if (hyphenParts.length === 2 && !isNaN(hyphenParts[0]) && !isNaN(hyphenParts[1])) {
      return { min: hyphenParts[0], max: hyphenParts[1] };
    }
    const single = parseFloat(val) || 0;
    return { min: single, max: single };
  };

  const range = parseRange(value);
  const minPercent = Math.min((range.min / max) * 100, 100);
  const maxPercent = Math.min((range.max / max) * 100, 100);
  const isRange = range.min !== range.max;

  const colorClasses: Record<string, string> = {
    foreground: "bg-foreground",
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    "muted-foreground": "bg-muted-foreground",
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-sm font-mono text-muted-foreground">
          {value} {unit}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden relative">
        {isRange ? (
          <>
            <div
              className={cn("absolute h-full rounded-full opacity-30", colorClasses[color])}
              style={{ width: `${maxPercent}%` }}
            />
            <div
              className={cn("absolute h-full rounded-full", colorClasses[color])}
              style={{ width: `${minPercent}%` }}
            />
          </>
        ) : (
          <div
            className={cn("h-full rounded-full transition-all duration-500", colorClasses[color])}
            style={{ width: `${minPercent}%` }}
          />
        )}
      </div>
    </div>
  );
};
