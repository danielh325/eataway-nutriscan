import { FoodSpot } from "@/data/types";
import { Heart, Star } from "lucide-react";
import { usePlacesPhoto } from "@/hooks/usePlacesPhoto";

interface RecommendationCardProps {
  spot: FoodSpot;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onSelect: (spot: FoodSpot) => void;
}

export default function RecommendationCard({ spot, isFavorite, onToggleFavorite, onSelect }: RecommendationCardProps) {
  const imageUrl = usePlacesPhoto(spot.name, spot.image, {
    address: spot.address,
    categories: spot.categories,
  });

  return (
    <div
      className="bg-white/95 backdrop-blur-2xl rounded-[20px] overflow-hidden cursor-pointer active:scale-[0.98] transition-transform"
      onClick={() => onSelect(spot)}
    >
      <div className="flex">
        {/* Main image */}
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={spot.name}
            className="h-[120px] w-[120px] object-cover flex-shrink-0"
            loading="lazy"
          />
        ) : (
          <div className="h-[120px] w-[120px] flex-shrink-0 bg-muted flex items-center justify-center text-xs text-muted-foreground px-2 text-center">
            No photo yet
          </div>
        )}

        {/* Info section */}
        <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-1">
              <div className="min-w-0">
                <p className="text-[11px] text-[hsl(220_10%_55%)] font-medium">{spot.address.split(",").pop()?.trim() || "Singapore"}</p>
                <h3 className="font-bold text-[15px] text-[hsl(220_20%_10%)] leading-tight mt-0.5 line-clamp-1">{spot.name}</h3>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite(spot.id); }}
                className="shrink-0 mt-0.5"
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart className={`h-5 w-5 ${isFavorite ? "fill-blue-500 text-blue-500" : "text-[hsl(220_10%_70%)]"}`} />
              </button>
            </div>

            <div className="flex items-center gap-3 mt-2 text-[12px] text-[hsl(220_10%_45%)]">
              <span className="flex items-center gap-1">
                <span className="inline-block w-[14px] h-[14px] rounded-full bg-[hsl(200,70%,50%)] text-white text-[8px] leading-[14px] text-center">🌐</span>
                {spot.distance}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-[14px] h-[14px] rounded-full bg-[hsl(30,80%,55%)] text-white text-[8px] leading-[14px] text-center">⏱</span>
                {spot.hours.split("–")[0]?.trim() || spot.hours}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[13px] mt-2">
            <span className="font-bold text-[hsl(220_20%_10%)]">{spot.rating}</span>
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-[hsl(220_10%_55%)]">{spot.reviewCount.toLocaleString()} reviews</span>
          </div>
        </div>
      </div>
    </div>
  );
}
