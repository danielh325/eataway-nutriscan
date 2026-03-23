import iconAll from "@/assets/icons/all.png";
import iconHighProtein from "@/assets/icons/high-protein.png";
import iconLowCal from "@/assets/icons/low-cal.png";
import iconHalal from "@/assets/icons/halal.png";
import iconVegetarian from "@/assets/icons/vegetarian.png";
import iconLowSugar from "@/assets/icons/low-sugar.png";

export const CATEGORY_ICONS: Record<string, string> = {
  All: iconAll,
  "High Protein": iconHighProtein,
  "Low Cal": iconLowCal,
  Halal: iconHalal,
  Vegetarian: iconVegetarian,
  "Low Sugar": iconLowSugar,
};

// Map food spot primary categories to their filter icon
// For spots whose first category is a cuisine type, map to the closest goal icon
export const CUISINE_TO_ICON: Record<string, string> = {
  Salad: iconVegetarian,
  "Poke Bowl": iconHighProtein,
  Smoothie: iconLowCal,
  Acai: iconLowSugar,
  "Grain Bowl": iconHighProtein,
  Japanese: iconHighProtein,
  Korean: iconHighProtein,
  Western: iconVegetarian,
};

export function getSpotIcon(categories: string[]): string {
  for (const cat of categories) {
    if (CATEGORY_ICONS[cat]) return CATEGORY_ICONS[cat];
  }
  for (const cat of categories) {
    if (CUISINE_TO_ICON[cat]) return CUISINE_TO_ICON[cat];
  }
  return iconAll;
}
