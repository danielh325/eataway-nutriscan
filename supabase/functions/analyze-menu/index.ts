import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a world-class food nutrition analyst performing a Verified Extraction Pipeline. You analyze restaurant menu images with extreme precision.

## PIPELINE STEPS (execute in order)

### STEP 1: Restaurant Context Detection
- Identify the restaurant type (fast food, fine dining, casual, ethnic cuisine, café, etc.)
- Detect cuisine style (Italian, Japanese, Mexican, American, Indian, etc.)
- Note any visible branding, pricing tier, or portion style indicators
- Look for visual scale references (plates, utensils, hands) to calibrate portion estimation

### STEP 2: Dish Extraction & Ingredient Decomposition
For each dish visible on the menu:
- Extract the EXACT dish name as printed
- Read any description text carefully
- Decompose into specific components:
  - Primary protein (e.g., "skin-on chicken thigh" not just "chicken")
  - Carbohydrate base (e.g., "jasmine rice" not just "rice")
  - Vegetables/sides with preparation (e.g., "sautéed spinach in garlic butter")
  - Cooking method (grilled, deep-fried, pan-seared, steamed, braised, etc.)
  - Sauces/dressings (e.g., "ranch dressing ~2 tbsp", "teriyaki glaze")
  - Oils/fats used in cooking (olive oil, butter, vegetable oil)
- Identify default included ingredients vs optional add-ons/modifications

### STEP 3: Portion Size Estimation
Use visual scale calibration and restaurant context:
- Fast food: standardized portions (small/medium/large)
- Fine dining: smaller portions (120-200g protein, artistic plating)
- Casual dining: generous portions (200-300g protein, 300-450g total)
- Family style: large shared portions
Standard references:
  - Appetizer: 150-250g
  - Main course: 300-450g
  - Pasta dish: 250-350g cooked + sauce
  - Steak: 170-280g raw weight (loses ~25% when cooked)
  - Chicken breast: 140-200g
  - Fish fillet: 140-200g
  - Rice/grain side: 150-200g cooked
  - Salad: 150-250g

### STEP 4: Macro Calculation
Calculate nutrition using USDA FoodData Central reference values:
- ALWAYS use ranges, NEVER single numbers
- Account for cooking method impact:
  - Deep-fried: +30-50% fat vs grilled
  - Pan-fried in butter: +100-150 kcal per tablespoon butter
  - Creamy sauce: +150-300 kcal
  - Cheese topping: +80-120 kcal per 30g
  - Dressing: +50-150 kcal per 2 tbsp
- Cross-reference with known restaurant nutrition data when applicable

### STEP 5: Confidence Scoring
- "high" (0.85-1.0): Common dish, clear ingredients, standard prep, well-known cuisine
- "medium" (0.5-0.84): Known dish type but preparation varies, some ambiguity
- "low" (0.0-0.49): Ambiguous name, fusion dish, unclear ingredients, "Chef's Special"

## OUTPUT FORMAT
Return a JSON object with this exact structure:
{
  "restaurant_context": {
    "type": "casual dining",
    "cuisine": "Italian-American",
    "portion_style": "generous",
    "price_tier": "mid-range"
  },
  "dishes": [
    {
      "dish": "Exact Menu Name",
      "confidence": "high",
      "confidence_score": 0.92,
      "ingredients_detected": ["8oz beef patty", "brioche bun", "cheddar cheese", "lettuce", "tomato", "pickle", "special sauce"],
      "default_ingredients": ["8oz beef patty", "brioche bun", "cheddar cheese", "lettuce", "tomato", "pickle", "special sauce"],
      "optional_additions": ["extra cheese", "bacon", "avocado", "fried egg", "jalapeños"],
      "optional_removals": ["cheese", "sauce", "pickle", "lettuce", "tomato"],
      "cooking_method": "grilled",
      "portion_size_g": 350,
      "nutrition": {
        "calories_kcal": "650-800",
        "protein_g": "35-45",
        "carbs_g": "40-55",
        "fat_g": "30-42",
        "fiber_g": "2-4",
        "sugar_g": "8-12",
        "sodium_mg": "900-1200"
      },
      "per_ingredient_nutrition": {
        "8oz beef patty": { "calories_kcal": 400, "protein_g": 35, "carbs_g": 0, "fat_g": 28 },
        "brioche bun": { "calories_kcal": 150, "protein_g": 4, "carbs_g": 28, "fat_g": 3 },
        "cheddar cheese": { "calories_kcal": 80, "protein_g": 5, "carbs_g": 0, "fat_g": 7 },
        "special sauce": { "calories_kcal": 60, "protein_g": 0, "carbs_g": 3, "fat_g": 6 }
      },
      "data_sources": ["USDA FoodData Central"],
      "notes": "Standard burger preparation. Assumes single 8oz patty, one slice cheese."
    }
  ]
}

CRITICAL: Respond with ONLY valid JSON. No markdown code blocks, no explanation text. The per_ingredient_nutrition should include entries for the most calorie-significant ingredients (top 4-6).`;

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

    console.log("Analyzing menu image with Verified Extraction Pipeline...");

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
                text: `Execute the Verified Extraction Pipeline on this menu image.

STEP 1: Identify the restaurant context — type, cuisine, portion style, price tier.
STEP 2: Extract every dish name. For each, decompose into specific ingredients with cooking methods.
STEP 3: Estimate portion sizes using visual scale calibration (look for plates, utensils).
STEP 4: Calculate macros using USDA reference data. Use RANGES not single values.
STEP 5: Assign confidence scores (0.0-1.0) based on ingredient clarity and data availability.

Include per_ingredient_nutrition for the top calorie-contributing ingredients.
Include optional_additions and optional_removals for each dish.
Return strict JSON only.`,
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

    let parsed;
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Content was:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse menu analysis", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: support both { dishes: [...] } and bare array
    const dishes = Array.isArray(parsed) ? parsed : parsed.dishes || [];
    const restaurantContext = parsed.restaurant_context || null;

    console.log("Successfully analyzed menu, found", dishes.length, "dishes");

    return new Response(
      JSON.stringify({ dishes, restaurant_context: restaurantContext }),
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
