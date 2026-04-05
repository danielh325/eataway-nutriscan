import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const IDENTIFY_PROMPT = `You are analyzing a restaurant menu image to find food photographs and match them to dishes.

Look at this menu image carefully. Your job is to:
1. Find ALL food photographs/images visible in the menu (not logos, decorations, or backgrounds)
2. For each food photo, describe what food is shown
3. Match each food photo to the most likely dish from the provided dish list
4. Provide a bounding box for each food photo as percentage coordinates (0-100) relative to the full image

IMPORTANT:
- Only identify ACTUAL food photographs, not text or decorative elements
- Use your food knowledge to match photos to dishes even if they're far apart on the menu
- The bounding box should tightly crop just the food photo
- x and y are the TOP-LEFT corner of the bounding box as percentages
- width and height are the size of the bounding box as percentages
- If there are NO food photographs in the menu, return an empty array

Return a JSON array of matches:
[
  {
    "food_description": "A grilled chicken breast with vegetables and rice",
    "matched_dish_name": "Grilled Chicken Plate",
    "match_confidence": 0.85,
    "bbox": { "x": 10, "y": 25, "width": 30, "height": 20 }
  }
]

ONLY return the JSON array, nothing else.`;

async function safeJsonFromResponse(response: Response): Promise<any | null> {
  const raw = await response.text();
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("Failed to parse response JSON:", e, raw.slice(0, 300));
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
      console.error("Failed to parse request:", parseErr);
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

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Identifying food images in menu for", dish_names?.length || 0, "dishes using Gemini 3 Flash Preview");

    const identifyResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-3-flash-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${IDENTIFY_PROMPT}\n\nDish names:\n${(dish_names || []).map((n: string, i: number) => `${i + 1}. ${n}`).join("\n")}`,
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

    const menuDataUrl = `data:${mimeType || "image/jpeg"};base64,${imageBase64}`;
    const results = matches
      .filter((m: any) => m.matched_dish_name)
      .map((m: any) => ({
        dish_name: m.matched_dish_name,
        image_url: menuDataUrl,
        food_description: m.food_description,
        match_confidence: m.match_confidence || 0.5,
        bbox: m.bbox && typeof m.bbox.x === "number" ? {
          x: Math.max(0, Math.min(100, m.bbox.x)),
          y: Math.max(0, Math.min(100, m.bbox.y)),
          width: Math.max(5, Math.min(100, m.bbox.width)),
          height: Math.max(5, Math.min(100, m.bbox.height)),
        } : null,
      }));

    console.log(`Returning ${results.length} matched dishes with bounding boxes`);

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
