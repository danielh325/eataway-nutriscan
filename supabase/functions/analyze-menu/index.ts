import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are an expert food menu analyzer with deep knowledge of culinary techniques, ingredient compositions, and nutritional science. Your task is to extract dish names from menu images and provide verified nutritional estimates.

## EXTRACTION RULES
1. Read the menu image carefully. Extract ALL visible dish names exactly as written.
2. For each dish, analyze the description (if provided) to identify:
   - Primary protein source (meat, fish, legumes, tofu, etc.)
   - Carbohydrate base (rice, pasta, bread, potatoes, etc.)
   - Cooking method (grilled, fried, steamed, etc.) - this significantly affects nutrition
   - Sauces and dressings (often high in sodium, fat, or sugar)
   - Portion indicators (if any: "large", "200g", "half", etc.)

## NUTRITIONAL ESTIMATION RULES
1. NEVER guess single numbers. Always use ranges based on typical restaurant portions.
2. For unknown portions, use these industry standards:
   - Appetizer: 150-250g
   - Main course: 300-450g
   - Pasta dish: 250-350g cooked pasta + sauce
   - Steak: 170-280g raw weight
   - Chicken breast: 140-200g
3. Account for cooking method impact:
   - Fried: +30-50% fat compared to grilled
   - Creamy sauce: +150-300 kcal
   - Butter-based: +100-200 kcal
4. Reference USDA FoodData Central values for base ingredients.

## CONFIDENCE SCORING
- "high": Common dish with clear ingredients, standard preparation (e.g., "Grilled Salmon with Rice")
- "medium": Known dish but preparation varies (e.g., "Chef's Signature Pasta")
- "low": Ambiguous name, fusion dish, or unclear ingredients (e.g., "House Special")

## OUTPUT FORMAT
For each dish, return:
- dish: Exact name from menu
- confidence: "high" | "medium" | "low"
- ingredients_detected: Array of core ingredients (be specific: "chicken thigh" not just "chicken")
- nutrition: Object with ranges { calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg } OR "unavailable"
- data_sources: ["USDA FoodData Central", "Nutritionix", "Edamam"] as applicable
- notes: Preparation assumptions, portion estimates, or caveats
- reason: (only if nutrition is "unavailable") Why data cannot be computed

RESPOND WITH ONLY A VALID JSON ARRAY. No markdown code blocks, no explanation text.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Analyzing menu image...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this menu image thoroughly.

STEP 1: Identify every dish name visible on the menu.
STEP 2: For each dish, examine any description text to determine ingredients.
STEP 3: Consider typical restaurant preparation methods and portion sizes.
STEP 4: Calculate nutritional ranges using USDA reference data.
STEP 5: Assign confidence based on ingredient clarity.

Remember: Use ranges (e.g., "450-600") not single values. Be specific about ingredients. Note any assumptions about preparation method.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Failed to analyze menu" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in AI response");
      return new Response(
        JSON.stringify({ error: "No analysis returned" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Raw AI response:", content);

    // Parse the JSON response - handle potential markdown code blocks
    let dishes;
    try {
      let jsonStr = content.trim();
      // Remove markdown code blocks if present
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      dishes = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Content was:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse menu analysis", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Successfully analyzed menu, found", dishes.length, "dishes");

    return new Response(
      JSON.stringify({ dishes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error analyzing menu:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
