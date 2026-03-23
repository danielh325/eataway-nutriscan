import { FoodSpot, GoalCategory } from "@/data/types";
import { Review } from "@/data/types";
import { Search } from "lucide-react";
import SearchFilterBar from "./SearchFilterBar";
import FoodSpotCard from "./FoodSpotCard";
import SpotDetail from "./SpotDetail";
import { SuggestVendorDialog } from "./SuggestVendorDialog";

interface DesktopSidePanelProps {
  spots: FoodSpot[];
  filteredSpots: FoodSpot[];
  selectedSpot: FoodSpot | null;
  goalCategory: GoalCategory;
  onGoalChange: (c: GoalCategory) => void;
  onSelectSpot: (spot: FoodSpot) => void;
  onBack: () => void;
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
  onAddReview: (spotId: string, review: Review) => void;
  onSearchClick: () => void;
}

export default function DesktopSidePanel({
  spots,
  filteredSpots,
  selectedSpot,
  goalCategory,
  onGoalChange,
  onSelectSpot,
  onBack,
  isFavorite,
  toggleFavorite,
  onAddReview,
  onSearchClick,
}: DesktopSidePanelProps) {
  return (
    <div className="absolute top-0 left-0 bottom-0 w-[420px] z-[1001] flex flex-col sheet-panel border-r border-[hsl(220_10%_90%)]">
      {/* Search bar — hidden when viewing spot detail */}
      {!selectedSpot && (
        <div className="px-4 pt-5 pb-3 flex items-center gap-2">
          <div
            className="flex-1 flex items-center h-[44px] rounded-full bg-[hsl(220,15%,95%)] pl-4 pr-4 cursor-pointer hover:bg-[hsl(220,15%,92%)] transition-colors"
            onClick={onSearchClick}
          >
            <Search className="h-[17px] w-[17px] text-[hsl(220,10%,55%)] shrink-0" />
            <span className="flex-1 text-[14px] text-[hsl(220,10%,50%)] ml-2.5">Search destination</span>
          </div>
          <SuggestVendorDialog />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {selectedSpot ? (
          <SpotDetail
            spot={selectedSpot}
            isFavorite={isFavorite(selectedSpot.id)}
            onToggleFavorite={toggleFavorite}
            onBack={onBack}
            onAddReview={onAddReview}
          />
        ) : (
          <div className="space-y-5">
            <SearchFilterBar activeGoal={goalCategory} onGoalChange={onGoalChange} />

            <div className="flex items-center justify-between">
              <span className="text-[13px] text-[hsl(220,10%,45%)] font-medium">
                <span className="font-bold text-[hsl(220,20%,12%)]">{filteredSpots.length}</span> nutritious meals near you
              </span>
            </div>

            {filteredSpots.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No spots match your search.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredSpots.map((spot) => (
                  <FoodSpotCard
                    key={spot.id}
                    spot={spot}
                    isFavorite={isFavorite(spot.id)}
                    onToggleFavorite={toggleFavorite}
                    onSelect={onSelectSpot}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
