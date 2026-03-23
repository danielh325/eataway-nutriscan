import { Menu } from "lucide-react";

interface TopBarProps {
  onListToggle: () => void;
}

const TopBar = ({ onListToggle }: TopBarProps) => {
  return (
    <div
      className="absolute top-0 left-0 z-[999] px-4 pb-3"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 12px) + 12px)" }}
    >
      <button
        onClick={onListToggle}
        className="flex items-center gap-2 h-10 px-4 rounded-full bg-white/90 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.08)] border border-[hsl(0_0%_0%/0.06)] transition-all active:scale-95"
        aria-label="Toggle list view"
      >
        <Menu className="h-4 w-4 text-[hsl(220_20%_15%)]" />
        <span className="text-sm font-semibold text-[hsl(220_20%_15%)]">List</span>
      </button>
    </div>
  );
};

export default TopBar;
