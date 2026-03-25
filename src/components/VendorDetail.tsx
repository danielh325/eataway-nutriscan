import { FoodSpot } from "@/data/types";
import { ArrowLeft, Heart, Star, MapPin, Clock, Phone, Navigation, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VendorMenu } from "@/components/VendorMenu";

interface VendorDetailProps {
  spot: FoodSpot;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onBack: () => void;
}

export function VendorDetail({
  spot,
  isFavorite,
  onToggleFavorite,
  onBack,
  nutritionData,
  isAnalyzing,
  onAnalyze,
}: VendorDetailProps) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;

  const handleExport = () => {
    const exportData = {
      vendor: {
        name: spot.name,
        description: spot.description,
        categories: spot.categories,
        rating: spot.rating,
        reviewCount: spot.reviewCount,
        priceRange: spot.priceRange,
        address: spot.address,
        hours: spot.hours,
        phone: spot.phone,
        image: spot.image,
        lat: spot.lat,
        lng: spot.lng,
      },
      menu: (nutritionData || []).map((item) => ({
        dish_name: item.dish,
        calories_kcal: item.nutrition.calories_kcal,
        protein_g: item.nutrition.protein_g,
        carbs_g: item.nutrition.carbs_g,
        fat_g: item.nutrition.fat_g,
        confidence: item.confidence,
        ingredients: item.ingredients_detected || [],
      })),
      exported_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${spot.name.replace(/[^a-zA-Z0-9]/g, "_")}_nutrition.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero image */}
      <div className="relative -mx-4 -mt-4 md:-mx-0 md:-mt-0">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-b-2xl md:rounded-2xl bg-muted">
          <img src={spot.image} alt={spot.name} className="w-full h-full object-cover" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 rounded-b-2xl md:rounded-2xl" />

        <button
          onClick={onBack}
          className="absolute top-3 left-3 h-9 w-9 rounded-full bg-background/90 backdrop-blur-xl flex items-center justify-center shadow-md"
        >
          <ArrowLeft className="h-4 w-4 text-foreground" />
        </button>

        <button
          onClick={() => onToggleFavorite(spot.id)}
          className="absolute top-3 right-3 h-9 w-9 rounded-full bg-background/90 backdrop-blur-xl flex items-center justify-center shadow-md"
        >
          <Heart className={`h-4 w-4 ${isFavorite ? "fill-red-500 text-red-500" : "text-foreground"}`} />
        </button>

        <div className="absolute bottom-3 left-3 right-3">
          <h2 className="font-bold text-lg text-white leading-tight drop-shadow-sm">{spot.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
            <span className="text-[13px] font-semibold text-white">{spot.rating}</span>
            <span className="text-white/50">·</span>
            <span className="text-[13px] text-white/80">{spot.reviewCount} reviews</span>
            <span className="text-white/50">·</span>
            <span className="text-[13px] text-white/80">{spot.priceRange}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground leading-relaxed">{spot.description}</p>

      {/* Categories */}
      <div className="flex flex-wrap gap-1.5">
        {spot.categories.map((cat) => (
          <Badge key={cat} variant="secondary" className="text-xs">
            {cat}
          </Badge>
        ))}
      </div>

      {/* Info card */}
      <div className="rounded-xl bg-card border border-border/40 divide-y divide-border/30 overflow-hidden">
        <div className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">{spot.address}</span>
        </div>
        <div className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">{spot.hours}</span>
        </div>
        <div className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
          <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">{spot.phone}</span>
        </div>
      </div>

      {/* Directions */}
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
        <Button className="w-full rounded-xl gap-2 h-11 text-sm font-semibold" size="lg">
          <Navigation className="h-4 w-4" />
          Get Directions
        </Button>
      </a>

      {/* Menu with Nutrition */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Utensils className="h-4 w-4 text-primary" />
            Menu & Nutrition
          </h3>
          <div className="flex gap-2">
            {nutritionData && (
              <Button variant="outline" size="sm" className="rounded-lg text-xs" onClick={handleExport}>
                <Download className="h-3 w-3 mr-1" />
                Export
              </Button>
            )}
            {!nutritionData && !isAnalyzing && (
              <Button size="sm" className="rounded-lg text-xs" onClick={onAnalyze}>
                Analyze Nutrition
              </Button>
            )}
          </div>
        </div>

        {isAnalyzing && (
          <div className="flex items-center justify-center py-8 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing menu items for nutrition...
          </div>
        )}

        <div className="space-y-2">
          {nutritionData
            ? nutritionData.map((item, i) => (
                <div key={i} className="p-3 rounded-xl bg-card border border-border/40">
                  <div className="flex items-start justify-between">
                    <h4 className="font-medium text-sm text-foreground">{item.dish}</h4>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        item.confidence === "high"
                          ? "border-green-500/30 text-green-600"
                          : item.confidence === "medium"
                          ? "border-yellow-500/30 text-yellow-600"
                          : "border-red-500/30 text-red-600"
                      }`}
                    >
                      {item.confidence}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2">
                    <div className="text-center">
                      <p className="text-xs font-bold text-foreground">{item.nutrition.calories_kcal}</p>
                      <p className="text-[10px] text-muted-foreground">kcal</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-blue-600">{item.nutrition.protein_g}g</p>
                      <p className="text-[10px] text-muted-foreground">protein</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-amber-600">{item.nutrition.carbs_g}g</p>
                      <p className="text-[10px] text-muted-foreground">carbs</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-rose-600">{item.nutrition.fat_g}g</p>
                      <p className="text-[10px] text-muted-foreground">fat</p>
                    </div>
                  </div>
                  {item.ingredients_detected && item.ingredients_detected.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.ingredients_detected.slice(0, 5).map((ing, j) => (
                        <span key={j} className="text-[10px] px-1.5 py-0.5 bg-secondary rounded-full text-muted-foreground">
                          {ing}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            : !isAnalyzing &&
              spot.menuHighlights.map((item, i) => (
                <div key={i} className="px-3.5 py-2.5 rounded-xl bg-card border border-border/40 text-sm text-foreground">
                  {item}
                </div>
              ))}
        </div>
      </div>

      {/* Reviews */}
      <div>
        <h3 className="font-semibold text-foreground mb-3">Reviews</h3>
        <div className="space-y-2">
          {spot.reviews.slice(0, 3).map((review) => (
            <div key={review.id} className="p-3 rounded-xl bg-card border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-primary">
                    {review.author.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm font-medium text-foreground flex-1">{review.author}</span>
                <span className="text-[11px] text-muted-foreground">{review.date}</span>
              </div>
              <div className="flex gap-0.5 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`h-3 w-3 ${s <= review.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{review.comment}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
