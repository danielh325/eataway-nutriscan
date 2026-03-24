import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vendorName, menuItems, cuisine, description } = await req.json();

    if (!menuItems || !Array.isArray(menuItems) || menuItems.length === 0) {
      return new Response(
        JSON.stringify({ error: "menuItems array is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const systemPrompt = `You are a professional nutritionist with expertise in Singapore's food scene. Given a vendor's menu items, provide accurate nutrition estimates for each dish.

Context about the vendor:
- Name: ${vendorName || "Unknown"}
- Cuisine: ${cuisine || "Unknown"}
- Description: ${description || "No description"}

IMPORTANT RULES:
1. Use your knowledge of typical Singapore restaurant portions
2. Consider the cuisine type for accurate estimates
3. Provide realistic ranges — don't guess wildly
4. Include key ingredients for each dish
5. Rate confidence: "high" (well-known standard dish), "medium" (some variation expected), "low" (highly variable)`;

    const userPrompt = `Analyze these menu items and provide nutrition data for EACH one. Menu items:
${menuItems.map((item: string, i: number) => `${i + 1}. ${item}`).join("\n")}

You MUST use the analyze_nutrition tool to return your results.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_nutrition",
              description: "Return nutrition analysis for all menu items",
              parameters: {
                type: "object",
                properties: {
                  dishes: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        dish: { type: "string", description: "Dish name" },
                        nutrition: {
                          type: "object",
                          properties: {
                            calories_kcal: { type: "number" },
                            protein_g: { type: "number" },
                            carbs_g: { type: "number" },
                            fat_g: { type: "number" },
                          },
                          required: ["calories_kcal", "protein_g", "carbs_g", "fat_g"],
                        },
                        confidence: {
                          type: "string",
                          enum: ["high", "medium", "low"],
                        },
                        ingredients_detected: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: ["dish", "nutrition", "confidence"],
                    },
                  },
                },
                required: ["dishes"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_nutrition" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);

      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait a moment and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      throw new Error("No tool call response from AI");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error analyzing vendor nutrition:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
