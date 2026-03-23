export interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
}

export interface FoodSpot {
  id: string;
  name: string;
  description: string;
  categories: string[];
  rating: number;
  reviewCount: number;
  priceRange: "$" | "$$" | "$$$";
  distance: string;
  address: string;
  hours: string;
  phone: string;
  image: string;
  lat: number;
  lng: number;
  menuHighlights: string[];
  reviews: Review[];
}

export const GOAL_CATEGORIES = [
  "All",
  "High Protein",
  "Low Cal",
  "Halal",
  "Vegetarian",
  "Low Sugar",
] as const;

export const CUISINE_CATEGORIES = [
  "All",
  "Salad",
  "Poke Bowl",
  "Smoothie",
  "Acai",
  "Grain Bowl",
  "Japanese",
  "Korean",
  "Western",
] as const;

export type GoalCategory = (typeof GOAL_CATEGORIES)[number];
export type CuisineCategory = (typeof CUISINE_CATEGORIES)[number];
export type Category = GoalCategory | CuisineCategory;

// Keep legacy export for any remaining references
export const CATEGORIES = [...GOAL_CATEGORIES, ...CUISINE_CATEGORIES.filter(c => c !== "All")] as const;

export const CATEGORY_EMOJI: Record<string, string> = {
  All: "🔥",
  Vegan: "🌱",
  "High Protein": "💪",
  "Low Cal": "🔥",
  "Low Carb": "🥬",
  Halal: "🕌",
  Detox: "🧃",
  Organic: "🌿",
  Salad: "🥗",
  "Salad Bar": "🥗",
  "Poke Bowl": "🐟",
  Smoothie: "🥤",
  Acai: "🫐",
  "Grain Bowl": "🍚",
  Japanese: "🍣",
  Korean: "🍲",
  Western: "🥑",
  "Juice Bar": "🧃",
  Vegetarian: "🥑",
  "Low Sugar": "🍃",
  Hawker: "🏪",
  "Food Court": "🍽️",
};
