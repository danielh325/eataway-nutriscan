import { useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import MapView, { MapViewHandle, getTimeOfDay, TimePreset } from "@/components/MapView";
import BottomSheet from "@/components/BottomSheet";
import SearchFilterBar from "@/components/SearchFilterBar";
import FoodSpotCard from "@/components/FoodSpotCard";
import SpotDetail from "@/components/SpotDetail";
import RecommendationCard from "@/components/RecommendationCard";
import SearchView from "@/components/SearchView";
import DesktopSidePanel from "@/components/DesktopSidePanel";
import { SuggestVendorDialog } from "@/components/SuggestVendorDialog";

import { foodSpots } from "@/data/foodSpots";
import { FoodSpot, GoalCategory, Review } from "@/data/types";
import { useFavorites } from "@/hooks/useFavorites";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePrescanMenus } from "@/hooks/usePrescanMenus";
import { Search, Navigation, ScanLine } from "lucide-react";

const Explore = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [goalCategory, setGoalCategory] = useState<GoalCategory>("All");
  const [selectedSpot, setSelectedSpot] = useState<FoodSpot | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);
  const [timePreset, setTimePreset] = useState<TimePreset>(getTimeOfDay());
  const [showList, setShowList] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [visibleBounds, setVisibleBounds] = useState<{ sw: [number, number]; ne: [number, number] } | null>(null);
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const mapRef = useRef<MapViewHandle>(null);
  const isMobile = useIsMobile();

  const spots = foodSpots;

  const filteredSpots = useMemo(() => {
    let result = spots;
    if (goalCategory !== "All") {
      result = result.filter((s) => s.categories.includes(goalCategory));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) => s.name.toLowerCase().includes(q) || s.categories.some((c) => c.toLowerCase().includes(q))
      );
    }
    return result;
  }, [spots, query, goalCategory]);

  // Filter to only spots visible in the current map viewport, auto-expand if < 6
  const MIN_SPOTS = 6;
  const viewportSpots = useMemo(() => {
    if (selectedSpot) return filteredSpots;
    if (!visibleBounds) return filteredSpots;
    const { sw, ne } = visibleBounds;
    const inView = filteredSpots.filter(
      (s) => s.lat >= sw[0] && s.lat <= ne[0] && s.lng >= sw[1] && s.lng <= ne[1]
    );
    if (inView.length >= MIN_SPOTS) return inView;

    const centerLat = (sw[0] + ne[0]) / 2;
    const centerLng = (sw[1] + ne[1]) / 2;
    const latSpan = (ne[0] - sw[0]) / 2;
    const lngSpan = (ne[1] - sw[1]) / 2;
    const expansions = [1.5, 2, 3, 4, 6, 10];
    for (const mult of expansions) {
      const expanded = filteredSpots.filter(
        (s) =>
          s.lat >= centerLat - latSpan * mult &&
          s.lat <= centerLat + latSpan * mult &&
          s.lng >= centerLng - lngSpan * mult &&
          s.lng <= centerLng + lngSpan * mult
      );
      if (expanded.length >= MIN_SPOTS) return expanded;
    }
    const byDist = [...filteredSpots].sort((a, b) => {
      const da = (a.lat - centerLat) ** 2 + (a.lng - centerLng) ** 2;
      const db = (b.lat - centerLat) ** 2 + (b.lng - centerLng) ** 2;
      return da - db;
    });
    return byDist.slice(0, MIN_SPOTS);
  }, [filteredSpots, visibleBounds, selectedSpot]);

  const favoriteSpots = useMemo(() => spots.filter((s) => favorites.includes(s.id)), [spots, favorites]);

  const topSpots = useMemo(() => {
    const sorted = [...viewportSpots].sort((a, b) => b.rating - a.rating);
    return sorted.slice(0, 5);
  }, [viewportSpots]);

  // Background pre-scan menus for the top viewport vendors so they load
  // instantly when the user clicks a vendor card. Pauses while a vendor is
  // selected (that view fetches itself).
  usePrescanMenus(topSpots, { enabled: !selectedSpot, limit: 8, delayMs: 5000 });

  const handleSelectSpot = useCallback((spot: FoodSpot) => {
    setSelectedSpot(spot);
    setShowList(false);
    mapRef.current?.flyToSpot(spot.lat, spot.lng);
  }, []);

  const handleAddReview = useCallback((spotId: string, review: Review) => {
    // Reviews are local-only for now
    setSelectedSpot((prev) =>
      prev?.id === spotId ? { ...prev, reviews: [review, ...prev.reviews], reviewCount: prev.reviewCount + 1 } : prev
    );
  }, []);

  const displaySpots = viewportSpots;

  const handleBoundsChange = useCallback((bounds: { sw: [number, number]; ne: [number, number] }) => {
    setVisibleBounds(bounds);
  }, []);

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      <MapView ref={mapRef} spots={viewportSpots} onSpotSelect={handleSelectSpot} flyTo={flyTo} timePreset={timePreset} onTimeChange={setTimePreset} onBoundsChange={handleBoundsChange} />

      {/* Desktop / Tablet: left side panel */}
      {!isMobile && (
        <DesktopSidePanel
          spots={spots}
          filteredSpots={displaySpots}
          selectedSpot={selectedSpot}
          goalCategory={goalCategory}
          onGoalChange={setGoalCategory}
          onSelectSpot={handleSelectSpot}
          onBack={() => { setSelectedSpot(null); mapRef.current?.resetView(); }}
          isFavorite={isFavorite}
          toggleFavorite={toggleFavorite}
          onAddReview={handleAddReview}
          onSearchClick={() => setShowSearch(true)}
        />
      )}

      {/* Mobile only: bottom sheet + cards */}
      {isMobile && (
        <>
          {/* Selected spot detail */}
          {selectedSpot && (
            <BottomSheet isDark={timePreset === "night"}>
              <SpotDetail
                spot={selectedSpot}
                isFavorite={isFavorite(selectedSpot.id)}
                onToggleFavorite={toggleFavorite}
                onBack={() => { setSelectedSpot(null); mapRef.current?.resetView(); }}
                onAddReview={handleAddReview}
              />
            </BottomSheet>
          )}

          {/* Unified pull-up bottom sheet with food list */}
          {!selectedSpot && (
            <>
              {/* Search bar */}
              <div
                className="fixed top-0 left-0 right-0 z-[1001]"
                style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}
              >
                <div className="mx-3 flex items-center gap-2">
                  <button
                    onClick={() => navigate("/")}
                    className="w-[48px] h-[48px] rounded-full bg-white/95 backdrop-blur-xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] flex items-center justify-center active:scale-95 transition-transform"
                    aria-label="Back to Scan"
                  >
                    <ScanLine className="h-[20px] w-[20px] text-[hsl(220,20%,15%)]" />
                  </button>
                  <div
                    className="flex-1 flex items-center h-[48px] rounded-full bg-white/95 backdrop-blur-xl shadow-[0_2px_16px_rgba(0,0,0,0.08)] pl-4 pr-2 cursor-pointer"
                    onClick={() => setShowSearch(true)}
                  >
                    <Search className="h-[18px] w-[18px] text-[hsl(220,10%,60%)] shrink-0" />
                    <span className="flex-1 text-[15px] text-[hsl(220,20%,15%)] font-medium ml-2.5">Search destination</span>
                  </div>
                  <SuggestVendorDialog />
                </div>
              </div>

              {/* Recommendation cards — only visible when sheet is collapsed */}
              {!showList && topSpots.length > 0 && (
                <div className="fixed bottom-[88px] left-0 right-0 z-[1000]">
                  <div className="flex justify-end gap-2 px-3 mb-2">
                    <button
                      onClick={() => mapRef.current?.geolocate()}
                      className="w-[42px] h-[42px] rounded-xl bg-white/95 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-95 transition-transform"
                      aria-label="My location"
                    >
                      <Navigation className="w-[18px] h-[18px] text-[hsl(220,20%,15%)]" strokeWidth={2.2} />
                    </button>
                    <button
                      onClick={() => mapRef.current?.toggle3D()}
                      className="w-[42px] h-[42px] rounded-xl bg-white/95 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.1)] flex items-center justify-center active:scale-95 transition-transform"
                      aria-label="Toggle 3D"
                    >
                      <span className="text-[13px] font-bold text-[hsl(220,20%,15%)] leading-none">{mapRef.current?.is3D ? "2D" : "3D"}</span>
                    </button>
                  </div>
                  <div
                    className="flex gap-3 overflow-x-auto px-3 pb-2 snap-x snap-mandatory scrollbar-hide"
                    style={{ scrollSnapType: "x mandatory" }}
                  >
                    {topSpots.map((spot) => (
                      <div key={spot.id} className="snap-center shrink-0 w-[calc(100%-24px)] first:ml-0">
                        <RecommendationCard
                          spot={spot}
                          isFavorite={isFavorite(spot.id)}
                          onToggleFavorite={toggleFavorite}
                          onSelect={handleSelectSpot}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Swipeable bottom sheet */}
              <BottomSheet
                isDark={timePreset === "night"}
                snapPoints={[0.1, 0.5, 0.88]}
                initialSnap={0}
                onSnapChange={(i) => setShowList(i > 0)}
              >
                {/* Info text shown at collapsed state */}
                <div className="flex items-center justify-center pb-3">
                  <span className="text-[15px] text-[hsl(220,10%,40%)] font-medium">
                    <span className="font-bold text-[hsl(220,20%,12%)]">{viewportSpots.length}</span> food spots nearby
                  </span>
                </div>

                {/* List content */}
                <div className="space-y-5">
                  <SearchFilterBar activeGoal={goalCategory} onGoalChange={setGoalCategory} />

                  {displaySpots.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      No spots match your search.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {displaySpots.map((spot) => (
                        <FoodSpotCard
                          key={spot.id}
                          spot={spot}
                          isFavorite={isFavorite(spot.id)}
                          onToggleFavorite={toggleFavorite}
                          onSelect={handleSelectSpot}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </BottomSheet>
            </>
          )}
        </>
      )}

      {/* Desktop/iPad floating map controls */}
      {!isMobile && !selectedSpot && (
        <div className="fixed bottom-6 right-6 z-[1001] flex flex-col gap-2">
          <button
            onClick={() => mapRef.current?.geolocate()}
            className="w-[44px] h-[44px] rounded-xl bg-white/95 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.1)] flex items-center justify-center hover:bg-white transition-colors"
            aria-label="My location"
          >
            <Navigation className="w-[18px] h-[18px] text-[hsl(220,20%,15%)]" strokeWidth={2.2} />
          </button>
          <button
            onClick={() => mapRef.current?.toggle3D()}
            className="w-[44px] h-[44px] rounded-xl bg-white/95 backdrop-blur-xl shadow-[0_2px_12px_rgba(0,0,0,0.1)] flex items-center justify-center hover:bg-white transition-colors"
            aria-label="Toggle 3D"
          >
            <span className="text-[13px] font-bold text-[hsl(220,20%,15%)] leading-none">{mapRef.current?.is3D ? "2D" : "3D"}</span>
          </button>
        </div>
      )}

      {/* Full-screen search view */}
      {showSearch && (
        <SearchView
          spots={spots}
          onClose={() => setShowSearch(false)}
          onSelectSpot={(spot) => {
            setShowSearch(false);
            handleSelectSpot(spot);
          }}
          onSelectArea={(area) => {
            setFlyTo([area.lat, area.lng]);
          }}
        />
      )}
    </div>
  );
};

export default Explore;
