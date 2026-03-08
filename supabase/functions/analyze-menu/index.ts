import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Few-shot calibration examples ────────────────────────────────────────────
const FEW_SHOT_EXAMPLES = `
## CALIBRATION EXAMPLES (use as anchors for portion & nutrition estimation)

### Example 1: Classic Cheeseburger (Casual Dining)
- Portion: 280g total (150g beef patty, 60g bun, cheese, lettuce, tomato, sauce)
- Nutrition: calories "650-780", protein "38-45", carbs "38-48", fat "35-45", sodium "900-1200"
- Cooking: Griddled, oil absorption ~5g, cheese melt adds ~110kcal
- Key: Don't forget the mayo/sauce (often 80-120kcal alone)

### Example 2: Caesar Salad (Full portion, casual dining)
- Portion: 350g (200g romaine, 30g parmesan, 40g croutons, 80ml dressing)
- Nutrition: calories "450-580", protein "12-18", carbs "18-25", fat "35-48", sodium "800-1100"
- Key: Dressing is 60-70% of total fat. With grilled chicken add: calories +200, protein +30

### Example 3: Margherita Pizza (10-12 inch, restaurant)
- Portion: 550-700g total
- Nutrition: calories "750-950", protein "28-38", carbs "85-105", fat "28-42", sodium "1400-1800"
- Key: Olive oil drizzle adds 120kcal. Thicker crust = +150-200kcal

### Example 4: Pad Thai (Street food / casual)
- Portion: 400g (200g noodles, 100g protein, veg, sauce)
- Nutrition: calories "550-720", protein "22-32", carbs "65-85", fat "18-30", sodium "1100-1500"
- Key: Tamarind sauce has significant sugar (15-25g). Peanuts add 80-100kcal per 15g serving

### Example 5: Grilled Salmon Fillet (Fine dining)
- Portion: 180-220g salmon + sides
- Nutrition (salmon only): calories "350-450", protein "38-48", carbs "0-2", fat "18-26", sodium "300-500"
- Key: Butter/oil finish adds 100-150kcal. Skin-on adds ~50kcal
`;

// ─── System prompt (shared across models) ─────────────────────────────────────
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

${FEW_SHOT_EXAMPLES}

## CRITICAL RULES
1. Extract EVERY SINGLE dish from the menu — scan ALL sections, categories, pages. Do not skip any item.
2. per_ingredient_nutrition MUST include entries for ALL items in optional_additions and optional_removals using the SAME exact names
3. NEVER guess single-value numbers — always use ranges (min-max as string like "650-800")
4. If confidence < 0.5, set nutrition to "unavailable" string
5. Include recipe reconstruction for every dish
6. Nutrition ranges must be strings like "650-800", never numbers
7. Set has_image_in_menu to true ONLY if the menu image contains a photo of that specific dish
8. Detect ALL allergens for each dish — cross-reference EVERY ingredient against all 14 major allergens plus common sensitivities
9. Use the calibration examples above to anchor your portion and calorie estimates — if your numbers deviate significantly from similar examples, re-examine your assumptions`;

// ─── Tool schema (shared) ──────────────────────────────────────────────────
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
              allergens: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    severity: { type: "string", enum: ["definite", "likely", "possible", "trace"] },
                    source_ingredient: { type: "string" },
                  },
                  required: ["name", "severity", "source_ingredient"],
                },
              },
              has_image_in_menu: { type: "boolean", description: "Whether the menu image contains a photo of this specific dish" },
              data_sources: { type: "array", items: { type: "string" }, description: "Databases referenced" },
              notes: { type: "string", description: "Additional notes about the dish" },
            },
            required: ["dish", "confidence", "confidence_score", "ingredients_detected", "default_ingredients", "optional_additions", "optional_removals", "cooking_method", "portion_size_g", "recipe", "nutrition", "per_ingredient_nutrition", "allergens", "has_image_in_menu", "data_sources"],
          },
        },
      },
      required: ["restaurant_context", "dishes"],
      additionalProperties: false,
    },
  },
};

// ─── Verification tool schema ──────────────────────────────────────────────
const VERIFY_TOOL = {
  type: "function",
  function: {
    name: "verify_nutrition",
    description: "Verify and correct nutrition estimates from a previous analysis pass. Return corrected dishes.",
    parameters: {
      type: "object",
      properties: {
        corrections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish: { type: "string", description: "Dish name" },
              original_calories: { type: "string", description: "Original calorie range" },
              corrected_calories: { type: "string", description: "Corrected calorie range" },
              corrected_protein: { type: "string", description: "Corrected protein range" },
              corrected_carbs: { type: "string", description: "Corrected carbs range" },
              corrected_fat: { type: "string", description: "Corrected fat range" },
              corrected_sodium: { type: "string", description: "Corrected sodium range" },
              corrected_confidence: { type: "string", enum: ["high", "medium", "low"] },
              corrected_confidence_score: { type: "number" },
              correction_reason: { type: "string", description: "Why correction was needed" },
              is_correct: { type: "boolean", description: "Whether original was already correct" },
            },
            required: ["dish", "original_calories", "corrected_calories", "corrected_protein", "corrected_carbs", "corrected_fat", "corrected_sodium", "corrected_confidence", "corrected_confidence_score", "correction_reason", "is_correct"],
          },
        },
      },
      required: ["corrections"],
      additionalProperties: false,
    },
  },
};

// ─── User message (shared) ─────────────────────────────────────────────────
const USER_TEXT = `Analyze this menu image using ALL 7 methods (VID, RR, DCR, CC, SCOD, CLAM, CF). This is health-critical.

CRITICAL: Extract EVERY SINGLE dish/item from the menu. Scan ALL sections, categories, and pages visible. Do NOT skip any item.

STEP 1: Identify restaurant context.
STEP 2: Extract EVERY dish. Reconstruct FULL RECIPE with specific quantities.
STEP 3: Calculate nutrition using ALL methods. Cross-reference USDA data. Use RANGES.
STEP 4: Apply cooking loss & absorption modeling.
STEP 5: Use culinary fingerprinting for dish identification.
STEP 6: Run sanity checks — verify macro-to-calorie ratios.
STEP 7: Assign confidence scores (0.0-1.0).
STEP 8: For each dish, determine if the menu image contains a photograph of that dish (set has_image_in_menu accordingly).
STEP 9: Detect ALL allergens for each dish. Check every ingredient against all 14 major allergens. Mark severity as definite/likely/possible/trace.
STEP 10: Cross-check your estimates against the calibration examples. If a simple cheeseburger exceeds 900kcal or a plain salad without dressing exceeds 200kcal, re-examine.

Include per_ingredient_nutrition for ALL optional_additions, optional_removals, and top default ingredients.
Call extract_menu_analysis with the complete results.`;

// ─── Helper: call AI gateway ──────────────────────────────────────────────
async function callAI(
  apiKey: string,
  model: string,
  messages: any[],
  tools?: any[],
  toolChoice?: any
): Promise<any> {
  const body: any = { model, messages };
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const status = response.status;
    const text = await response.text();
    throw { status, message: text };
  }

  return response.json();
}

// ─── Helper: extract parsed result from AI response ───────────────────────
function extractParsed(data: any): any {
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try { return JSON.parse(toolCall.function.arguments); } catch {}
  }
  const content = data.choices?.[0]?.message?.content;
  if (content) {
    try {
      let s = content.trim();
      if (s.startsWith("```")) s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      return JSON.parse(s);
    } catch {}
  }
  return null;
}

// ─── Helper: parse mid value from range string ────────────────────────────
function parseMid(value: string | number): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parts = value.split(/[-–]/).map((v) => parseFloat(v.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return (parts[0] + parts[1]) / 2;
  return parseFloat(value) || 0;
}

// ─── Helper: reconcile two model outputs (ensemble averaging) ─────────────
function reconcileDishes(primary: any[], secondary: any[]): any[] {
  if (!secondary || secondary.length === 0) return primary;

  // Build a lookup from secondary by lowercased dish name
  const secondaryMap = new Map<string, any>();
  for (const d of secondary) {
    secondaryMap.set(d.dish?.toLowerCase(), d);
  }

  return primary.map((dish) => {
    const match = secondaryMap.get(dish.dish?.toLowerCase());
    if (!match || !match.nutrition || match.nutrition === "unavailable") return dish;
    if (!dish.nutrition || dish.nutrition === "unavailable") return dish;

    // Average the nutrition ranges
    const avgRange = (a: string, b: string): string => {
      const midA = parseMid(a);
      const midB = parseMid(b);
      if (midA === 0) return b;
      if (midB === 0) return a;
      const avg = (midA + midB) / 2;
      const spread = Math.round(avg * 0.1);
      return `${Math.round(avg - spread)}-${Math.round(avg + spread)}`;
    };

    dish.nutrition = {
      calories_kcal: avgRange(dish.nutrition.calories_kcal, match.nutrition.calories_kcal),
      protein_g: avgRange(dish.nutrition.protein_g, match.nutrition.protein_g),
      carbs_g: avgRange(dish.nutrition.carbs_g, match.nutrition.carbs_g),
      fat_g: avgRange(dish.nutrition.fat_g, match.nutrition.fat_g),
      fiber_g: dish.nutrition.fiber_g || match.nutrition.fiber_g,
      sugar_g: dish.nutrition.sugar_g || match.nutrition.sugar_g,
      sodium_mg: avgRange(dish.nutrition.sodium_mg, match.nutrition.sodium_mg),
    };

    // Average confidence scores
    if (dish.confidence_score !== undefined && match.confidence_score !== undefined) {
      dish.confidence_score = (dish.confidence_score + match.confidence_score) / 2;
    }

    // Mark as ensemble-verified
    dish.data_sources = [...new Set([...(dish.data_sources || []), ...(match.data_sources || []), "Ensemble (Gemini+GPT)"])];

    return dish;
  });
}

// ─── Main handler ─────────────────────────────────────────────────────────
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
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Starting ensemble analysis: Gemini Pro + GPT-5 in parallel...");

    const imageContent = [
      { type: "text", text: USER_TEXT },
      { type: "image_url", image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` } },
    ];

    const messagesPayload = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: imageContent },
    ];

    // ═══ PASS 1: Ensemble — run Gemini Pro + GPT-5 in parallel ═══
    const [geminiResult, gptResult] = await Promise.allSettled([
      callAI(LOVABLE_API_KEY, "google/gemini-2.5-pro", messagesPayload, [EXTRACT_MENU_TOOL], { type: "function", function: { name: "extract_menu_analysis" } }),
      callAI(LOVABLE_API_KEY, "openai/gpt-5", messagesPayload, [EXTRACT_MENU_TOOL], { type: "function", function: { name: "extract_menu_analysis" } }),
    ]);

    // Handle rate limits
    for (const r of [geminiResult, gptResult]) {
      if (r.status === "rejected" && r.reason?.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (r.status === "rejected" && r.reason?.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const geminiParsed = geminiResult.status === "fulfilled" ? extractParsed(geminiResult.value) : null;
    const gptParsed = gptResult.status === "fulfilled" ? extractParsed(gptResult.value) : null;

    // Use whichever succeeded as primary, with the other as secondary for reconciliation
    let primaryParsed = geminiParsed || gptParsed;
    let secondaryParsed = geminiParsed ? gptParsed : null;

    if (!primaryParsed) {
      return new Response(
        JSON.stringify({ error: "Both models failed to analyze the menu" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let dishes = Array.isArray(primaryParsed) ? primaryParsed : primaryParsed.dishes || [];
    const restaurantContext = primaryParsed.restaurant_context || null;

    // Reconcile with secondary model if available
    if (secondaryParsed) {
      const secondaryDishes = Array.isArray(secondaryParsed) ? secondaryParsed : secondaryParsed.dishes || [];
      if (secondaryDishes.length > 0) {
        console.log(`Reconciling ${dishes.length} primary dishes with ${secondaryDishes.length} secondary dishes`);
        dishes = reconcileDishes(dishes, secondaryDishes);
      }
    }

    console.log(`Ensemble pass complete: ${dishes.length} dishes. ${secondaryParsed ? "Both models contributed." : "Single model only."}`);

    // ═══ PASS 2: Verification — second model pass to check/correct ═══
    const dishSummaries = dishes.map(d => {
      if (!d.nutrition || d.nutrition === "unavailable") return `- ${d.dish}: nutrition unavailable`;
      return `- ${d.dish}: ${d.nutrition.calories_kcal} kcal, P:${d.nutrition.protein_g}g, C:${d.nutrition.carbs_g}g, F:${d.nutrition.fat_g}g, portion:${d.portion_size_g}g, method:${d.cooking_method}, confidence:${d.confidence_score}`;
    }).join("\n");

    const verificationPrompt = `You are a senior nutrition auditor. Review these menu analysis results for accuracy.

## Restaurant Context
Type: ${restaurantContext?.type || "unknown"}, Cuisine: ${restaurantContext?.cuisine || "unknown"}, Portions: ${restaurantContext?.portion_style || "unknown"}, Price: ${restaurantContext?.price_tier || "unknown"}

## Dishes to Verify
${dishSummaries}

${FEW_SHOT_EXAMPLES}

## YOUR TASK
For EACH dish:
1. Verify the calorie range is plausible for the dish type, cuisine, and restaurant context
2. Check that protein + carbs + fat (in kcal) sum within 15% of total calories (P*4 + C*4 + F*9 ≈ total)
3. Verify portion size is realistic for the restaurant type
4. Compare against the calibration examples — flag obvious outliers
5. If a dish is wrong, provide corrected values. If correct, mark is_correct: true

Be conservative — only correct clear errors (>20% off). Minor variations within ranges are acceptable.
Call verify_nutrition with your corrections.`;

    try {
      // Use the faster model for verification to avoid rate limits
      const verifyResponse = await callAI(
        LOVABLE_API_KEY,
        "google/gemini-2.5-flash",
        [
          { role: "system", content: "You are a nutrition verification expert. Check analysis results for accuracy and correct errors." },
          { role: "user", content: verificationPrompt },
        ],
        [VERIFY_TOOL],
        { type: "function", function: { name: "verify_nutrition" } }
      );

      const verifyParsed = extractParsed(verifyResponse);
      if (verifyParsed?.corrections) {
        let correctionCount = 0;
        for (const correction of verifyParsed.corrections) {
          if (correction.is_correct) continue;
          const dish = dishes.find(d => d.dish?.toLowerCase() === correction.dish?.toLowerCase());
          if (!dish || !dish.nutrition || dish.nutrition === "unavailable") continue;

          dish.nutrition.calories_kcal = correction.corrected_calories;
          dish.nutrition.protein_g = correction.corrected_protein;
          dish.nutrition.carbs_g = correction.corrected_carbs;
          dish.nutrition.fat_g = correction.corrected_fat;
          dish.nutrition.sodium_mg = correction.corrected_sodium;
          dish.confidence = correction.corrected_confidence;
          dish.confidence_score = correction.corrected_confidence_score;
          dish.data_sources = [...new Set([...(dish.data_sources || []), "Verification Pass"])];
          correctionCount++;
        }
        console.log(`Verification pass: ${correctionCount} corrections applied out of ${verifyParsed.corrections.length} dishes checked`);
      }
    } catch (verifyErr: any) {
      // Verification is best-effort — don't fail the whole request
      console.warn("Verification pass failed (non-critical):", verifyErr?.message || verifyErr);
    }

    // ═══ Post-processing: final sanity check ═══
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

    console.log("Pipeline complete:", dishes.length, "dishes analyzed");

    return new Response(
      JSON.stringify({ dishes, restaurant_context: restaurantContext }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    if (error?.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    if (error?.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI credits exhausted. Please add funds to continue." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.error("Error analyzing menu:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
