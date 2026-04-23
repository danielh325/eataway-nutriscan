import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Real menu scraper.
 *
 * Strategy (in order, stop on first success):
 *  1. Firecrawl SEARCH: "<vendor> <area> menu site:foodpanda.sg" + same for grab.com
 *     → take top result URL → scrape it (markdown).
 *  2. If still nothing, Firecrawl SEARCH without site filter, restricted to known
 *     SG delivery domains (foodpanda.sg, food.grab.com, deliveroo.com.sg as legacy).
 *  3. Pass scraped markdown to Gemini with a strict tool-call schema. The model is
 *     told to ONLY include items it can literally see in the text — no invention.
 *  4. If 0 items extracted, we return empty + a `reason`. We DO NOT fall back to
 *     AI generation — caller decides what to show.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FIRECRAWL_V2 = "https://api.firecrawl.dev/v2";
const DELIVERY_DOMAINS = ["foodpanda.sg", "food.grab.com"];

interface ScrapedMenuItem {
  dish_name: string;
  description?: string;
  price?: string;
  category?: string;
  calories_kcal?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fiber_g?: number;
  ingredients?: string[];
  is_popular?: boolean;
  source_url?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { spotName, address, forceRefresh } = await req.json();
    if (!spotName) {
      return jsonResponse({ error: "spotName is required" }, 400);
    }

    const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GOOGLE_GEMINI_API_KEY");
    if (!FIRECRAWL_API_KEY) return jsonResponse({ error: "FIRECRAWL_API_KEY not configured" }, 500);
    if (!GEMINI_API_KEY) return jsonResponse({ error: "GOOGLE_GEMINI_API_KEY not configured" }, 500);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Cache short-circuit: if we have scraped data, return it
    if (!forceRefresh) {
      const { data: existing } = await supabase
        .from("vendor_menu_items")
        .select("*")
        .eq("spot_name", spotName)
        .eq("source", "scraped");
      if (existing && existing.length > 0) {
        return jsonResponse({ items: existing, source: "cached", method: "cache" });
      }
    }

    // ── Step 1: Find a real delivery-app URL for this vendor ─────────────────
    const area = extractArea(address);
    const cleanedName = cleanVendorName(spotName);
    const searchQueries = [
      `${cleanedName} ${area} site:foodpanda.sg`,
      `${cleanedName} ${area} site:food.grab.com`,
      `${cleanedName} singapore menu`,
    ];

    let scrapedMarkdown = "";
    let sourceUrl = "";
    let sourcePlatform = "";

    for (const query of searchQueries) {
      console.log(`[scrape] searching: ${query}`);
      const results = await firecrawlSearch(query.trim(), FIRECRAWL_API_KEY);
      const candidate = pickBestDeliveryUrl(results);
      if (!candidate) continue;

      console.log(`[scrape] scraping: ${candidate}`);
      const md = await firecrawlScrape(candidate, FIRECRAWL_API_KEY);
      if (md && md.length > 300) {
        scrapedMarkdown = md;
        sourceUrl = candidate;
        sourcePlatform = candidate.includes("grab.com")
          ? "grab"
          : candidate.includes("foodpanda")
          ? "foodpanda"
          : "web";
        break;
      }
    }

    if (!scrapedMarkdown) {
      return jsonResponse({
        items: [],
        source: "none",
        reason: "No menu found on delivery platforms",
      });
    }

    // Trim huge pages — keep first ~16k chars (most menu lists fit)
    const trimmedMd = scrapedMarkdown.slice(0, 16000);

    // ── Step 2: Extract structured menu with Gemini (strict, no invention) ──
    const items = await extractMenuFromMarkdown(trimmedMd, spotName, GEMINI_API_KEY);

    if (!items || items.length === 0) {
      return jsonResponse({
        items: [],
        source: "none",
        reason: "Page found but no recognisable menu items extracted",
        sourceUrl,
      });
    }

    // ── Step 3: Persist (replace any existing rows for this vendor) ─────────
    await supabase.from("vendor_menu_items").delete().eq("spot_name", spotName);

    const rows = items.map((item) => ({
      spot_name: spotName,
      dish_name: item.dish_name,
      description: item.description ?? null,
      price: item.price ?? null,
      category: item.category || "Main",
      calories_kcal: Math.round(item.calories_kcal || 0),
      protein_g: Math.round(item.protein_g || 0),
      carbs_g: Math.round(item.carbs_g || 0),
      fat_g: Math.round(item.fat_g || 0),
      fiber_g: Math.round(item.fiber_g || 0),
      confidence: "high", // names + prices are scraped, nutrition still estimated
      ingredients: item.ingredients || [],
      is_popular: item.is_popular || false,
      source: "scraped",
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("vendor_menu_items")
      .insert(rows)
      .select();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonResponse({ error: "Failed to save scraped menu" }, 500);
    }

    return jsonResponse({
      items: inserted,
      source: "scraped",
      method: sourcePlatform,
      sourceUrl,
    });
  } catch (error: any) {
    console.error("scrape-vendor-menu error:", error);
    return jsonResponse({ error: error.message || "Unknown error" }, 500);
  }
});

// ─────────────────────────── helpers ─────────────────────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function cleanVendorName(name: string): string {
  return name
    .replace(/\b(pte\.?\s*ltd\.?|llp|sdn\.?\s*bhd\.?|inc\.?|co\.?)\b/gi, "")
    .replace(/\bsingapore\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractArea(address?: string): string {
  if (!address) return "";
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const withPostcode = parts.find((p) => /\b\d{6}\b/.test(p));
  return withPostcode || parts[parts.length - 1] || "";
}

interface FirecrawlSearchResult {
  url?: string;
  title?: string;
  description?: string;
}

async function firecrawlSearch(
  query: string,
  apiKey: string,
): Promise<FirecrawlSearchResult[]> {
  try {
    const res = await fetch(`${FIRECRAWL_V2}/search`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 5,
        country: "sg",
      }),
    });
    if (!res.ok) {
      console.warn("Firecrawl search failed:", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    // v2 returns { success, data: { web: [...] } } typically
    const web = data?.data?.web || data?.web || data?.data || [];
    return Array.isArray(web) ? web : [];
  } catch (e) {
    console.warn("Firecrawl search error:", e);
    return [];
  }
}

function pickBestDeliveryUrl(results: FirecrawlSearchResult[]): string | null {
  for (const r of results) {
    const url = r.url || "";
    if (DELIVERY_DOMAINS.some((d) => url.includes(d))) return url;
  }
  // Fallback: first non-empty url that isn't an aggregator/blog
  for (const r of results) {
    const url = r.url || "";
    if (url && !/wikipedia|tripadvisor|reddit|youtube|facebook/i.test(url)) return url;
  }
  return null;
}

async function firecrawlScrape(url: string, apiKey: string): Promise<string> {
  try {
    const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        waitFor: 1500,
      }),
    });
    if (!res.ok) {
      console.warn("Firecrawl scrape failed:", res.status, await res.text());
      return "";
    }
    const data = await res.json();
    return data?.data?.markdown || data?.markdown || "";
  } catch (e) {
    console.warn("Firecrawl scrape error:", e);
    return "";
  }
}

async function extractMenuFromMarkdown(
  markdown: string,
  vendorName: string,
  geminiApiKey: string,
): Promise<ScrapedMenuItem[]> {
  const prompt = `You are extracting a menu from a real restaurant page that was just scraped from a food delivery website.

Restaurant: ${vendorName}

SCRAPED PAGE CONTENT (markdown):
---
${markdown}
---

STRICT RULES:
1. ONLY include menu items that literally appear in the scraped content above. DO NOT invent items.
2. If a price appears next to the dish name, capture it exactly (e.g. "$8.90", "S$12.50").
3. If no price is visible for an item, leave the price field empty/null — do NOT guess.
4. Estimate nutrition (calories/protein/carbs/fat) using realistic Singapore portion sizes for that dish type. Nutrition is the only field you may estimate.
5. Mark an item as is_popular: true ONLY if the page explicitly tags it (e.g. "Popular", "Best seller", "Chef's pick"). Otherwise false.
6. Pick a reasonable category from: Main, Side, Drink, Dessert, Snack, Bowl, Wrap, Salad.
7. If the scraped page clearly has no menu items (e.g. it's a search results page or a 404), return an empty list.

Use the extract_scraped_menu function.`;

  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${geminiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_scraped_menu",
              description:
                "Extract menu items literally present in the scraped page content. Do not invent.",
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
                        category: {
                          type: "string",
                          enum: [
                            "Main",
                            "Side",
                            "Drink",
                            "Dessert",
                            "Snack",
                            "Bowl",
                            "Wrap",
                            "Salad",
                          ],
                        },
                        calories_kcal: { type: "number" },
                        protein_g: { type: "number" },
                        carbs_g: { type: "number" },
                        fat_g: { type: "number" },
                        fiber_g: { type: "number" },
                        ingredients: { type: "array", items: { type: "string" } },
                        is_popular: { type: "boolean" },
                      },
                      required: ["dish_name", "category", "calories_kcal"],
                    },
                  },
                },
                required: ["items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_scraped_menu" } },
      }),
    },
  );

  if (!res.ok) {
    console.warn("Gemini extract failed:", res.status, await res.text());
    return [];
  }

  const data = await res.json();
  try {
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) return [];
    const parsed = JSON.parse(toolCall.function.arguments);
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch (e) {
    console.warn("Failed to parse Gemini extraction:", e);
    return [];
  }
}
