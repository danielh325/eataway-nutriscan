import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FEW_SHOT_EXAMPLES = `
## CALIBRATION EXAMPLES
- Classic Cheeseburger (casual): 280g, calories "650-780", P "38-45", C "38-48", F "35-45"
- Caesar Salad (full): 350g, calories "450-580", P "12-18", C "18-25", F "35-48"
- Margherita Pizza (10-12"): 550-700g, calories "750-950", P "28-38", C "85-105", F "28-42"
- Pad Thai: 400g, calories "550-720", P "22-32", C "65-85", F "18-30"
- Grilled Salmon: 200g, calories "350-450", P "38-48", C "0-2", F "18-26"
`;

const VERIFY_TOOL = {
  type: "function",
  function: {
    name: "verify_nutrition",
    description: "Verify and correct nutrition estimates. Return corrected dishes.",
    parameters: {
      type: "object",
      properties: {
        corrections: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish: { type: "string" },
              original_calories: { type: "string" },
              corrected_calories: { type: "string" },
              corrected_protein: { type: "string" },
              corrected_carbs: { type: "string" },
              corrected_fat: { type: "string" },
              corrected_sodium: { type: "string" },
              corrected_confidence: { type: "string", enum: ["high", "medium", "low"] },
              corrected_confidence_score: { type: "number" },
              correction_reason: { type: "string" },
              is_correct: { type: "boolean" },
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

const EXTRACT_MENU_TOOL = {
  type: "function",
  function: {
    name: "extract_menu_analysis",
    description: "Extract structured menu analysis with dishes, nutrition, and confidence scores.",
    parameters: {
      type: "object",
      properties: {
        dishes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dish: { type: "string" },
              confidence: { type: "string", enum: ["high", "medium", "low"] },
              confidence_score: { type: "number" },
              nutrition: {
                type: "object",
                properties: {
                  calories_kcal: { type: "string" },
                  protein_g: { type: "string" },
                  carbs_g: { type: "string" },
                  fat_g: { type: "string" },
                  sodium_mg: { type: "string" },
                },
                required: ["calories_kcal", "protein_g", "carbs_g", "fat_g", "sodium_mg"],
              },
              cooking_method: { type: "string" },
              portion_size_g: { type: "number" },
              ingredients_detected: { type: "array", items: { type: "string" } },
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
              data_sources: { type: "array", items: { type: "string" } },
              notes: { type: "string" },
            },
            required: ["dish", "confidence", "confidence_score", "nutrition", "ingredients_detected", "data_sources"],
          },
        },
      },
      required: ["dishes"],
      additionalProperties: false,
    },
  },
};

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

function avgRange(a: string, b: string): string {
  const midA = parseMid(a);
  const midB = parseMid(b);
  if (midA === 0) return b;
  if (midB === 0) return a;
  const avg = (midA + midB) / 2;
  const spread = Math.round(avg * 0.1);
  return `${Math.round(avg - spread)}-${Math.round(avg + spread)}`;
}

async function safeJsonFromResponse(response: Response): Promise<any | null> {
  const raw = await response.text();
  if (!raw?.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to parse AI JSON response:", e, raw.slice(0, 300));
    return null;
  }
}

async function callGemini(apiKey: string, model: string, messages: any[], tools?: any[], toolChoice?: any): Promise<Response> {
  return fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      ...(tools ? { tools } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let body: any;
    try {
      body = await req.json();
    } catch (parseErr) {
      console.error("Failed to parse refinement request:", parseErr);
      return new Response(
        JSON.stringify({ error: "Invalid refinement payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { dishes, restaurant_context, imageBase64, mimeType } = body;

    if (!dishes || !Array.isArray(dishes)) {
      return new Response(
        JSON.stringify({ error: "No dishes provided for refinement" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Google Gemini API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Refining ${dishes.length} dishes with Gemini ensemble + verification...`);

    const rc = restaurant_context || {};

    // ═══ Step 1: Second model pass (re-analyze with image if provided) ═══
    let secondDishes: any[] = [];

    if (imageBase64 && mimeType) {
      try {
        const secondResponse = await callGemini(
          GEMINI_API_KEY,
          "gemini-2.5-pro",
          [
            { role: "system", content: `You are a nutrition analyst. Analyze this menu image and extract nutrition for ALL dishes. Use ranges (e.g. "650-800"). ${FEW_SHOT_EXAMPLES}` },
            {
              role: "user",
              content: [
                { type: "text", text: "Analyze every dish in this menu. Return structured nutrition with ranges. Call extract_menu_analysis." },
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              ],
            },
          ],
          [EXTRACT_MENU_TOOL],
          { type: "function", function: { name: "extract_menu_analysis" } }
        );

        if (secondResponse.ok) {
          const secondData = await safeJsonFromResponse(secondResponse);
          if (secondData) {
            const secondParsed = extractParsed(secondData);
            secondDishes = Array.isArray(secondParsed?.dishes) ? secondParsed.dishes : [];
            console.log(`Gemini Pro returned ${secondDishes.length} dishes`);
          }
        } else {
          const errText = await secondResponse.text();
          console.warn("Gemini Pro failed:", secondResponse.status, errText.slice(0, 180));
        }
      } catch (e: any) {
        console.warn("Ensemble error:", e?.message || e);
      }
    }

    // ═══ Step 2: Reconcile ═══
    let refinedDishes = [...dishes];
    if (secondDishes.length > 0) {
      const secondMap = new Map<string, any>();
      for (const d of secondDishes) secondMap.set(d.dish?.toLowerCase(), d);

      refinedDishes = dishes.map((dish: any) => {
        const match = secondMap.get(dish.dish?.toLowerCase());
        if (!match?.nutrition || match.nutrition === "unavailable") return dish;
        if (!dish.nutrition || dish.nutrition === "unavailable") return dish;

        return {
          ...dish,
          nutrition: {
            ...dish.nutrition,
            calories_kcal: avgRange(dish.nutrition.calories_kcal, match.nutrition.calories_kcal),
            protein_g: avgRange(dish.nutrition.protein_g, match.nutrition.protein_g),
            carbs_g: avgRange(dish.nutrition.carbs_g, match.nutrition.carbs_g),
            fat_g: avgRange(dish.nutrition.fat_g, match.nutrition.fat_g),
            sodium_mg: avgRange(dish.nutrition.sodium_mg, match.nutrition.sodium_mg),
          },
          confidence_score: dish.confidence_score !== undefined && match.confidence_score !== undefined
            ? (dish.confidence_score + match.confidence_score) / 2
            : dish.confidence_score,
          data_sources: [...new Set([...(dish.data_sources || []), ...(match.data_sources || []), "Ensemble (Gemini Pro)"])],
        };
      });
    }

    // ═══ Step 3: Verification pass ═══
    const dishSummaries = refinedDishes.map((d: any) => {
      if (!d.nutrition || d.nutrition === "unavailable") return `- ${d.dish}: unavailable`;
      return `- ${d.dish}: ${d.nutrition.calories_kcal} kcal, P:${d.nutrition.protein_g}g, C:${d.nutrition.carbs_g}g, F:${d.nutrition.fat_g}g, portion:${d.portion_size_g}g`;
    }).join("\n");

    try {
      const verifyResponse = await callGemini(
        GEMINI_API_KEY,
        "gemini-2.5-flash",
        [
          { role: "system", content: "You are a nutrition auditor. Verify and correct nutrition estimates. Only correct clear errors (>20% off)." },
          {
            role: "user",
            content: `Verify these nutrition estimates:\n\nRestaurant: ${rc.type || "?"}, ${rc.cuisine || "?"}, ${rc.portion_style || "?"}\n\n${dishSummaries}\n\n${FEW_SHOT_EXAMPLES}\n\nFor each dish, check macro-calorie consistency (P*4+C*4+F*9≈total). Call verify_nutrition.`,
          },
        ],
        [VERIFY_TOOL],
        { type: "function", function: { name: "verify_nutrition" } }
      );

      if (verifyResponse.ok) {
        const verifyData = await safeJsonFromResponse(verifyResponse);
        const verifyParsed = verifyData ? extractParsed(verifyData) : null;
        if (verifyParsed?.corrections) {
          let correctionCount = 0;
          for (const c of verifyParsed.corrections) {
            if (c.is_correct) continue;
            const dish = refinedDishes.find((d: any) => d.dish?.toLowerCase() === c.dish?.toLowerCase());
            if (!dish?.nutrition || dish.nutrition === "unavailable") continue;
            dish.nutrition.calories_kcal = c.corrected_calories;
            dish.nutrition.protein_g = c.corrected_protein;
            dish.nutrition.carbs_g = c.corrected_carbs;
            dish.nutrition.fat_g = c.corrected_fat;
            dish.nutrition.sodium_mg = c.corrected_sodium;
            dish.confidence = c.corrected_confidence;
            dish.confidence_score = c.corrected_confidence_score;
            dish.data_sources = [...new Set([...(dish.data_sources || []), "Verification Pass"])];
            correctionCount++;
          }
          console.log(`Verification: ${correctionCount} corrections applied`);
        }
      } else {
        const verifyErr = await verifyResponse.text();
        console.warn("Verification failed:", verifyResponse.status, verifyErr.slice(0, 180));
      }
    } catch (e: any) {
      console.warn("Verification failed (non-critical):", e?.message || e);
    }

    // Sanity check
    for (const dish of refinedDishes) {
      if (dish.nutrition && typeof dish.nutrition === "object") {
        const midCal = parseMid(dish.nutrition.calories_kcal);
        const midP = parseMid(dish.nutrition.protein_g);
        const midC = parseMid(dish.nutrition.carbs_g);
        const midF = parseMid(dish.nutrition.fat_g);
        const computed = midP * 4 + midC * 4 + midF * 9;
        if (midCal > 0 && Math.abs(computed - midCal) / midCal > 0.25) {
          dish.verification_notes = (dish.verification_notes || "") +
            ` [Macro sum ${Math.round(computed)} vs stated ${Math.round(midCal)} kcal]`;
        }
      }
    }

    console.log("Refinement complete");

    return new Response(
      JSON.stringify({ dishes: refinedDishes }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    if (error?.status === 429) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded. Free tier allows 15 req/min." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    console.error("Refinement error:", error);
    return new Response(
      JSON.stringify({ error: error?.message || "Refinement failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
