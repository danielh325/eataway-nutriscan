import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_429_RETRIES = 2;
const RETRY_BASE_MS = 700;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const buildFallbackImage = (dishName: string, reason: string) => {
  const safeDish = (dishName || "Dish").replace(/[<>]/g, "").slice(0, 40);
  const label = reason === "credits_exhausted" ? "AI credits exhausted" : "Using fallback image";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="1024" height="768" viewBox="0 0 1024 768">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f8f3ea"/>
          <stop offset="100%" stop-color="#e7dccb"/>
        </linearGradient>
      </defs>
      <rect width="1024" height="768" fill="url(#g)"/>
      <circle cx="820" cy="120" r="160" fill="#d3bfa2" opacity="0.22"/>
      <circle cx="210" cy="640" r="210" fill="#b8926a" opacity="0.16"/>
      <text x="512" y="340" text-anchor="middle" font-size="58" font-family="system-ui, -apple-system, Segoe UI, sans-serif" fill="#3f2f1d" font-weight="700">${safeDish}</text>
      <text x="512" y="396" text-anchor="middle" font-size="28" font-family="system-ui, -apple-system, Segoe UI, sans-serif" fill="#5f4b35">${label}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let payload: { dish_name?: string; cooking_method?: string; ingredients?: string[] };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400);
    }

    const { dish_name, cooking_method, ingredients } = payload;

    if (!dish_name) {
      return jsonResponse({ error: "No dish name provided" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return jsonResponse({
        image_url: buildFallbackImage(dish_name, "service_unavailable"),
        source: "fallback",
        reason: "service_unavailable",
      });
    }

    const safeIngredients = Array.isArray(ingredients) ? ingredients : [];
    const ingredientList = safeIngredients.length > 0 ? ` with ${safeIngredients.slice(0, 5).join(", ")}` : "";
    const method = cooking_method ? ` ${cooking_method}` : "";
    const prompt = `A professional food photography shot of${method} ${dish_name}${ingredientList}. Beautifully plated on a restaurant plate, soft natural lighting, shallow depth of field, appetizing and realistic, top-down or 45 degree angle, clean background.`;

    console.log("Generating dish image for:", dish_name);

    for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;

        if (imageUrl) {
          console.log("Successfully generated image for:", dish_name);
          return jsonResponse({ image_url: imageUrl, source: "ai" });
        }

        return jsonResponse({
          image_url: buildFallbackImage(dish_name, "invalid_ai_response"),
          source: "fallback",
          reason: "invalid_ai_response",
        });
      }

      if (response.status === 402) {
        return jsonResponse({
          image_url: buildFallbackImage(dish_name, "credits_exhausted"),
          source: "fallback",
          reason: "credits_exhausted",
        });
      }

      if (response.status === 429) {
        if (attempt < MAX_429_RETRIES) {
          const waitMs = RETRY_BASE_MS * (attempt + 1) + Math.floor(Math.random() * 250);
          await sleep(waitMs);
          continue;
        }

        return jsonResponse({
          image_url: buildFallbackImage(dish_name, "rate_limited"),
          source: "fallback",
          reason: "rate_limited",
        });
      }

      const errorText = await response.text();
      console.error("Image generation error:", response.status, errorText);
      return jsonResponse({
        image_url: buildFallbackImage(dish_name, "upstream_error"),
        source: "fallback",
        reason: "upstream_error",
      });
    }

    return jsonResponse({
      image_url: buildFallbackImage(dish_name, "unknown_error"),
      source: "fallback",
      reason: "unknown_error",
    });
  } catch (error) {
    console.error("Error generating dish image:", error);
    const safeDishName = "Dish";
    return jsonResponse({
      image_url: buildFallbackImage(safeDishName, "internal_error"),
      source: "fallback",
      reason: error instanceof Error ? error.message : "internal_error",
    });
  }
});
