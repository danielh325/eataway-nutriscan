import { useState, useMemo, useCallback, useRef } from "react";
import { foodSpots } from "@/data/foodSpots";
import { FoodSpot, GoalCategory, GOAL_CATEGORIES, CATEGORY_EMOJI } from "@/data/types";
import { useFavorites } from "@/hooks/useFavorites";
import { Search, Heart, Star, MapPin, ChevronRight, Utensils, Loader2, Navigation, Map, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VendorDetail } from "@/components/VendorDetail";
import { SuggestVendorDialog } from "@/components/SuggestVendorDialog";
import MapView, { MapViewHandle } from "@/components/MapView";

type ViewMode = "map" | "list";

const Explore = () => {
  const [query, setQuery] = useState("");
  const [goalCategory, setGoalCategory] = useState<GoalCategory>("All");
  const [selectedSpot, setSelectedSpot] = useState<FoodSpot | null>(null);
  const [analyzingSpot, setAnalyzingSpot] = useState<string | null>(null);
  const [nutritionCache, setNutritionCache] = useState<Record<string, any>>({});
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { toast } = useToast();
  const mapRef = useRef<MapViewHandle>(null);

  const filteredSpots = useMemo(() => {
    let result = foodSpots;
    if (goalCategory !== "All") {
      result = result.filter((s) => s.categories.includes(goalCategory));
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.categories.some((c) => c.toLowerCase().includes(q)) ||
          s.menuHighlights.some((m) => m.toLowerCase().includes(q))
      );
    }
    return result;
  }, [query, goalCategory]);

  const handleAnalyzeVendor = useCallback(async (spot: FoodSpot) => {
    if (nutritionCache[spot.id]) return;
    setAnalyzingSpot(spot.id);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-vendor-nutrition", {
        body: {
          vendorName: spot.name,
          menuItems: spot.menuHighlights,
          cuisine: spot.categories.join(", "),
          description: spot.description,
        },
      });
      if (error) throw error;
      if (data?.dishes) {
        setNutritionCache((prev) => ({ ...prev, [spot.id]: data.dishes }));
        toast({ title: "Nutrition Analyzed", description: `Got data for ${data.dishes.length} items from ${spot.name}` });
      }
    } catch (err: any) {
      toast({ title: "Analysis Failed", description: err.message || "Could not analyze menu", variant: "destructive" });
    } finally {
      setAnalyzingSpot(null);
    }
  }, [nutritionCache, toast]);

  const handleSelectSpot = useCallback((spot: FoodSpot) => {
    setSelectedSpot(spot);
    mapRef.current?.flyToSpot(spot.lat, spot.lng);
    if (!nutritionCache[spot.id]) {
      handleAnalyzeVendor(spot);
    }
  }, [nutritionCache, handleAnalyzeVendor]);

  if (selectedSpot) {
    return (
      <VendorDetail
        spot={selectedSpot}
        isFavorite={isFavorite(selectedSpot.id)}
        onToggleFavorite={toggleFavorite}
        onBack={() => { setSelectedSpot(null); mapRef.current?.resetView(); }}
        nutritionData={nutritionCache[selectedSpot.id] || null}
        isAnalyzing={analyzingSpot === selectedSpot.id}
        onAnalyze={() => handleAnalyzeVendor(selectedSpot)}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Top controls */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search vendors, dishes, or cuisines..."
            className="pl-10 rounded-xl bg-card border-border"
          />
        </div>
        <div className="flex gap-1 bg-secondary/60 rounded-xl p-1">
          <button
            onClick={() => setViewMode("map")}
            className={`p-2 rounded-lg transition-all ${viewMode === "map" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Map className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
        <SuggestVendorDialog />
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {GOAL_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setGoalCategory(cat)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium transition-all whitespace-nowrap ${
              goalCategory === cat
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-secondary/60 text-secondary-foreground hover:bg-secondary"
            }`}
          >
            <span>{CATEGORY_EMOJI[cat] || "🍽️"}</span>
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{filteredSpots.length}</span> vendors found
        </p>
        {viewMode === "map" && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg" onClick={() => mapRef.current?.geolocate()}>
              <Navigation className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2 rounded-lg text-xs font-bold" onClick={() => mapRef.current?.toggle3D()}>
              {mapRef.current?.is3D ? "2D" : "3D"}
            </Button>
          </div>
        )}
      </div>

      {/* Map view */}
      {viewMode === "map" && (
        <div className="rounded-2xl overflow-hidden border border-border" style={{ height: "450px" }}>
          <MapView ref={mapRef} spots={filteredSpots} onSpotSelect={handleSelectSpot} />
        </div>
      )}

      {/* Vendor grid — always visible below map, or as primary in list mode */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSpots.map((spot) => (
          <div
            key={spot.id}
            onClick={() => handleSelectSpot(spot)}
            className="group cursor-pointer bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 hover:shadow-md transition-all"
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-muted">
              <img
                src={spot.image}
                alt={spot.name}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              <button
                onClick={(e) => { e.stopPropagation(); toggleFavorite(spot.id); }}
                className="absolute top-2.5 right-2.5 h-8 w-8 rounded-full bg-background/60 backdrop-blur-sm flex items-center justify-center"
              >
                <Heart className={`h-4 w-4 ${isFavorite(spot.id) ? "fill-red-500 text-red-500" : "text-foreground/70"}`} />
              </button>
              {spot.categories[0] && (
                <Badge className="absolute bottom-2.5 left-2.5 bg-accent text-accent-foreground text-[11px]">
                  {spot.categories[0]}
                </Badge>
              )}
              {nutritionCache[spot.id] && (
                <Badge className="absolute bottom-2.5 right-2.5 bg-primary text-primary-foreground text-[11px]">
                  <Utensils className="w-3 h-3 mr-1" />
                  Nutrition Ready
                </Badge>
              )}
            </div>
            <div className="p-3">
              <h3 className="font-semibold text-sm text-foreground truncate">{spot.name}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{spot.description}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5">
                  <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                  {spot.rating}
                </span>
                <span>·</span>
                <span>{spot.priceRange}</span>
                <span>·</span>
                <span>{spot.distance}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredSpots.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No vendors match your search.
        </div>
      )}
    </div>
  );
};

export default Explore;
