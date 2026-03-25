import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Identifies food photographs in a menu image and matches them to dishes.
 * Returns the original menu image as the dish image (no expensive cropping).
 */

const IDENTIFY_PROMPT = `You are analyzing a restaurant menu image to find food photographs.

Look at this menu image carefully. Your job is to:
1. Find ALL food photographs/images visible in the menu (not logos, decorations, or backgrounds)
2. For each food photo, describe what food is shown
3. Match each food photo to the most likely dish from the provided dish list

IMPORTANT: 
- Only identify ACTUAL food photographs, not text or decorative elements
- Use your food knowledge to match photos to dishes even if they're far apart on the menu
- If you can't confidently match a photo to any dish, still include it with your best guess
- If there are NO food photographs in the menu, return an empty array

Return a JSON array of matches:
[
  {
    "food_description": "A grilled chicken breast with vegetables and rice",
    "matched_dish_name": "Grilled Chicken Plate",
    "match_confidence": 0.85
  }
]

ONLY return the JSON array, nothing else.`;

async function safeJsonFromResponse(response: Response): Promise<any | null> {
  const raw = await response.text();
  if (!raw?.trim()) return null;

  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse identify response JSON:", e, raw.slice(0, 300));
    return null;
  }
}

function extractContentText(content: any): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part: any) => (typeof part === "string" ? part : part?.text || "")).join("\n");
  }
  return "";
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
      console.error("Failed to parse extract-menu-images request:", parseErr);
      return new Response(
        JSON.stringify({ matches: [], error: "Invalid request payload" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { imageBase64, mimeType, dish_names } = body;

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

    // Single AI call: identify food photos and match to dishes (no cropping)
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

      const errorMsg = identifyResponse.status === 402
        ? "AI credits exhausted"
        : identifyResponse.status === 429
          ? "Rate limit exceeded"
          : "Failed to identify food images";

      return new Response(
        JSON.stringify({ matches: [], error: errorMsg }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const identifyData = await safeJsonFromResponse(identifyResponse);
    if (!identifyData) {
      return new Response(
        JSON.stringify({ matches: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawContent = extractContentText(identifyData.choices?.[0]?.message?.content) || "[]";

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

    // Return matches with the original menu image as the image_url
    // No expensive per-dish cropping — use the menu photo directly
    const menuDataUrl = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;
    const results = matches
      .filter((m: any) => m.matched_dish_name)
      .map((m: any) => ({
        dish_name: m.matched_dish_name,
        image_url: menuDataUrl,
        food_description: m.food_description,
        match_confidence: m.match_confidence || 0.5,
      }));

    console.log(`Returning ${results.length} matched dishes (using menu image directly)`);

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
