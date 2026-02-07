import { cn } from "@/lib/utils";

interface ConfidenceBadgeProps {
  confidence: "high" | "medium" | "low";
}

export const ConfidenceBadge = ({ confidence }: ConfidenceBadgeProps) => {
  const configs = {
    high: {
      label: "HIGH",
      className: "bg-success/10 text-success border-success/30",
    },
    medium: {
      label: "MED",
      className: "bg-warning/10 text-warning border-warning/30",
    },
    low: {
      label: "LOW",
      className: "bg-destructive/10 text-destructive border-destructive/30",
    },
  };

  const config = configs[confidence];

  return (
    <span
      className={cn(
        "px-2 py-0.5 text-[10px] font-mono font-bold tracking-wider border rounded",
        config.className
      )}
    >
      {config.label}
    </span>
  );
};
