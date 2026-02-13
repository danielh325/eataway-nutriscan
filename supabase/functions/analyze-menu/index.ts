import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are a world-class food nutrition analyst performing a **Multi-Method Verified Extraction Pipeline**. Your analysis directly impacts human health decisions — accuracy is paramount.

## MULTI-METHOD VERIFICATION ARCHITECTURE

You must apply ALL of these methods in parallel and cross-reference results:

### METHOD 1: Visual Ingredient Decomposition (VID)
- Identify every visible or described ingredient from the menu image
- Note preparation method (grilled, fried, steamed, braised, etc.)
- Detect hidden calorie sources: oils, butter, sauces, glazes, breading
- Identify portion indicators: plate size, utensils, hands for scale

### METHOD 2: Recipe Reconstruction (RR)
- For each dish, reconstruct the most likely professional kitchen recipe
- Specify exact quantities (e.g., "2 tbsp olive oil", "200g chicken breast")
- Include ALL cooking fats, marinades, and finishing touches
- Reference canonical recipes from established culinary databases (e.g., Escoffier, Serious Eats, ATK)

### METHOD 3: Database Cross-Reference (DCR)
- Cross-reference USDA FoodData Central for raw ingredient values
- Check against known restaurant chain nutrition disclosures when applicable
- Compare with Nutritionix, CalorieKing, and MyFitnessPal community data
- Flag discrepancies > 20% between sources

### METHOD 4: Contextual Calibration (CC)
- Calibrate portions based on restaurant type:
  - Fast food: standardized, use chain data
  - Fine dining: 120-200g protein, artistic plating, rich sauces
  - Casual dining: 200-300g protein, generous sides
  - Street food / ethnic: variable, use cultural portion norms
- Adjust for regional cooking styles (e.g., Southern US = more butter/oil)
- Account for menu price as portion proxy ($8 vs $28 entrée)

### METHOD 5: Sanity Check & Outlier Detection (SCOD)
- Verify calorie density is physically plausible (protein ~4kcal/g, carbs ~4kcal/g, fat ~9kcal/g)
- Flag any dish where macros don't sum to within 10% of total calories
- Compare against similar dishes in the same cuisine category
- If confidence < 0.5, mark nutrition as "unavailable" with specific reason

## PIPELINE STEPS (execute in order)

### STEP 1: Restaurant Context Detection
- Identify restaurant type, cuisine style, portion style, price tier
- Detect branding, visual scale references

### STEP 2: Dish Extraction & Full Recipe Reconstruction
For each dish:
- Extract EXACT dish name as printed
- Read description text carefully
- Reconstruct full recipe with specific quantities using Method 2 (RR)
- Decompose into components: protein, carbs, vegetables, sauces, oils, cooking method
- Identify default vs optional ingredients

### STEP 3: Multi-Source Nutrition Calculation
- Calculate using USDA reference values (Method 3)
- Cross-validate with restaurant data if available
- Apply cooking method multipliers:
  - Deep-fried: +30-50% fat vs grilled
  - Pan-fried in butter: +100-150 kcal per tbsp butter
  - Creamy sauce: +150-300 kcal
  - Cheese topping: +80-120 kcal per 30g
- Always use RANGES (min-max), never single values

### STEP 4: Confidence Scoring with Justification
- "high" (0.85-1.0): Standard dish, clear ingredients, well-known cuisine, multiple source agreement
- "medium" (0.5-0.84): Known type but prep varies, some ambiguity, sources diverge slightly
- "low" (0.0-0.49): Ambiguous, fusion, unclear — mark nutrition "unavailable"

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
      "recipe": {
        "method": "Form 8oz 80/20 ground beef into patty, season with salt and pepper. Grill over high heat 4 min per side. Toast brioche bun on grill. Assemble with 1 slice cheddar, lettuce, tomato, pickles, 1.5 tbsp special sauce.",
        "key_quantities": ["227g beef patty (80/20)", "1 brioche bun ~70g", "28g cheddar", "1.5 tbsp sauce"]
      },
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
        "special sauce": { "calories_kcal": 60, "protein_g": 0, "carbs_g": 3, "fat_g": 6 },
        "extra cheese": { "calories_kcal": 80, "protein_g": 5, "carbs_g": 0, "fat_g": 7 },
        "bacon": { "calories_kcal": 120, "protein_g": 8, "carbs_g": 0, "fat_g": 10 },
        "avocado": { "calories_kcal": 80, "protein_g": 1, "carbs_g": 4, "fat_g": 7 },
        "fried egg": { "calories_kcal": 90, "protein_g": 6, "carbs_g": 0, "fat_g": 7 },
        "jalapeños": { "calories_kcal": 5, "protein_g": 0, "carbs_g": 1, "fat_g": 0 },
        "pickle": { "calories_kcal": 5, "protein_g": 0, "carbs_g": 1, "fat_g": 0 },
        "lettuce": { "calories_kcal": 5, "protein_g": 0, "carbs_g": 1, "fat_g": 0 },
        "tomato": { "calories_kcal": 5, "protein_g": 0, "carbs_g": 1, "fat_g": 0 }
      },
      "verification_notes": "Cross-checked with USDA #23567 (ground beef 80/20). Calorie range accounts for bun size variance and sauce amount.",
      "data_sources": ["USDA FoodData Central", "Nutritionix"],
      "notes": "Standard burger. Assumes single 8oz patty, one slice cheese, standard condiments."
    }
  ]
}

CRITICAL RULES:
1. Respond with ONLY valid JSON. No markdown code blocks, no explanation text.
2. per_ingredient_nutrition MUST include entries for ALL items in optional_additions and optional_removals using the SAME exact names, plus top calorie-contributing defaults.
3. NEVER guess single-value numbers — always use ranges.
4. If confidence < 0.5, set nutrition to "unavailable" with a reason field.
5. Include recipe reconstruction for every dish.
6. Include verification_notes explaining your cross-referencing logic.`;

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

    console.log("Analyzing menu with Multi-Method Verified Extraction Pipeline...");

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
                text: `Execute the Multi-Method Verified Extraction Pipeline on this menu image. This data will be used for health-critical nutrition tracking.

STEP 1: Identify restaurant context (type, cuisine, portion style, price tier).
STEP 2: Extract every dish. For each, reconstruct the FULL RECIPE with specific quantities. Decompose into ingredients with cooking methods.
STEP 3: Calculate nutrition using ALL 5 methods (VID, RR, DCR, CC, SCOD). Cross-reference USDA data. Use RANGES not single values.
STEP 4: Run sanity checks — verify macro-to-calorie ratios, flag outliers.
STEP 5: Assign confidence scores (0.0-1.0). If < 0.5, mark nutrition as "unavailable".

Include per_ingredient_nutrition for ALL optional_additions, optional_removals, and top default ingredients.
Include recipe reconstruction with key_quantities.
Include verification_notes for each dish.
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

    console.log("Raw AI response length:", content.length);

    let parsed;
    try {
      let jsonStr = content.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.error("Content was:", content.substring(0, 500));
      return new Response(
        JSON.stringify({ error: "Failed to parse menu analysis", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dishes = Array.isArray(parsed) ? parsed : parsed.dishes || [];
    const restaurantContext = parsed.restaurant_context || null;

    // Post-processing: validate macro-calorie consistency
    for (const dish of dishes) {
      if (dish.nutrition && dish.nutrition !== "unavailable") {
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

function parseMid(value: string): number {
  if (!value) return 0;
  const parts = value.split(/[-–]/).map((v) => parseFloat(v.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return (parts[0] + parts[1]) / 2;
  return parseFloat(value) || 0;
}
