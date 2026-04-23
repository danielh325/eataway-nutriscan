/**
 * Deeplink builders for Singapore food delivery apps.
 * Uses search-based URLs because slug formats differ across platforms and change.
 *
 * Verified URL patterns:
 *  - GrabFood:  https://food.grab.com/sg/en/search?search={query}
 *  - Foodpanda: https://www.foodpanda.sg/restaurants/new?q={query}
 *
 * Deliveroo exited the Singapore market in 2025 — excluded.
 */

export type DeliveryPlatform = "grab" | "foodpanda";

export interface DeliveryLinks {
  grab: string;
  foodpanda: string;
}

export function buildVendorDeliveryLinks(
  spotName: string,
  address?: string
): DeliveryLinks {
  const query = encodeURIComponent(spotName);
  const fpQuery = address
    ? encodeURIComponent(`${spotName} ${address.split(",").pop()?.trim() ?? ""}`.trim())
    : query;

  return {
    grab: `https://food.grab.com/sg/en/search?search=${query}`,
    foodpanda: `https://www.foodpanda.sg/restaurants/new?q=${fpQuery}`,
  };
}

export function buildDishDeliveryLinks(
  spotName: string,
  dishName: string
): DeliveryLinks {
  // Combine vendor + dish for tighter search results
  const combined = encodeURIComponent(`${spotName} ${dishName}`);
  return {
    grab: `https://food.grab.com/sg/en/search?search=${combined}`,
    foodpanda: `https://www.foodpanda.sg/restaurants/new?q=${combined}`,
  };
}
