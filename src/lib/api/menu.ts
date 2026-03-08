import { supabase } from "@/integrations/supabase/client";
import { DishData } from "@/components/DishCard";

interface RestaurantContextData {
  type?: string;
  cuisine?: string;
  portion_style?: string;
  price_tier?: string;
}

export interface AnalyzeMenuResponse {
  dishes?: DishData[];
  restaurant_context?: RestaurantContextData | null;
  error?: string;
  imageBase64?: string;
  mimeType?: string;
}

export interface MenuImageMatch {
  dish_name: string;
  image_url: string;
  food_description: string;
  match_confidence: number;
}

export async function analyzeMenu(file: File): Promise<AnalyzeMenuResponse> {
  try {
    const base64 = await fileToBase64(file);
    
    const { data, error } = await supabase.functions.invoke("analyze-menu", {
      body: {
        imageBase64: base64,
        mimeType: file.type,
      },
    });

    if (error) {
      console.error("Edge function error:", error);
      return { error: error.message || "Failed to analyze menu" };
    }

    if (data.error) {
      return { error: data.error };
    }

    return {
      dishes: data.dishes,
      restaurant_context: data.restaurant_context || null,
      imageBase64: base64,
      mimeType: file.type,
    };
  } catch (err) {
    console.error("Error calling analyze-menu:", err);
    return { error: err instanceof Error ? err.message : "Failed to analyze menu" };
  }
}

export async function refineMenu(
  dishes: DishData[],
  restaurantContext: RestaurantContextData | null,
  imageBase64?: string,
  mimeType?: string
): Promise<{ dishes?: DishData[]; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke("refine-menu", {
      body: {
        dishes,
        restaurant_context: restaurantContext,
        imageBase64,
        mimeType,
      },
    });

    if (error) {
      console.warn("Refinement error:", error);
      return { error: error.message || "Refinement failed" };
    }

    if (data?.error) {
      return { error: data.error };
    }

    return { dishes: data?.dishes };
  } catch (err) {
    console.warn("Refinement failed:", err);
    return { error: err instanceof Error ? err.message : "Refinement failed" };
  }
}

export async function extractMenuImages(
  imageBase64: string,
  mimeType: string,
  dishNames: string[]
): Promise<MenuImageMatch[]> {
  try {
    const { data, error } = await supabase.functions.invoke("extract-menu-images", {
      body: { imageBase64, mimeType, dish_names: dishNames },
    });

    if (error) {
      console.warn("Extract menu images error:", error);
      return [];
    }

    return data?.matches || [];
  } catch (err) {
    console.warn("Error extracting menu images:", err);
    return [];
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
