import { useState, useEffect } from "react";
import { Loader2, Check } from "lucide-react";

export const AnalysisSkeleton = () => {
  const steps = [
    "Detecting restaurant context",
    "Extracting dish names & recipes",
    "Decomposing ingredients",
    "Cross-referencing nutrition databases",
    "Estimating portions",
    "Calculating macros",
    "Verifying accuracy",
  ];

  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev < steps.length - 1 ? prev + 1 : prev));
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 md:py-32 animate-fade-in">
      <Loader2 className="w-8 h-8 text-foreground animate-spin mb-8" />

      <div className="space-y-1.5 w-full max-w-xs">
        {steps.map((step, i) => (
          <div
            key={i}
            className={`flex items-center gap-2.5 transition-all duration-500 ${
              i < activeStep
                ? "opacity-30"
                : i === activeStep
                ? "opacity-100"
                : "opacity-0 h-0 overflow-hidden"
            }`}
          >
            {i < activeStep ? (
              <Check className="w-3 h-3 text-muted-foreground shrink-0" />
            ) : (
              <div className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
            )}
            <span className="text-sm font-mono text-muted-foreground">
              {step}
              {i === activeStep && <span className="animate-pulse">…</span>}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-10 text-[10px] text-muted-foreground font-mono uppercase tracking-widest">
        Analyzing with maximum accuracy
      </p>
    </div>
  );
};
