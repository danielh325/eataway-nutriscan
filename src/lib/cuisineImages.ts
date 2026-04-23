/**
 * Free, no-API-cost vendor image fallback.
 * Maps cuisines/categories to curated Unsplash photos (Unsplash CDN — free, no API key).
 * Used when a vendor doesn't have a Google Places photo yet.
 */

const CUISINE_IMAGE_MAP: Record<string, string> = {
  // Bowls / health
  "Poke Bowl": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800&q=80",
  "Grain Bowl": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
  "Acai": "https://images.unsplash.com/photo-1490474504059-bf2db5ab2348?w=800&q=80",
  "Smoothie": "https://images.unsplash.com/photo-1502741338009-cac2772e18bc?w=800&q=80",
  "Juice Bar": "https://images.unsplash.com/photo-1560717845-968823efbee1?w=800&q=80",
  "Salad": "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=800&q=80",
  "Salad Bar": "https://images.unsplash.com/photo-1607532941433-304659e8198a?w=800&q=80",

  // Cuisines
  "Japanese": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80",
  "Korean": "https://images.unsplash.com/photo-1583224994076-ae3f8aaab0d7?w=800&q=80",
  "Western": "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&q=80",
  "Hawker": "https://images.unsplash.com/photo-1626804475297-41608ea09aeb?w=800&q=80",
  "Food Court": "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&q=80",

  // Diet labels
  "Vegan": "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=800&q=80",
  "Vegetarian": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&q=80",
  "High Protein": "https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=800&q=80",
  "Low Cal": "https://images.unsplash.com/photo-1490474504059-bf2db5ab2348?w=800&q=80",
  "Halal": "https://images.unsplash.com/photo-1604152135912-04a022e23696?w=800&q=80",
};

const GENERIC_FALLBACK =
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800&q=80";

/**
 * Pick the best matching cuisine/category image for a vendor.
 * Returns an Unsplash CDN URL (free, no API key, no per-request cost).
 */
export function getCuisineImage(categories?: string[] | null): string {
  if (!categories || categories.length === 0) return GENERIC_FALLBACK;
  for (const cat of categories) {
    if (CUISINE_IMAGE_MAP[cat]) return CUISINE_IMAGE_MAP[cat];
  }
  return GENERIC_FALLBACK;
}

/**
 * Resolve final image: prefer DB/Places photo, else cuisine fallback, else current image.
 */
export function resolveVendorImage(
  dbPhoto: string | null | undefined,
  currentImage: string | undefined,
  categories?: string[] | null
): string {
  if (dbPhoto && dbPhoto.length > 0) return dbPhoto;
  if (currentImage && currentImage.includes("unsplash.com")) return currentImage;
  return getCuisineImage(categories);
}
