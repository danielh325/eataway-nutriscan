import { FoodSpot } from "@/data/types";
import { ArrowLeft, Heart, Star, MapPin, Clock, Phone, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { VendorMenu } from "@/components/VendorMenu";
import { DeliveryOrderButtons } from "@/components/DeliveryOrderButtons";
import { usePlacesPhoto } from "@/hooks/usePlacesPhoto";
import { getCuisineImage } from "@/lib/cuisineImages";

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
}: VendorDetailProps) {
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
  // Free image fallback chain: DB Places photo → seed image → cuisine-matched Unsplash CDN
  const heroImage = usePlacesPhoto(spot.name, spot.image || getCuisineImage(spot.categories));

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero image */}
      <div className="relative -mx-4 -mt-4 md:-mx-0 md:-mt-0">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-b-2xl md:rounded-2xl bg-muted">
          <img
            src={heroImage}
            alt={spot.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              const cuisineFallback = getCuisineImage(spot.categories);
              if (img.src !== cuisineFallback) {
                img.src = cuisineFallback;
              }
            }}
          />
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
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="block mt-5">
        <Button className="w-full rounded-xl gap-2 h-11 text-sm font-semibold" size="lg">
          <Navigation className="h-4 w-4" />
          Get Directions
        </Button>
      </a>

      {/* Delivery order CTAs */}
      <DeliveryOrderButtons spotName={spot.name} address={spot.address} />

      {/* Menu with Nutrition - Uber Eats style */}
      <VendorMenu
        spotName={spot.name}
        address={spot.address}
        menuHighlights={spot.menuHighlights}
      />

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
