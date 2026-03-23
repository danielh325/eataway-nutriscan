import { FoodSpot } from "@/data/types";
import { Heart } from "lucide-react";

interface FoodSpotCardProps {
  spot: FoodSpot;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (spot: FoodSpot) => void;
}

export default function FoodSpotCard({ spot, isFavorite, onToggleFavorite, onSelect }: FoodSpotCardProps) {
  return (
    <div
      className="cursor-pointer group active:scale-[0.97] transition-transform"
      onClick={() => onSelect(spot)}
    >
      <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-muted">
        <img
          src={spot.image}
          alt={spot.name}
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        {/* Heart overlay */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(spot.id); }}
          className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center transition-all hover:bg-background/80"
          aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Heart
            className={`h-4 w-4 transition-colors ${
              isFavorite ? "fill-red-500 text-red-500" : "text-foreground/70"
            }`}
          />
        </button>
        {/* Category badge */}
        {spot.categories[0] && (
          <span className="absolute bottom-2.5 left-2.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground">
            {spot.categories[0]}
          </span>
        )}
      </div>
      <div className="mt-2 px-0.5">
        <h3 className="font-semibold text-[14px] text-foreground truncate leading-tight">{spot.name}</h3>
        <p className="text-[12px] text-muted-foreground mt-0.5 truncate">
          ⭐ {spot.rating} · {spot.priceRange} · {spot.distance}
        </p>
      </div>
    </div>
  );
}
