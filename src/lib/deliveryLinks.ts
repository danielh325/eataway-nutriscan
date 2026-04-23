/**
 * Deeplink builders for Singapore food delivery apps.
 *
 * VERIFIED Nov 2025:
 *  - GrabFood SG search:  https://food.grab.com/sg/en/restaurants?search={query}
 *      ⚠️ Grab requires a delivery address before showing results. Without one,
 *      users see "Login to search location". The link still opens the right page
 *      and prompts them to enter an address — the most we can do without their app.
 *
 *  - Foodpanda SG search: https://www.foodpanda.sg/restaurants/new?q={query}
 *      ⚠️ Foodpanda's search page also resolves location server-side; the q param
 *      is read but only filters once a delivery location is set.
 *
 *  - Google fallback (always works): a Google search scoped to the platform
 *      finds the actual vendor listing reliably:
 *        https://www.google.com/search?q={vendor}+site:food.grab.com
 *        https://www.google.com/search?q={vendor}+site:foodpanda.sg
 *
 * Strategy: open the platform's own search page first; if no result is found
 * the user can fall back to the Google-scoped link we expose elsewhere in UI.
 *
 * Deliveroo exited the Singapore market in 2025 — excluded.
 */

export type DeliveryPlatform = "grab" | "foodpanda";

export interface DeliveryLinks {
  grab: string;
  foodpanda: string;
  /** Google-scoped fallbacks that always reach the vendor's actual listing */
  grabGoogle: string;
  foodpandaGoogle: string;
}

/** Strip generic suffixes that hurt search match (e.g. "Pte Ltd", "Singapore"). */
function cleanVendorName(name: string): string {
  return name
    .replace(/\b(pte\.?\s*ltd\.?|llp|sdn\.?\s*bhd\.?|inc\.?|co\.?)\b/gi, "")
    .replace(/\bsingapore\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Extract a postcode-friendly area hint from a SG address (last comma part). */
function extractArea(address?: string): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  // SG postcodes are 6 digits — pick the part containing one if present
  const withPostcode = parts.find((p) => /\b\d{6}\b/.test(p));
  return withPostcode || parts[parts.length - 1] || "";
}

export function buildVendorDeliveryLinks(
  spotName: string,
  address?: string
): DeliveryLinks {
  const cleaned = cleanVendorName(spotName);
  const grabQuery = encodeURIComponent(cleaned);

  // Foodpanda gets a slightly richer query because it tolerates location hints
  const area = extractArea(address);
  const fpRaw = area ? `${cleaned} ${area}` : cleaned;
  const fpQuery = encodeURIComponent(fpRaw);

  return {
    // Grab's actual search-results route (verified)
    grab: `https://food.grab.com/sg/en/restaurants?search=${grabQuery}`,
    // Foodpanda's actual search route (verified)
    foodpanda: `https://www.foodpanda.sg/restaurants/new?q=${fpQuery}`,
    // Google-scoped reliability fallbacks
    grabGoogle: `https://www.google.com/search?q=${encodeURIComponent(`${cleaned} site:food.grab.com`)}`,
    foodpandaGoogle: `https://www.google.com/search?q=${encodeURIComponent(`${cleaned} site:foodpanda.sg`)}`,
  };
}

export function buildDishDeliveryLinks(
  spotName: string,
  dishName: string
): DeliveryLinks {
  const cleanedVendor = cleanVendorName(spotName);
  const cleanedDish = dishName.trim();
  const grabQuery = encodeURIComponent(cleanedVendor); // Grab search is vendor-only — dish-level filter happens inside the menu
  const fpQuery = encodeURIComponent(`${cleanedVendor} ${cleanedDish}`);

  return {
    grab: `https://food.grab.com/sg/en/restaurants?search=${grabQuery}`,
    foodpanda: `https://www.foodpanda.sg/restaurants/new?q=${fpQuery}`,
    grabGoogle: `https://www.google.com/search?q=${encodeURIComponent(`${cleanedVendor} ${cleanedDish} site:food.grab.com`)}`,
    foodpandaGoogle: `https://www.google.com/search?q=${encodeURIComponent(`${cleanedVendor} ${cleanedDish} site:foodpanda.sg`)}`,
  };
}
