import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROMPT = `You are verifying whether a cropped food photo matches a specific dish name from a restaurant menu.

You will receive:
1. A cropped image (purportedly a photo of a dish)
2. The dish name it was assigned to
3. A list of OTHER dish names from the same menu (candidates if the assignment is wrong)

Your job:
- Decide if the cropped image actually shows the assigned dish
- If not, suggest the best matching dish from the other candidates (or null if none match)
- Provide a confidence score 0-1

Respond ONLY in JSON:
{
  "matches": true|false,
  "confidence": 0.0-1.0,
  "reasoning": "short explanation",
  "suggested_dish": "name from candidates" | null,
  "is_food_photo": true|false
}

Rules:
- If the image is not actually a food photograph (logo, decoration, text), set is_food_photo=false and matches=false.
- Be strict: only confirm a match when the visible dish clearly corresponds to the name.
- Use cuisine knowledge (e.g. "Pad Thai" looks different from "Green Curry").`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { imageBase64, mimeType, dish_name, candidate_dishes } = body || {};

    if (!imageBase64 || !dish_name) {
      return new Response(
        JSON.stringify({ error: "imageBase64 and dish_name required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userText = `${PROMPT}\n\nAssigned dish name: "${dish_name}"\n\nOther candidate dishes from this menu:\n${(candidate_dishes || []).map((n: string, i: number) => `${i + 1}. ${n}`).join("\n") || "(none)"}`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
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
                { type: "text", text: userText },
                {
                  type: "image_url",
                  image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` },
                },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("verify-dish-photo gemini error", response.status, t);
      const msg =
        response.status === 402
          ? "AI credits exhausted"
          : response.status === 429
            ? "Rate limit exceeded"
            : "Verification failed";
      return new Response(
        JSON.stringify({ error: msg }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    let raw = data?.choices?.[0]?.message?.content || "";
    if (Array.isArray(raw)) raw = raw.map((p: any) => p?.text || "").join("");
    raw = String(raw).trim();
    if (raw.startsWith("```")) raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");

    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn("verify-dish-photo: bad JSON", raw.slice(0, 200));
      return new Response(
        JSON.stringify({ matches: false, confidence: 0, reasoning: "parse_error", suggested_dish: null, is_food_photo: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        matches: !!parsed.matches,
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        reasoning: parsed.reasoning || "",
        suggested_dish: parsed.suggested_dish || null,
        is_food_photo: parsed.is_food_photo !== false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("verify-dish-photo error", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
