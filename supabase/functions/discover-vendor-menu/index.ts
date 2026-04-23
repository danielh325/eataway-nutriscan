import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { spotName, address, menuHighlights, forceRefresh } = await req.json();

    if (!spotName) {
      return new Response(JSON.stringify({ error: "spotName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Check if we already have menu items for this vendor
    if (!forceRefresh) {
      const { data: existing } = await supabase
        .from("vendor_menu_items")
        .select("*")
        .eq("spot_name", spotName);

      if (existing && existing.length > 0) {
        return new Response(JSON.stringify({ items: existing, source: "cached" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    const PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");

    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GOOGLE_GEMINI_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: Try to find menu info via Google Places
    let placesMenuText = "";
    if (PLACES_API_KEY) {
      try {
        const searchQuery = `${spotName} ${address || "Singapore"} menu`;
        const searchRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${PLACES_API_KEY}`
        );
        const searchData = await searchRes.json();
        const place = searchData.results?.[0];

        if (place?.place_id) {
          const detailRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,editorial_summary,reviews,price_level,types&key=${PLACES_API_KEY}`
          );
          const detailData = await detailRes.json();
          const details = detailData.result;

          if (details) {
            const reviewTexts = (details.reviews || [])
              .slice(0, 5)
              .map((r: any) => r.text)
              .filter(Boolean)
              .join("\n");
            placesMenuText = `
Restaurant: ${details.name || spotName}
${details.editorial_summary?.overview ? `Summary: ${details.editorial_summary.overview}` : ""}
Price Level: ${details.price_level ?? "unknown"} (0=free, 4=very expensive)
Reviews mentioning food:
${reviewTexts}
`;
          }
        }
      } catch (e) {
        console.error("Google Places lookup failed:", e);
      }
    }

    // Step 2: Use Gemini to research and generate full menu with nutrition
    const menuHighlightsText = menuHighlights?.length
      ? `Known menu items: ${menuHighlights.join(", ")}`
      : "";

    const prompt = `You are a nutrition analyst for a food delivery app like Grab or Uber Eats.

Research and generate a COMPLETE menu for this restaurant with accurate nutritional information.

Restaurant: ${spotName}
Address: ${address || "Singapore"}
${menuHighlightsText}

${placesMenuText ? `Google Places data:\n${placesMenuText}` : ""}

INSTRUCTIONS:
1. Generate 8-20 menu items that this restaurant would realistically serve
2. Include a mix of categories: Mains, Sides, Drinks, Desserts
3. For each item provide realistic Singapore pricing in SGD
4. Estimate nutrition using standard portion sizes and cooking methods
5. Mark 2-4 items as "popular" (best sellers)
6. Include a brief description for each item

Use the extract_menu function to return the data.`;

    // Try primary model, fall back to alternate model on overload (503/429)
    const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    const callGemini = async (model: string) => {
      return await fetch(
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${GEMINI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            tools: [
              {
                type: "function",
                function: {
                  name: "extract_menu",
                  description: "Extract structured menu items with nutrition data",
                  parameters: {
                    type: "object",
                    properties: {
                      items: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            dish_name: { type: "string" },
                            description: { type: "string", description: "Short 1-line description" },
                            price: { type: "string", description: "Price in SGD like '$8.90' or '$12.50'" },
                            category: { type: "string", enum: ["Main", "Side", "Drink", "Dessert", "Snack", "Bowl", "Wrap", "Salad"] },
                            calories_kcal: { type: "number" },
                            protein_g: { type: "number" },
                            carbs_g: { type: "number" },
                            fat_g: { type: "number" },
                            fiber_g: { type: "number" },
                            confidence: { type: "string", enum: ["high", "medium", "low"] },
                            ingredients: { type: "array", items: { type: "string" } },
                            is_popular: { type: "boolean" },
                          },
                          required: ["dish_name", "description", "price", "category", "calories_kcal", "protein_g", "carbs_g", "fat_g", "confidence"],
                        },
                      },
                    },
                    required: ["items"],
                  },
                },
              },
            ],
            tool_choice: { type: "function", function: { name: "extract_menu" } },
          }),
        }
      );
    };

    let geminiRes: Response | null = null;
    let lastErrText = "";
    let lastStatus = 0;

    outer: for (const model of MODELS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const res = await callGemini(model);
        if (res.ok) {
          geminiRes = res;
          break outer;
        }
        lastStatus = res.status;
        lastErrText = await res.text();
        console.error(`Gemini error [${model} attempt ${attempt + 1}]:`, res.status, lastErrText);
        // Only retry/fallback on transient errors
        if (res.status !== 503 && res.status !== 429 && res.status !== 500) break outer;
        if (attempt === 0) await sleep(1500); // brief backoff before second attempt
      }
    }

    if (!geminiRes) {
      // Return 200 with fallback flag so the frontend doesn't crash
      const isOverload = lastStatus === 503 || lastStatus === 429;
      return new Response(
        JSON.stringify({
          error: isOverload
            ? "AI is experiencing high demand. Please try again in a moment."
            : `AI analysis failed (${lastStatus})`,
          fallback: true,
          status: lastStatus,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }


    const geminiData = await geminiRes.json();
    let menuItems: any[] = [];

    try {
      const toolCall = geminiData.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        const parsed = JSON.parse(toolCall.function.arguments);
        menuItems = parsed.items || [];
      }
    } catch (e) {
      console.error("Failed to parse Gemini response:", e);
      return new Response(JSON.stringify({ error: "Failed to parse menu data" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (menuItems.length === 0) {
      return new Response(JSON.stringify({ error: "No menu items found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete old entries if refreshing
    if (forceRefresh) {
      await supabase.from("vendor_menu_items").delete().eq("spot_name", spotName);
    }

    // Insert into DB
    const rows = menuItems.map((item: any) => ({
      spot_name: spotName,
      dish_name: item.dish_name,
      description: item.description || null,
      price: item.price || null,
      category: item.category || "Main",
      calories_kcal: Math.round(item.calories_kcal || 0),
      protein_g: Math.round(item.protein_g || 0),
      carbs_g: Math.round(item.carbs_g || 0),
      fat_g: Math.round(item.fat_g || 0),
      fiber_g: Math.round(item.fiber_g || 0),
      confidence: item.confidence || "medium",
      ingredients: item.ingredients || [],
      is_popular: item.is_popular || false,
      source: "auto",
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("vendor_menu_items")
      .insert(rows)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save menu items" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ items: inserted, source: "fresh" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("discover-vendor-menu error:", error);
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
