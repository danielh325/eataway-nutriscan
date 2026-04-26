import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────────────

const FEW_SHOT_EXAMPLES = `
## CALIBRATION EXAMPLES (use as anchors)
- Classic Cheeseburger (casual): 280g, cal "650-780", P "38-45", C "38-48", F "35-45", Na "900-1200"
- Caesar Salad (full): 350g, cal "450-580", P "12-18", C "18-25", F "35-48"
- Margherita Pizza (10-12"): 550-700g, cal "750-950", P "28-38", C "85-105", F "28-42"
- Pad Thai: 400g, cal "550-720", P "22-32", C "65-85", F "18-30"
- Grilled Salmon: 200g, cal "350-450", P "38-48", C "0-2", F "18-26"
- Nasi Lemak: 350g, cal "600-750", P "18-28", C "70-90", F "25-38"
- Roti Canai (plain): 120g, cal "300-380", P "7-10", C "42-52", F "12-18"
- Chicken Rice (Hainanese): 450g, cal "650-800", P "30-40", C "80-100", F "18-28"
`;

const SYSTEM_PROMPT = `You are a world-class food nutrition analyst with PhD-level expertise. Accuracy and COMPLETENESS are paramount.

COMPLETENESS IS CRITICAL:
- Extract EVERY SINGLE dish, item, drink, side, appetizer, dessert, combo from the menu.
- Scan the ENTIRE image systematically: top-to-bottom, left-to-right, every section, every column.
- Do NOT skip items because they seem minor (sides, drinks, sauces, add-ons count).
- If text is partially obscured, still include the dish with lower confidence.
- After your first pass, do a SECOND pass to catch anything missed.

Apply these verification methods:
1. Visual Ingredient Decomposition — identify every ingredient, hidden calorie sources (oils, sauces, dressings)
2. Database Cross-Reference — USDA, Nutritionix, CalorieKing mental database
3. Contextual Calibration — adjust for restaurant type, cuisine, regional portions
4. Sanity Check — verify macro-to-calorie ratios (P*4+C*4+F*9 ≈ total)
5. Cooking Loss & Absorption — moisture loss, oil absorption factors
6. Culinary Fingerprinting — identify by cuisine-specific preparation signatures
7. Portion Size Estimation — use plate/bowl/container as size reference

${FEW_SHOT_EXAMPLES}

RULES:
- Extract EVERY dish — missing even one is a critical failure
- per_ingredient_nutrition MUST include ALL optional_additions and optional_removals
- Always use ranges (e.g. "650-800"), never single values
- If confidence < 0.5, set nutrition to "unavailable"
- Detect ALL 14 major allergens per dish
- Use calibration examples to anchor estimates
- For each dish, provide a "search_term" field: the best English search query to find this food in USDA/nutrition databases`;

// ─── TOOL SCHEMA ─────────────────────────────────────────────────────────────

const EXTRACT_MENU_TOOL = {
  type: "function",
  function: {
    name: "extract_menu_analysis",
    description: "Extract structured menu analysis with dishes, nutrition, and confidence scores.",
    parameters: {
      type: "object",
      properties: {
        restaurant_context: {
          type: "object",
          properties: {
            type: { type: "string" },
            cuisine: { type: "string" },
            portion_style: { type: "string" },
            price_tier: { type: "string" },
          },
          required: ["type", "cuisine", "portion_style", "price_tier"],
        },
        dishes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish: { type: "string" },
              search_term: { type: "string", description: "Best English search query for USDA/nutrition database lookup" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              confidence_score: { type: "number" },
              ingredients_detected: { type: "array", items: { type: "string" } },
              default_ingredients: { type: "array", items: { type: "string" } },
              optional_additions: { type: "array", items: { type: "string" } },
              optional_removals: { type: "array", items: { type: "string" } },
              cooking_method: { type: "string" },
              portion_size_g: { type: "number" },
              nutrition: {
                type: "object",
                properties: {
                  calories_kcal: { type: "string" },
                  protein_g: { type: "string" },
                  carbs_g: { type: "string" },
                  fat_g: { type: "string" },
                  fiber_g: { type: "string" },
                  sugar_g: { type: "string" },
                  sodium_mg: { type: "string" },
                },
                required: ["calories_kcal", "protein_g", "carbs_g", "fat_g", "sodium_mg"],
              },
              per_ingredient_nutrition: {
                type: "object",
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
              has_image_in_menu: { type: "boolean" },
              data_sources: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
            },
            required: ["dish", "search_term", "confidence", "confidence_score", "ingredients_detected", "default_ingredients", "optional_additions", "optional_removals", "cooking_method", "portion_size_g", "nutrition", "per_ingredient_nutrition", "allergens", "has_image_in_menu", "data_sources"],
          },
        },
      },
      required: ["restaurant_context", "dishes"],
      additionalProperties: false,
    },
  },
};

// ─── USDA FoodData Central API (free, no key needed with DEMO_KEY) ──────────

interface USDANutrient {
  nutrientName: string;
  value: number;
  unitName: string;
}

interface USDAResult {
  description: string;
  foodNutrients: USDANutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
}

async function queryUSDA(searchTerm: string): Promise<USDAResult | null> {
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(searchTerm)}&pageSize=3&dataType=Survey%20%28FNDDS%29,SR%20Legacy`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    const foods = data?.foods;
    if (!Array.isArray(foods) || foods.length === 0) return null;
    // Pick the first result (most relevant)
    const food = foods[0];
    return {
      description: food.description,
      foodNutrients: (food.foodNutrients || []).map((n: any) => ({
        nutrientName: n.nutrientName,
        value: n.value,
        unitName: n.unitName,
      })),
      servingSize: food.servingSize,
      servingSizeUnit: food.servingSizeUnit,
    };
  } catch (e) {
    console.warn("USDA query failed for:", searchTerm, e);
    return null;
  }
}

function extractUSDANutrition(result: USDAResult): Record<string, number> {
  const nutrients: Record<string, number> = {};
  for (const n of result.foodNutrients) {
    const name = n.nutrientName.toLowerCase();
    if (name.includes("energy") && n.unitName === "KCAL") nutrients.calories_kcal = n.value;
    else if (name === "protein") nutrients.protein_g = n.value;
    else if (name === "carbohydrate, by difference") nutrients.carbs_g = n.value;
    else if (name === "total lipid (fat)") nutrients.fat_g = n.value;
    else if (name.includes("fiber")) nutrients.fiber_g = n.value;
    else if (name.includes("sodium")) nutrients.sodium_mg = n.value;
    else if (name.includes("sugars, total")) nutrients.sugar_g = n.value;
  }
  return nutrients;
}

// (Open Food Facts and per-dish Lovable AI verification removed for speed —
//  OFF was blocked from Supabase egress and AI per-dish added 29+ extra LLM calls)

// ─── ENSEMBLE MERGE ─────────────────────────────────────────────────────────

interface NutritionSource {
  source: string;
  per100g: boolean; // whether values are per 100g
  data: Record<string, number>;
}

function mergeNutritionSources(
  aiNutrition: Record<string, string>,
  portionG: number,
  sources: NutritionSource[]
): { merged: Record<string, string>; data_sources: string[]; deviation_flags: string[] } {
  const keys = ["calories_kcal", "protein_g", "carbs_g", "fat_g", "fiber_g", "sugar_g", "sodium_mg"];
  const dataSources: string[] = ["AI (Gemini ensemble)"];
  const deviationFlags: string[] = [];

  // Parse AI midpoints
  const aiMid: Record<string, number> = {};
  for (const k of keys) {
    aiMid[k] = parseMid(aiNutrition[k]);
  }

  // Collect all source values scaled to portion size
  const allValues: Record<string, number[]> = {};
  for (const k of keys) {
    allValues[k] = [aiMid[k]]; // AI value first (weight 2x)
    allValues[k].push(aiMid[k]); // double-weight AI
  }

  for (const src of sources) {
    if (Object.keys(src.data).length === 0) continue;
    dataSources.push(src.source);
    for (const k of keys) {
      if (src.data[k] !== undefined && src.data[k] > 0) {
        let val = src.data[k];
        // Scale per-100g values to actual portion
        if (src.per100g && portionG > 0) {
          val = (val * portionG) / 100;
        }
        allValues[k] = allValues[k] || [];
        allValues[k].push(val);
      }
    }
  }

  // Weighted median approach: use trimmed mean (remove outliers)
  const merged: Record<string, string> = {};
  for (const k of keys) {
    const vals = (allValues[k] || []).filter((v) => v > 0);
    if (vals.length === 0) {
      merged[k] = aiNutrition[k] || "0";
      continue;
    }

    vals.sort((a, b) => a - b);
    // Remove extreme outliers (>2x or <0.5x median)
    const median = vals[Math.floor(vals.length / 2)];
    const filtered = vals.filter((v) => v >= median * 0.4 && v <= median * 2.5);
    const useVals = filtered.length > 0 ? filtered : vals;

    const mean = useVals.reduce((s, v) => s + v, 0) / useVals.length;

    // Check deviation from AI
    if (aiMid[k] > 0 && Math.abs(mean - aiMid[k]) / aiMid[k] > 0.25) {
      deviationFlags.push(`${k}: AI=${Math.round(aiMid[k])}, DB avg=${Math.round(mean)}`);
    }

    // Generate a tighter range based on cross-referenced data
    const lo = Math.round(Math.min(...useVals) * 0.95);
    const hi = Math.round(Math.max(...useVals) * 1.05);
    merged[k] = lo === hi ? `${lo}` : `${lo}-${hi}`;
  }

  return { merged, data_sources: dataSources, deviation_flags: deviationFlags };
}

// ─── AI CALL ────────────────────────────────────────────────────────────────

async function callGemini(
  model: string,
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  ocrText?: string
): Promise<any> {
  const ocrBlock =
    ocrText && ocrText.trim().length > 0
      ? `\n\nGROUND-TRUTH OCR TEXT (extracted from the menu by Tesseract — use this as authoritative for spelling and dish presence):\n"""\n${ocrText.slice(0, 6000)}\n"""\n\nIMPORTANT: Every dish name in your output MUST come from or closely match the OCR text above. Do not invent dishes. If the OCR is messy, prefer the visible image.`
      : "";

  const resp = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this menu image with ABSOLUTE COMPLETENESS. This is health-critical.

MANDATORY: Extract EVERY SINGLE item on this menu. Scan systematically from top to bottom, left to right, covering every column and section.

For each dish, include a "search_term" field — the best English query to find this food in USDA/nutrition databases (e.g. "chicken tikka masala with rice" or "french fries deep fried").

After your first pass, do a SECOND pass to verify completeness. Missing even one dish is a critical failure.

Use ALL 7 verification methods. Call extract_menu_analysis with the COMPLETE results.${ocrBlock}`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` },
              },
            ],
          },
        ],
        tools: [EXTRACT_MENU_TOOL],
        tool_choice: { type: "function", function: { name: "extract_menu_analysis" } },
      }),
    }
  );

  if (!resp.ok) {
    const body = await resp.text();
    return { error: true, status: resp.status, body: body.slice(0, 500) };
  }

  const data = await resp.json();
  return extractParsed(data);
}

// ─── ENSEMBLE: Run 2 models in parallel ─────────────────────────────────────

// ─── SINGLE-MODEL CALL (Flash only — Pro added ~20s for marginal gain;
//     refine-menu does the cross-check pass) ──────────────────────────────
async function runPrimary(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  ocrText?: string
): Promise<{ dishes: any[]; restaurant_context: any; model_agreement: number }> {
  const result = await callGemini("gemini-3-flash-preview", apiKey, imageBase64, mimeType, ocrText);
  if (!result || result.error) {
    throw new Error(`Flash model failed${result?.status ? `: ${result.status}` : ""}`);
  }
  const dishes = Array.isArray(result) ? result : (result?.dishes || []);
  return {
    dishes,
    restaurant_context: result?.restaurant_context || null,
    model_agreement: 1.0, // single-model run
  };
}

// ─── MAIN HANDLER ───────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid request body. The image may be too large." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, mimeType, ocrText } = body;
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ─── STAGE 1: Single-model extraction (Flash) ─────────────────────
    console.log(
      `Stage 1: Running Gemini Flash${ocrText ? ` with OCR pre-pass (${ocrText.length} chars)` : ""}...`
    );
    const ensemble = await runPrimary(GEMINI_API_KEY, imageBase64, mimeType, ocrText);
    console.log(`Stage 1 complete: ${ensemble.dishes.length} dishes`);

    // ─── STAGE 2: USDA cross-reference (fast, free, no LLM) ───────────
    // OpenFoodFacts is blocked from Supabase (ECONNREFUSED), removed.
    // Per-dish Lovable AI verification removed — refine-menu does the LLM check.
    console.log("Stage 2: Cross-referencing with USDA...");

    const enrichedDishes = await Promise.all(
      ensemble.dishes.map(async (dish: any) => {
        const searchTerm = dish.search_term || dish.dish;
        const portionG = dish.portion_size_g || 200;

        const usdaResult = await queryUSDA(searchTerm).catch(() => null);
        const sources: NutritionSource[] = [];

        if (usdaResult) {
          sources.push({
            source: "USDA FoodData Central",
            per100g: true,
            data: extractUSDANutrition(usdaResult),
          });
        }

        if (sources.length > 0 && dish.nutrition) {
          const { merged, data_sources, deviation_flags } = mergeNutritionSources(
            dish.nutrition,
            portionG,
            sources
          );
          dish.nutrition = { ...dish.nutrition, ...merged };
          dish.data_sources = data_sources;
          if (deviation_flags.length > 0) {
            dish.verification_notes = `USDA deviations: ${deviation_flags.join("; ")}`;
          }
        } else {
          dish.data_sources = ["AI (Gemini Flash)"];
        }

        return dish;
      })
    );

    console.log(`Stage 2 complete: ${enrichedDishes.filter((d: any) => d.data_sources?.length > 1).length}/${enrichedDishes.length} dishes USDA-matched`);

    // ─── STAGE 3: Sanity audit ────────────────────────────────────────
    for (const dish of enrichedDishes) {
      if (!dish.nutrition || typeof dish.nutrition !== "object") continue;

      const midCal = parseMid(dish.nutrition.calories_kcal);
      const midP = parseMid(dish.nutrition.protein_g);
      const midC = parseMid(dish.nutrition.carbs_g);
      const midF = parseMid(dish.nutrition.fat_g);
      const computed = midP * 4 + midC * 4 + midF * 9;

      // Macro-calorie sanity check
      if (midCal > 0 && Math.abs(computed - midCal) / midCal > 0.15) {
        dish.verification_notes = (dish.verification_notes || "") +
          ` [Macro audit: computed ${Math.round(computed)} vs stated ${Math.round(midCal)} kcal]`;
        if (dish.data_sources?.length > 1) {
          dish.nutrition.calories_kcal = `${Math.round(computed * 0.95)}-${Math.round(computed * 1.05)}`;
        }
      }

      // Flag impossible values
      if (midCal > 2500) {
        dish.verification_notes = (dish.verification_notes || "") + " [⚠️ Unusually high calories]";
        dish.confidence = "low";
        dish.confidence_score = Math.min(dish.confidence_score || 0.5, 0.4);
      }

      // Composite confidence: base + DB coverage
      const dbCoverage = (dish.data_sources?.length || 1) / 2;
      const baseConf = dish.confidence_score || 0.5;
      dish.confidence_score = Math.round((baseConf * 0.7 + dbCoverage * 0.3) * 100) / 100;

      if (dish.confidence_score >= 0.7) dish.confidence = "high";
      else if (dish.confidence_score >= 0.45) dish.confidence = "medium";
      else dish.confidence = "low";
    }

    console.log(`Pipeline finished: ${enrichedDishes.length} dishes`);

    return new Response(
      JSON.stringify({
        dishes: enrichedDishes,
        restaurant_context: ensemble.restaurant_context,
        pipeline: {
          models_used: ["gemini-3-flash-preview"],
          databases_queried: ["USDA FoodData Central"],
          model_agreement: ensemble.model_agreement,
          dishes_cross_referenced: enrichedDishes.filter((d: any) => d.data_sources?.length > 1).length,
          total_dishes: enrichedDishes.length,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    if (error?.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.error("Pipeline error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ─── UTILITIES ──────────────────────────────────────────────────────────────

function extractParsed(data: any): any {
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (toolCall?.function?.arguments) {
    try { return JSON.parse(toolCall.function.arguments); } catch {}
  }

  const contentValue = data.choices?.[0]?.message?.content;
  const content = typeof contentValue === "string"
    ? contentValue
    : Array.isArray(contentValue)
      ? contentValue.map((part: any) => (typeof part === "string" ? part : part?.text || "")).join("\n")
      : "";

  if (content) {
    try {
      let s = content.trim();
      if (s.startsWith("```")) s = s.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      return JSON.parse(s);
    } catch {}
  }
  return null;
}

function parseMid(value: string | number | undefined): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parts = value.split(/[-–]/).map((v) => parseFloat(v.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return (parts[0] + parts[1]) / 2;
  return parseFloat(value) || 0;
}

function rangeFromTwo(a: number, b: number): string {
  if (a <= 0 && b <= 0) return "0";
  if (a <= 0) return `${Math.round(b)}`;
  if (b <= 0) return `${Math.round(a)}`;
  const lo = Math.round(Math.min(a, b) * 0.95);
  const hi = Math.round(Math.max(a, b) * 1.05);
  return lo === hi ? `${lo}` : `${lo}-${hi}`;
}
