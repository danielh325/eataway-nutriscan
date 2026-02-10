import { Slider } from "./ui/slider";

interface PortionSliderProps {
  defaultPortion: number;
  multiplier: number;
  onMultiplierChange: (value: number) => void;
}

export const PortionSlider = ({ defaultPortion, multiplier, onMultiplierChange }: PortionSliderProps) => {
  const currentGrams = Math.round(defaultPortion * multiplier);
  const percentage = Math.round(multiplier * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Portion Size
        </p>
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-mono font-semibold">{currentGrams}g</span>
          <span className="text-xs text-muted-foreground font-mono">({percentage}%)</span>
        </div>
      </div>
      <Slider
        value={[multiplier]}
        onValueChange={([v]) => onMultiplierChange(v)}
        min={0.25}
        max={2.5}
        step={0.05}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
        <span>¼ portion</span>
        <span>Standard</span>
        <span>2.5× portion</span>
      </div>
    </div>
  );
};
