import { Skeleton } from "./ui/skeleton";

export const AnalysisSkeleton = () => {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* Stats skeleton */}
      <div className="grid grid-cols-3 gap-3 md:gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-4 border-2 border-border rounded-xl">
            <Skeleton className="w-5 h-5 mx-auto mb-2 rounded-full" />
            <Skeleton className="h-7 w-12 mx-auto mb-2" />
            <Skeleton className="h-3 w-16 mx-auto" />
          </div>
        ))}
      </div>

      {/* Pipeline steps */}
      <div className="space-y-2">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Extraction Pipeline
        </p>
        <div className="space-y-1.5">
          {["Detecting restaurant context...", "Decomposing ingredients...", "Estimating portions...", "Calculating macros..."].map((step, i) => (
            <div
              key={i}
              className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
              style={{ animationDelay: `${i * 600}ms` }}
            >
              <div className="w-4 h-4 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-mono text-muted-foreground">{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Dish card skeletons */}
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="border-2 border-border rounded-xl p-4 md:p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="w-7 h-4" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="w-12 h-5 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
