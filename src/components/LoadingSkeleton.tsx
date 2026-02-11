import { useState, useEffect } from "react";

export const AnalysisSkeleton = () => {
  const steps = [
    { label: "Detecting restaurant context", icon: "🏪" },
    { label: "Decomposing ingredients", icon: "🧪" },
    { label: "Estimating portions", icon: "⚖️" },
    { label: "Calculating macros", icon: "📊" },
  ];

  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 2200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-20 md:py-28 animate-fade-in">
      {/* Animated ring */}
      <div className="relative w-16 h-16 mb-10">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 rounded-full border-2 border-foreground border-t-transparent animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-xl">
          {steps[activeStep].icon}
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-2.5 w-full max-w-xs">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 transition-all duration-500 ${
              i < activeStep
                ? "opacity-40"
                : i === activeStep
                ? "opacity-100"
                : "opacity-20"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors duration-500 ${
                i <= activeStep ? "bg-foreground" : "bg-border"
              }`}
            />
            <span className="text-sm font-mono text-muted-foreground">
              {step.label}
              {i === activeStep && (
                <span className="animate-pulse">…</span>
              )}
              {i < activeStep && " ✓"}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-10 text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
        Analyzing your menu
      </p>
    </div>
  );
};
