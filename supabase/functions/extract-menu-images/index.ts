import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * This function takes a menu image and a list of analyzed dish names,
 * identifies all food photographs visible in the menu, and matches
 * each photo to the most likely dish from the analysis.
 * 
 * For each matched photo, it uses the image editing model to crop
 * and enhance just the food portion.
 */

const IDENTIFY_PROMPT = `You are analyzing a restaurant menu image to find food photographs.

Look at this menu image carefully. Your job is to:
1. Find ALL food photographs/images visible in the menu (not logos, decorations, or backgrounds)
2. For each food photo, describe what food is shown
3. Match each food photo to the most likely dish from the provided dish list
4. Describe the exact location of each food photo in the menu image (e.g. "top left corner", "next to the third item", "center of the page")

IMPORTANT: 
- Only identify ACTUAL food photographs, not text or decorative elements
- A food photo might not be directly next to its matching dish name
- Use your food knowledge to match photos to dishes even if they're far apart on the menu
- If you can't confidently match a photo to any dish, still include it with your best guess
- If there are NO food photographs in the menu, return an empty array

Return a JSON array of matches:
[
  {
    "food_description": "A grilled chicken breast with vegetables and rice",
    "location_in_menu": "top right section, next to appetizers",
    "matched_dish_name": "Grilled Chicken Plate",
    "match_confidence": 0.85
  }
]

ONLY return the JSON array, nothing else.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, mimeType, dish_names } = await req.json();

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

    console.log("Identifying food images in menu for", dish_names?.length || 0, "dishes");

    // Step 1: Use Gemini to identify food photos and match them to dishes
    const identifyResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${IDENTIFY_PROMPT}\n\nHere are the dish names from the menu analysis:\n${(dish_names || []).map((n: string, i: number) => `${i + 1}. ${n}`).join("\n")}`,
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

    if (!identifyResponse.ok) {
      const errText = await identifyResponse.text();
      console.error("Identify step failed:", identifyResponse.status, errText);
      return new Response(
        JSON.stringify({ matches: [], error: "Failed to identify food images" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const identifyData = await identifyResponse.json();
    const rawContent = identifyData.choices?.[0]?.message?.content || "[]";

    let matches: any[] = [];
    try {
      let jsonStr = rawContent.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      matches = JSON.parse(jsonStr);
      if (!Array.isArray(matches)) matches = [];
    } catch (e) {
      console.error("Failed to parse food image matches:", e, rawContent);
      return new Response(
        JSON.stringify({ matches: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${matches.length} food images in menu`);

    if (matches.length === 0) {
      return new Response(
        JSON.stringify({ matches: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: For each matched food photo, use the image model to crop/enhance it
    const results: Array<{
      dish_name: string;
      image_url: string;
      food_description: string;
      match_confidence: number;
    }> = [];

    for (const match of matches) {
      if (!match.matched_dish_name) continue;

      try {
        console.log(`Cropping/enhancing image for: ${match.matched_dish_name}`);

        const cropPrompt = `Look at this restaurant menu image. There is a food photograph located at: "${match.location_in_menu}". The food shown is: "${match.food_description}".

Extract ONLY that food photograph from the menu. Crop it tightly around just the food, removing any menu text, borders, prices, or decorative elements. Enhance the image to look like professional food photography - improve lighting, color saturation, and clarity. The result should look like a clean, appetizing food photo on a clean background.`;

        const cropResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: cropPrompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}`,
                    },
                  },
                ],
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (!cropResponse.ok) {
          if (cropResponse.status === 429) {
            console.warn(`Rate limited while cropping ${match.matched_dish_name}, waiting...`);
            await new Promise(r => setTimeout(r, 5000));
            continue;
          }
          console.warn(`Crop failed for ${match.matched_dish_name}:`, cropResponse.status);
          continue;
        }

        const cropData = await cropResponse.json();
        const imageUrl = cropData.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (imageUrl) {
          results.push({
            dish_name: match.matched_dish_name,
            image_url: imageUrl,
            food_description: match.food_description,
            match_confidence: match.match_confidence || 0.5,
          });
          console.log(`Successfully extracted image for: ${match.matched_dish_name}`);
        }

        // Small delay between image extractions to avoid rate limits
        await new Promise(r => setTimeout(r, 2000));
      } catch (err) {
        console.warn(`Error processing image for ${match.matched_dish_name}:`, err);
      }
    }

    console.log(`Successfully extracted ${results.length}/${matches.length} food images`);

    return new Response(
      JSON.stringify({ matches: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error extracting menu images:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", matches: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
