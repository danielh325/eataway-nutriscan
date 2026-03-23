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
      const message = await getInvokeErrorMessage(error, "Failed to analyze menu");
      console.error("Edge function error:", message, error);
      return { error: message };
    }

    if (data?.error) {
      return { error: data.error };
    }

    if (!data || !Array.isArray(data.dishes)) {
      return { error: "Analysis returned an invalid response" };
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
      const message = await getInvokeErrorMessage(error, "Refinement failed");
      console.warn("Refinement error:", message, error);
      return { error: message };
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
      const message = await getInvokeErrorMessage(error, "Extract image matching failed");
      console.warn("Extract menu images error:", message, error);
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

async function getInvokeErrorMessage(error: unknown, fallback: string): Promise<string> {
  const err = error as Record<string, unknown> | null;
  const message = typeof err?.message === "string" ? err.message : fallback;

  const context = err?.context as Response | undefined;
  if (context) {
    try {
      const text = await context.clone().text();
      if (text?.trim()) {
        try {
          const parsed = JSON.parse(text);
          if (typeof parsed?.error === "string") return parsed.error;
        } catch {
          return text.slice(0, 240);
        }
      }
    } catch {
      // ignore context parsing failures
    }

    if (context.status === 402) {
      return "AI credits are exhausted. Please add workspace usage credits.";
    }

    if (context.status === 429) {
      return "Too many AI requests right now. Please retry in a moment.";
    }
  }

  if (message.includes("402")) {
    return "AI credits are exhausted. Please add workspace usage credits.";
  }

  if (message.includes("429")) {
    return "Too many AI requests right now. Please retry in a moment.";
  }

  return message;
}
