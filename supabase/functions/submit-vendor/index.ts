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
    const { name, address, cuisine, userId, menuImageBase64, menuImageMimeType } = await req.json();

    if (!name || !address) {
      return new Response(JSON.stringify({ error: "Name and address are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const PLACES_API_KEY = Deno.env.get("GOOGLE_PLACES_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");

    // Step 1: Verify vendor via Google Places
    let placeData: any = null;
    if (PLACES_API_KEY) {
      try {
        const searchQuery = `${name} ${address} Singapore`;
        const searchRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${PLACES_API_KEY}`
        );
        const searchResult = await searchRes.json();
        const place = searchResult.results?.[0];

        if (place) {
          // Get detailed info
          const detailRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_address,formatted_phone_number,geometry,rating,user_ratings_total,opening_hours,price_level,types,photos,editorial_summary&key=${PLACES_API_KEY}`
          );
          const detailResult = await detailRes.json();
          const details = detailResult.result;

          if (details) {
            // Get photo if available
            let photoUrl = null;
            if (details.photos?.[0]?.photo_reference) {
              photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${details.photos[0].photo_reference}&key=${PLACES_API_KEY}`;
            }

            const priceMap: Record<number, string> = { 0: "$", 1: "$", 2: "$$", 3: "$$$", 4: "$$$" };

            placeData = {
              verified: true,
              place_id: place.place_id,
              lat: details.geometry?.location?.lat,
              lng: details.geometry?.location?.lng,
              rating: details.rating || null,
              review_count: details.user_ratings_total || 0,
              phone: details.formatted_phone_number || null,
              hours: details.opening_hours?.weekday_text?.join(", ") || null,
              price_range: priceMap[details.price_level ?? 1] || "$$",
              image: photoUrl,
              description: details.editorial_summary?.overview || `${name} - healthy food spot in Singapore`,
              address: details.formatted_address || address,
            };
          }
        }
      } catch (e) {
        console.error("Google Places verification failed:", e);
      }
    }

    // Step 2: Insert vendor suggestion with verified data
    const insertData: any = {
      name: name.trim(),
      address: placeData?.address || address.trim(),
      cuisine: cuisine?.trim() || null,
      suggested_by: userId || null,
      status: placeData?.verified ? "approved" : "pending",
      ...(placeData || {}),
    };

    const { data: suggestion, error: insertError } = await supabase
      .from("vendor_suggestions")
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Failed to save vendor" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 3: If menu image provided, analyze it and populate vendor_menu_items
    let menuItems: any[] = [];
    if (menuImageBase64 && GEMINI_API_KEY) {
      try {
        const geminiRes = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GEMINI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-2.5-flash",
              messages: [
                {
                  role: "user",
                  content: [
                    {
                      type: "text",
                      text: `Analyze this menu image for "${name}". Extract ALL dishes with nutrition data. Use the extract_menu function.`,
                    },
                    {
                      type: "image_url",
                      image_url: { url: `data:${menuImageMimeType || "image/jpeg"};base64,${menuImageBase64}` },
                    },
                  ],
                },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "extract_menu",
                    description: "Extract menu items with nutrition",
                    parameters: {
                      type: "object",
                      properties: {
                        items: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              dish_name: { type: "string" },
                              description: { type: "string" },
                              price: { type: "string" },
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
                            required: ["dish_name", "category", "calories_kcal", "protein_g", "carbs_g", "fat_g", "confidence"],
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

        if (geminiRes.ok) {
          const geminiData = await geminiRes.json();
          const toolCall = geminiData.choices?.[0]?.message?.tool_calls?.[0];
          if (toolCall?.function?.arguments) {
            const parsed = JSON.parse(toolCall.function.arguments);
            menuItems = parsed.items || [];
          }
        }
      } catch (e) {
        console.error("Menu image analysis failed:", e);
      }

      // Insert menu items
      if (menuItems.length > 0) {
        const rows = menuItems.map((item: any) => ({
          spot_name: name.trim(),
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
          source: "user_upload",
        }));

        await supabase.from("vendor_menu_items").insert(rows);
      }
    } else if (!menuImageBase64 && GEMINI_API_KEY && placeData?.verified) {
      // No menu image but vendor verified — auto-discover menu
      try {
        const discoverRes = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/discover-vendor-menu`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ spotName: name.trim(), address: address.trim() }),
          }
        );
        if (discoverRes.ok) {
          const discoverData = await discoverRes.json();
          menuItems = discoverData.items || [];
        }
      } catch (e) {
        console.error("Auto-discover menu failed:", e);
      }
    }

    return new Response(
      JSON.stringify({
        vendor: suggestion,
        verified: placeData?.verified || false,
        menuItemsCount: menuItems.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("submit-vendor error:", error);
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
