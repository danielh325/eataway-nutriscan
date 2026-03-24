import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FEW_SHOT_EXAMPLES = `
## CALIBRATION EXAMPLES (use as anchors)
- Classic Cheeseburger (casual): 280g, cal "650-780", P "38-45", C "38-48", F "35-45", Na "900-1200"
- Caesar Salad (full): 350g, cal "450-580", P "12-18", C "18-25", F "35-48"
- Margherita Pizza (10-12"): 550-700g, cal "750-950", P "28-38", C "85-105", F "28-42"
- Pad Thai: 400g, cal "550-720", P "22-32", C "65-85", F "18-30"
- Grilled Salmon: 200g, cal "350-450", P "38-48", C "0-2", F "18-26"
`;

const SYSTEM_PROMPT = `You are a world-class food nutrition analyst. Accuracy and COMPLETENESS are paramount.

COMPLETENESS IS CRITICAL:
- You MUST extract EVERY SINGLE dish, item, drink, side, appetizer, dessert, and combo from the menu.
- Scan the ENTIRE image systematically: top-to-bottom, left-to-right, every section, every column.
- Do NOT skip items because they seem minor (sides, drinks, sauces, add-ons count as dishes).
- If the menu has multiple sections (starters, mains, desserts, beverages, specials), extract from ALL sections.
- If text is partially obscured, still include the dish with lower confidence.
- After your first pass, do a SECOND pass to catch anything missed.

Apply ALL verification methods:
1. Visual Ingredient Decomposition — identify every ingredient, hidden calorie sources
2. Recipe Reconstruction — reconstruct professional recipe with exact quantities
3. Database Cross-Reference — USDA, Nutritionix, CalorieKing
4. Contextual Calibration — adjust for restaurant type, cuisine, portions
5. Sanity Check — verify macro-to-calorie ratios (P*4+C*4+F*9 ≈ total)
6. Cooking Loss & Absorption — moisture loss, oil absorption factors
7. Culinary Fingerprinting — identify by cuisine-specific preparation signatures

${FEW_SHOT_EXAMPLES}

RULES:
- Extract EVERY dish — missing even one is a critical failure
- per_ingredient_nutrition MUST include ALL optional_additions and optional_removals
- Always use ranges (e.g. "650-800"), never single values
- If confidence < 0.5, set nutrition to "unavailable"
- Detect ALL 14 major allergens per dish
- Use calibration examples to anchor estimates`;

const ANALYSIS_MODELS = ["google/gemini-3-flash-preview", "google/gemini-2.5-flash-lite"];

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
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              confidence_score: { type: "number" },
              ingredients_detected: { type: "array", items: { type: "string" } },
              default_ingredients: { type: "array", items: { type: "string" } },
              optional_additions: { type: "array", items: { type: "string" } },
              optional_removals: { type: "array", items: { type: "string" } },
              cooking_method: { type: "string" },
              portion_size_g: { type: "number" },
              recipe: {
                type: "object",
                properties: {
                  method: { type: "string" },
                  key_quantities: { type: "array", items: { type: "string" } },
                },
                required: ["method", "key_quantities"],
              },
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
            required: ["dish", "confidence", "confidence_score", "ingredients_detected", "default_ingredients", "optional_additions", "optional_removals", "cooking_method", "portion_size_g", "recipe", "nutrition", "per_ingredient_nutrition", "allergens", "has_image_in_menu", "data_sources"],
          },
        },
      },
      required: ["restaurant_context", "dishes"],
      additionalProperties: false,
    },
  },
};

async function safeJsonFromResponse(response: Response): Promise<any | null> {
  const raw = await response.text();
  if (!raw?.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse AI response JSON:", e, raw.slice(0, 400));
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // JWT validation
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: any;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error("Failed to parse request body:", parseErr);
      return new Response(
        JSON.stringify({ error: "Invalid request body. The image may be too large." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const { imageBase64, mimeType } = body;

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

    const gatewayErrors: Array<{ model: string; status: number; body: string }> = [];
    let response: Response | null = null;

    for (const model of ANALYSIS_MODELS) {
      console.log(`Menu analysis attempt with ${model}...`);

      const attempt = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
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

MANDATORY: Extract EVERY SINGLE item on this menu — every dish, appetizer, starter, main, side, dessert, drink, combo, and special. Do NOT skip any section of the menu. Scan systematically from top to bottom, left to right, covering every column and section visible in the image.

After your first extraction pass, do a SECOND pass to verify you haven't missed anything. Missing even one dish is a critical failure.

Use ALL 7 verification methods. Call extract_menu_analysis with the COMPLETE results.`,
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
      });

      if (attempt.ok) {
        response = attempt;
        break;
      }

      const attemptBody = await attempt.text();
      gatewayErrors.push({ model, status: attempt.status, body: attemptBody.slice(0, 500) });
    }

    if (!response) {
      const hadRateLimit = gatewayErrors.some((e) => e.status === 429);
      const hadCreditsIssue = gatewayErrors.every((e) => e.status === 402);

      if (hadRateLimit) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (hadCreditsIssue) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.error("AI error across fallback models:", gatewayErrors);
      return new Response(JSON.stringify({ error: "Failed to analyze menu" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await safeJsonFromResponse(response);
    if (!data) {
      return new Response(JSON.stringify({ error: "Invalid or empty AI response" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let parsed = extractParsed(data);

    if (!parsed) {
      return new Response(JSON.stringify({ error: "No analysis returned" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dishes = Array.isArray(parsed) ? parsed : parsed.dishes || [];
    const restaurantContext = parsed.restaurant_context || null;

    // Quick sanity check
    for (const dish of dishes) {
      if (dish.nutrition && typeof dish.nutrition === "object") {
        const midCal = parseMid(dish.nutrition.calories_kcal);
        const midP = parseMid(dish.nutrition.protein_g);
        const midC = parseMid(dish.nutrition.carbs_g);
        const midF = parseMid(dish.nutrition.fat_g);
        const computed = midP * 4 + midC * 4 + midF * 9;
        if (midCal > 0 && Math.abs(computed - midCal) / midCal > 0.25) {
          dish.verification_notes = `[Macro sum ${Math.round(computed)} vs stated ${Math.round(midCal)} kcal]`;
        }
      }
    }

    console.log("Fast pass complete:", dishes.length, "dishes");

    return new Response(
      JSON.stringify({ dishes, restaurant_context: restaurantContext }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    if (error?.status === 429) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

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

function parseMid(value: string | number): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  const parts = value.split(/[-–]/).map((v) => parseFloat(v.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return (parts[0] + parts[1]) / 2;
  return parseFloat(value) || 0;
}
