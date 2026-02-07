import { supabase } from "@/integrations/supabase/client";
import { DishData } from "@/components/DishCard";

export interface AnalyzeMenuResponse {
  dishes?: DishData[];
  error?: string;
}

export async function analyzeMenu(file: File): Promise<AnalyzeMenuResponse> {
  try {
    // Convert file to base64
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

    return { dishes: data.dishes };
  } catch (err) {
    console.error("Error calling analyze-menu:", err);
    return { error: err instanceof Error ? err.message : "Failed to analyze menu" };
  }
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/jpeg;base64,")
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
