import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a world-class food nutrition analyst. Your analysis directly impacts human health decisions — accuracy is paramount.

## MULTI-METHOD VERIFICATION ARCHITECTURE

Apply ALL methods in parallel and cross-reference:

### METHOD 1: Visual Ingredient Decomposition (VID)
- Identify every visible/described ingredient from the menu image
- Note preparation method (grilled, fried, steamed, braised, etc.)
- Detect hidden calorie sources: oils, butter, sauces, glazes, breading
- Identify portion indicators: plate size, utensils, hands for scale

### METHOD 2: Recipe Reconstruction (RR)
- Reconstruct the most likely professional kitchen recipe for each dish
- Specify exact quantities (e.g., "2 tbsp olive oil", "200g chicken breast")
- Include ALL cooking fats, marinades, finishing touches
- Reference canonical recipes (Escoffier, Serious Eats, ATK, Bon Appétit)

### METHOD 3: Database Cross-Reference (DCR)
- Cross-reference USDA FoodData Central for raw ingredient values
- Check against known restaurant chain nutrition disclosures
- Compare with Nutritionix, CalorieKing, MyFitnessPal community data
- Flag discrepancies > 20% between sources

### METHOD 4: Contextual Calibration (CC)
- Calibrate portions based on restaurant type:
  - Fast food: standardized, use chain data
  - Fine dining: 120-200g protein, artistic plating, rich sauces
  - Casual dining: 200-300g protein, generous sides
  - Street food/ethnic: variable, use cultural portion norms
- Adjust for regional cooking styles
- Account for menu price as portion proxy

### METHOD 5: Sanity Check & Outlier Detection (SCOD)
- Verify calorie density is physically plausible (protein ~4kcal/g, carbs ~4kcal/g, fat ~9kcal/g)
- Ensure macros sum to within 10% of total calories
- Compare against similar dishes in same cuisine category
- If confidence < 0.5, mark nutrition as "unavailable"

### METHOD 6: Cooking Loss & Absorption Modeling (CLAM)
- Apply moisture loss factors: grilling (-20-30% weight), frying (-15-25%), baking (-10-20%)
- Calculate oil absorption: deep-fry (+8-15% weight in oil), pan-fry (+5-10%), stir-fry (+3-5%)
- Account for nutrient degradation from heat (vitamin C -30-50%, B vitamins -20-40%)
- Model Maillard reaction products and caramelization effects on final macros

### METHOD 7: Culinary Fingerprinting (CF)
- Identify dish by cuisine-specific preparation signatures
- Cross-reference with traditional recipes from authoritative cultural sources
- Detect fusion elements that modify standard preparations
- Use dish name etymology to infer preparation method when ambiguous

## CRITICAL RULES
1. Extract EVERY SINGLE dish from the menu — scan ALL sections, categories, pages. Do not skip any item.
2. per_ingredient_nutrition MUST include entries for ALL items in optional_additions and optional_removals using the SAME exact names
3. NEVER guess single-value numbers — always use ranges (min-max as string like "650-800")
4. If confidence < 0.5, set nutrition to "unavailable" string
5. Include recipe reconstruction for every dish
6. Include verification_notes explaining cross-referencing logic
7. Nutrition ranges must be strings like "650-800", never numbers
8. Set has_image_in_menu to true ONLY if the menu image contains a photo of that specific dish`;

// Tool calling schema for structured output
const EXTRACT_MENU_TOOL = {
  type: "function",
  function: {
    name: "extract_menu_analysis",
    description: "Extract structured menu analysis with dishes, nutrition, and confidence scores from a menu image.",
    parameters: {
      type: "object",
      properties: {
        restaurant_context: {
          type: "object",
          properties: {
            type: { type: "string", description: "Restaurant type e.g. casual dining, fast food, fine dining" },
            cuisine: { type: "string", description: "Cuisine style e.g. Italian-American, Japanese, Mexican" },
            portion_style: { type: "string", description: "Portion style e.g. generous, moderate, small" },
            price_tier: { type: "string", description: "Price tier e.g. budget, mid-range, upscale" },
          },
          required: ["type", "cuisine", "portion_style", "price_tier"],
        },
        dishes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish: { type: "string", description: "Exact dish name as printed on menu" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              confidence_score: { type: "number", description: "0.0-1.0 confidence score" },
              ingredients_detected: { type: "array", items: { type: "string" }, description: "All detected ingredients with quantities" },
              default_ingredients: { type: "array", items: { type: "string" }, description: "Ingredients included by default" },
              optional_additions: { type: "array", items: { type: "string" }, description: "Optional add-on ingredients" },
              optional_removals: { type: "array", items: { type: "string" }, description: "Ingredients that can be removed" },
              cooking_method: { type: "string", description: "Primary cooking method" },
              portion_size_g: { type: "number", description: "Estimated portion weight in grams" },
              recipe: {
                type: "object",
                properties: {
                  method: { type: "string", description: "Full recipe reconstruction" },
                  key_quantities: { type: "array", items: { type: "string" }, description: "Key ingredient quantities" },
                },
                required: ["method", "key_quantities"],
              },
              nutrition: {
                type: "object",
                properties: {
                  calories_kcal: { type: "string", description: "Calorie range e.g. '650-800'" },
                  protein_g: { type: "string", description: "Protein range e.g. '35-45'" },
                  carbs_g: { type: "string", description: "Carbs range e.g. '40-55'" },
                  fat_g: { type: "string", description: "Fat range e.g. '30-42'" },
                  fiber_g: { type: "string", description: "Fiber range e.g. '2-4'" },
                  sugar_g: { type: "string", description: "Sugar range e.g. '8-12'" },
                  sodium_mg: { type: "string", description: "Sodium range e.g. '900-1200'" },
                },
                required: ["calories_kcal", "protein_g", "carbs_g", "fat_g", "sodium_mg"],
              },
              per_ingredient_nutrition: {
                type: "object",
                description: "Nutrition per ingredient. Keys MUST match names in optional_additions, optional_removals, and top default ingredients exactly.",
                additionalProperties: {
                  type: "object",
                  properties: {
                    calories_kcal: { type: "number" },
                    protein_g: { type: "number" },
                    carbs_g: { type: "number" },
                    fat_g: { type: "number" },
                  },
                  required: ["calories_kcal", "protein_g", "carbs_g", "fat_g"],
                },
              },
              verification_notes: { type: "string", description: "Cross-referencing logic and data sources used" },
              data_sources: { type: "array", items: { type: "string" }, description: "Databases referenced" },
              notes: { type: "string", description: "Additional notes about the dish" },
            },
            required: ["dish", "confidence", "confidence_score", "ingredients_detected", "default_ingredients", "optional_additions", "optional_removals", "cooking_method", "portion_size_g", "recipe", "nutrition", "per_ingredient_nutrition", "verification_notes", "data_sources"],
          },
        },
      },
      required: ["restaurant_context", "dishes"],
      additionalProperties: false,
    },
  },
};

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

    console.log("Analyzing menu with 7-Method Verified Extraction Pipeline + Tool Calling...");

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
                text: `Analyze this menu image using ALL 7 methods (VID, RR, DCR, CC, SCOD, CLAM, CF). This is health-critical.

STEP 1: Identify restaurant context.
STEP 2: Extract every dish. Reconstruct FULL RECIPE with specific quantities.
STEP 3: Calculate nutrition using ALL methods. Cross-reference USDA data. Use RANGES.
STEP 4: Apply cooking loss & absorption modeling.
STEP 5: Use culinary fingerprinting for dish identification.
STEP 6: Run sanity checks — verify macro-to-calorie ratios.
STEP 7: Assign confidence scores (0.0-1.0).

Include per_ingredient_nutrition for ALL optional_additions, optional_removals, and top default ingredients.
Call extract_menu_analysis with the complete results.`,
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
        tools: [EXTRACT_MENU_TOOL],
        tool_choice: { type: "function", function: { name: "extract_menu_analysis" } },
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

    // Extract from tool call response
    let parsed: any = null;
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        parsed = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error("Failed to parse tool call arguments:", e);
      }
    }

    // Fallback: try content field (in case model didn't use tool calling)
    if (!parsed) {
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          let jsonStr = content.trim();
          if (jsonStr.startsWith("```")) {
            jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
          }
          parsed = JSON.parse(jsonStr);
        } catch (e) {
          console.error("Failed to parse content fallback:", e);
          return new Response(
            JSON.stringify({ error: "Failed to parse menu analysis" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (!parsed) {
      return new Response(
        JSON.stringify({ error: "No analysis returned from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dishes = Array.isArray(parsed) ? parsed : parsed.dishes || [];
    const restaurantContext = parsed.restaurant_context || null;

    // Post-processing: validate macro-calorie consistency
    for (const dish of dishes) {
      if (dish.nutrition && typeof dish.nutrition === "object") {
        const midCal = parseMid(dish.nutrition.calories_kcal);
        const midP = parseMid(dish.nutrition.protein_g);
        const midC = parseMid(dish.nutrition.carbs_g);
        const midF = parseMid(dish.nutrition.fat_g);
        const computed = midP * 4 + midC * 4 + midF * 9;
        if (midCal > 0 && Math.abs(computed - midCal) / midCal > 0.25) {
          dish.verification_notes = (dish.verification_notes || "") +
            ` [WARNING: Macro sum ${Math.round(computed)} kcal differs from stated ${Math.round(midCal)} kcal by ${Math.round(Math.abs(computed - midCal) / midCal * 100)}%]`;
        }
      }
    }

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

function parseMid(value: string | number): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parts = value.split(/[-–]/).map((v) => parseFloat(v.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return (parts[0] + parts[1]) / 2;
  return parseFloat(value) || 0;
}
