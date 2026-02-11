export const AnalysisSkeleton = () => {
  const steps = [
    "Detecting restaurant context",
    "Decomposing ingredients",
    "Estimating portions",
    "Calculating macros",
  ];

  return (
    <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
      {/* Pulsing icon */}
      <div className="w-12 h-12 mb-8 rounded-full border-2 border-foreground border-t-transparent animate-spin" />

      {/* Steps */}
      <div className="space-y-3 w-full max-w-xs">
        {steps.map((step, i) => (
          <p
            key={i}
            className="text-xs font-mono text-muted-foreground text-center animate-pulse"
            style={{ animationDelay: `${i * 400}ms` }}
          >
            {step}…
          </p>
        ))}
      </div>

      <p className="mt-8 text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
        Analyzing your menu
      </p>
    </div>
  );
};
