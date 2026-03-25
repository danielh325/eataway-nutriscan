import { useState } from "react";
import { FoodSpot, Review } from "@/data/types";
import { Star, Heart, ArrowLeft, MapPin, Clock, Phone, Navigation, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePlacesPhoto } from "@/hooks/usePlacesPhoto";
import { VendorMenu } from "@/components/VendorMenu";

interface SpotDetailProps {
  spot: FoodSpot;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  onBack: () => void;
  onAddReview: (spotId: string, review: Review) => void;
}

function StarRating({ rating, onChange }: { rating: number; onChange?: (r: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-4 w-4 cursor-pointer transition-colors ${
            i <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"
          }`}
          onClick={() => onChange?.(i)}
        />
      ))}
    </div>
  );
}

export default function SpotDetail({ spot, isFavorite, onToggleFavorite, onBack, onAddReview }: SpotDetailProps) {
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const imageUrl = usePlacesPhoto(spot.name, spot.image);

  const handleSubmitReview = () => {
    if (!reviewText.trim()) return;
    const review: Review = {
      id: `r-${Date.now()}`,
      author: "You",
      rating: reviewRating,
      comment: reviewText.trim(),
      date: new Date().toISOString().split("T")[0],
    };
    onAddReview(spot.id, review);
    setReviewText("");
    setReviewRating(5);
  };

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;

  return (
    <div className="space-y-4">
      {/* Hero image */}
      <div className="relative -mx-4 -mt-1">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-b-2xl bg-muted">
          {imageUrl ? (
            <img src={imageUrl} alt={spot.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">No photo yet</div>
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/10 rounded-b-2xl" />

        <button
          onClick={onBack}
          className="absolute top-3 left-3 h-9 w-9 rounded-full bg-[hsl(0_0%_100%/0.9)] backdrop-blur-xl flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-transform active:scale-90"
        >
          <ArrowLeft className="h-[17px] w-[17px] text-foreground" />
        </button>

        <button
          onClick={() => onToggleFavorite(spot.id)}
          className="absolute top-3 right-3 h-9 w-9 rounded-full bg-[hsl(0_0%_100%/0.9)] backdrop-blur-xl flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-transform active:scale-90"
        >
          <Heart className={`h-[17px] w-[17px] ${isFavorite ? "fill-red-500 text-red-500" : "text-foreground"}`} />
        </button>

        <div className="absolute bottom-3 left-3 right-3">
          <h2 className="font-bold text-lg text-white leading-tight drop-shadow-sm">{spot.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <div className="flex items-center gap-1">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span className="text-[13px] font-semibold text-white">{spot.rating}</span>
            </div>
            <span className="text-white/50">·</span>
            <span className="text-[13px] text-white/80">{spot.reviewCount} reviews</span>
            <span className="text-white/50">·</span>
            <span className="text-[13px] text-white/80">{spot.priceRange}</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-[13px] text-muted-foreground leading-relaxed">{spot.description}</p>

      {/* Info card */}
      <div className="rounded-xl bg-card border border-border/40 divide-y divide-border/30 overflow-hidden">
        <div className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">{spot.address}</span>
        </div>
        <div className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
          <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">{spot.hours}</span>
        </div>
        <div className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
          <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
          <span className="text-muted-foreground">{spot.phone}</span>
        </div>
      </div>

      {/* Directions */}
      <a href={directionsUrl} target="_blank" rel="noopener noreferrer">
        <Button className="w-full rounded-xl gap-2 h-11 text-sm font-semibold bg-primary hover:bg-primary/90" size="lg">
          <Navigation className="h-4 w-4" />
          Get Directions
        </Button>
      </a>

      {/* Menu with Nutrition - Uber Eats style */}
      <VendorMenu
        spotName={spot.name}
        address={spot.address}
        menuHighlights={spot.menuHighlights}
      />

      {/* Reviews */}
      <div>
        <h3 className="font-semibold text-sm text-foreground mb-2">Reviews</h3>
        <div className="space-y-2">
          {spot.reviews.map((review) => (
            <div key={review.id} className="p-3 rounded-xl bg-card border border-border/30">
              <div className="flex items-center gap-2 mb-1">
                <div className="h-6 w-6 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-primary">{review.author.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-[13px] font-medium text-foreground flex-1">{review.author}</span>
                <span className="text-[11px] text-muted-foreground">{review.date}</span>
              </div>
              <StarRating rating={review.rating} />
              <p className="text-[12px] text-muted-foreground mt-1 leading-relaxed">{review.comment}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Add review */}
      <div className="p-3 rounded-xl bg-card border border-border/30 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-[13px] font-semibold text-foreground">Leave a Review</h4>
          <StarRating rating={reviewRating} onChange={setReviewRating} />
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Share your experience..."
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            className="bg-input/50 border-border/40 text-foreground rounded-lg text-[13px] h-9 flex-1"
          />
          <Button onClick={handleSubmitReview} className="rounded-lg h-9 px-4 text-[13px]" disabled={!reviewText.trim()}>
            Submit
          </Button>
        </div>
      </div>
    </div>
  );
}
