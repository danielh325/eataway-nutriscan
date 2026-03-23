import { useState } from "react";
import { ArrowLeft, Search, ChevronRight, MapPin } from "lucide-react";
import { FoodSpot } from "@/data/types";
import toaPayohImg from "@/assets/toa-payoh.png";
import lauPaSatImg from "@/assets/lau-pa-sat.png";

interface Area {
  name: string;
  image: string;
  count: number;
  lat: number;
  lng: number;
}

interface SearchViewProps {
  spots: FoodSpot[];
  onClose: () => void;
  onSelectSpot: (spot: FoodSpot) => void;
  onSelectArea?: (area: { name: string; lat: number; lng: number }) => void;
}

const SINGAPORE_AREAS: Area[] = [
  { name: "Marina Bay", image: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=400&h=300&fit=crop", count: 12, lat: 1.2816, lng: 103.8636 },
  { name: "Chinatown", image: "https://images.unsplash.com/photo-1565967511849-76a60a516170?w=400&h=300&fit=crop", count: 8, lat: 1.2833, lng: 103.8443 },
  { name: "Orchard Road", image: "https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=400&h=300&fit=crop", count: 15, lat: 1.3006, lng: 103.8368 },
  { name: "Toa Payoh", image: toaPayohImg, count: 10, lat: 1.3343, lng: 103.8492 },
  { name: "Lau Pa Sat", image: lauPaSatImg, count: 9, lat: 1.2806, lng: 103.8504 },
];

export default function SearchView({ spots, onClose, onSelectSpot, onSelectArea }: SearchViewProps) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const filteredAreas = q
    ? SINGAPORE_AREAS.filter((a) => a.name.toLowerCase().includes(q))
    : [];

  const filteredSpots = q
    ? spots.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q) ||
          s.categories.some((c) => c.toLowerCase().includes(q))
      )
    : [];

  const recommendations = spots.slice(0, 5);

  const handleAreaClick = (area: Area) => {
    onSelectArea?.({ name: area.name, lat: area.lat, lng: area.lng });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[2000] bg-white flex flex-col">
      {/* Top bar */}
      <div
        className="flex items-center gap-3 px-4 pb-3"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 12px) + 12px)" }}
      >
        <button onClick={onClose} className="shrink-0 h-10 w-10 flex items-center justify-center" aria-label="Back">
          <ArrowLeft className="h-5 w-5 text-[hsl(220,20%,25%)]" />
        </button>
        <div className="flex-1 flex items-center h-11 rounded-full bg-[hsl(220,15%,95%)] px-4 gap-2.5">
          <Search className="h-4 w-4 text-[hsl(220,10%,55%)] shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search places or food spots"
            autoFocus
            className="flex-1 bg-transparent text-[hsl(220,20%,15%)] text-[15px] placeholder:text-[hsl(220,10%,55%)] outline-none"
          />
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {q ? (
          <div className="px-4 pt-2">
            {filteredAreas.length === 0 && filteredSpots.length === 0 ? (
              <p className="text-[hsl(220,10%,55%)] text-sm text-center py-10">No results found</p>
            ) : (
              <div className="space-y-0">
                {filteredAreas.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-[hsl(220,10%,55%)] uppercase tracking-wider pb-2 pt-1">Locations</p>
                    {filteredAreas.map((area) => (
                      <button
                        key={area.name}
                        onClick={() => handleAreaClick(area)}
                        className="w-full flex items-center gap-3 py-3.5 border-b border-[hsl(220,15%,92%)] text-left"
                      >
                        <div className="shrink-0 h-10 w-10 rounded-lg overflow-hidden">
                          <img src={area.image} alt={area.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[hsl(220,20%,15%)] text-[15px] font-medium truncate">{area.name}</p>
                          <p className="text-[hsl(220,10%,55%)] text-[13px] truncate mt-0.5">{area.count} spots nearby</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[hsl(220,10%,80%)] shrink-0" />
                      </button>
                    ))}
                  </>
                )}

                {filteredSpots.length > 0 && (
                  <>
                    <p className="text-[11px] font-semibold text-[hsl(220,10%,55%)] uppercase tracking-wider pb-2 pt-3">Food Spots</p>
                    {filteredSpots.map((spot) => (
                      <button
                        key={spot.id}
                        onClick={() => onSelectSpot(spot)}
                        className="w-full flex items-center gap-3 py-3.5 border-b border-[hsl(220,15%,92%)] text-left"
                      >
                        <div className="shrink-0 h-10 w-10 rounded-lg bg-[hsl(220,15%,95%)] flex items-center justify-center">
                          <MapPin className="h-4 w-4 text-[hsl(220,10%,55%)]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[hsl(220,20%,15%)] text-[15px] font-medium truncate">{spot.name}</p>
                          <p className="text-[hsl(220,10%,55%)] text-[13px] truncate mt-0.5">{spot.address}</p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[hsl(220,10%,80%)] shrink-0" />
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Area cards */}
            <div className="pt-4 pb-2">
              <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-hide">
                {SINGAPORE_AREAS.map((area) => (
                  <div
                    key={area.name}
                    onClick={() => handleAreaClick(area)}
                    className="shrink-0 w-[200px] h-[140px] rounded-2xl overflow-hidden relative cursor-pointer active:scale-[0.97] transition-transform"
                  >
                    <img src={area.image} alt={area.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
                      <span className="text-white font-semibold text-[15px]">{area.name}</span>
                      <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-white/20 backdrop-blur text-white/80 text-[11px] flex items-center justify-center">{area.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            <div className="px-4 pt-2">
              {recommendations.map((spot) => (
                <button
                  key={spot.id}
                  onClick={() => onSelectSpot(spot)}
                  className="w-full flex items-center gap-3 py-3.5 border-b border-[hsl(220,15%,92%)] text-left"
                >
                  <div className="shrink-0 h-10 w-10 rounded-lg bg-[hsl(220,15%,95%)] flex items-center justify-center">
                    <MapPin className="h-4 w-4 text-[hsl(220,10%,55%)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[hsl(220,20%,15%)] text-[15px] font-medium truncate">{spot.name}</p>
                    <p className="text-[hsl(220,10%,55%)] text-[13px] truncate mt-0.5">{spot.address}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-[hsl(220,10%,80%)] shrink-0" />
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
