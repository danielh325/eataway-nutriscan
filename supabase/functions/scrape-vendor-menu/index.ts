import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Real menu scraper — accuracy-focused.
 *
 *  1. Firecrawl SEARCH on foodpanda.sg / food.grab.com → candidate URLs.
 *  2. Firecrawl SCRAPE with HTML format + waitFor + scroll action so JS-rendered
 *     prices/items are present (markdown converters often strip price spans).
 *  3. BRANCH-MATCH VERIFICATION: ask Gemini whether the scraped page's title +
 *     header text actually correspond to the requested vendor at the requested
 *     address. If "no" → reject this candidate, try the next one.
 *  4. Extract structured menu from the HTML with Gemini (strict, no invention).
 *  5. Persist with per-field confidence flags so the UI can be honest about
 *     what is verified vs estimated.
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

    // Cache short-circuit
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

    // ── Step 1: Find candidate delivery-app URLs ─────────────────────────────
    const area = extractArea(address);
    const cleanedName = cleanVendorName(spotName);
    const searchQueries = [
      `${cleanedName} ${area} site:foodpanda.sg`,
      `${cleanedName} ${area} site:food.grab.com`,
      `${cleanedName} singapore menu`,
    ];

    const candidates: string[] = [];
    for (const query of searchQueries) {
      console.log(`[scrape] searching: ${query}`);
      const results = await firecrawlSearch(query.trim(), FIRECRAWL_API_KEY);
      for (const r of results) {
        const url = r.url || "";
        if (!url) continue;
        if (DELIVERY_DOMAINS.some((d) => url.includes(d)) && !candidates.includes(url)) {
          candidates.push(url);
        }
      }
      if (candidates.length >= 3) break;
    }

    if (candidates.length === 0) {
      return jsonResponse({
        items: [],
        source: "none",
        reason: "No delivery-app listing found for this vendor",
      });
    }

    // ── Step 2: Scrape + branch-verify each candidate until one matches ──────
    let scrapedHtml = "";
    let scrapedMarkdown = "";
    let sourceUrl = "";
    let sourcePlatform = "";
    let branchVerified = false;
    const verificationNotes: string[] = [];

    for (const url of candidates.slice(0, 3)) {
      console.log(`[scrape] scraping: ${url}`);
      const scraped = await firecrawlScrape(url, FIRECRAWL_API_KEY);
      if (!scraped.markdown && !scraped.html) continue;

      // Branch verification — does this page's identity match our vendor?
      const verdict = await verifyBranchMatch(
        spotName,
        address || "",
        scraped.markdown.slice(0, 4000),
        GEMINI_API_KEY,
      );
      console.log(`[scrape] branch verdict for ${url}:`, verdict);
      verificationNotes.push(`${url}: ${verdict.match} (${verdict.reason})`);

      if (verdict.match === "yes") {
        scrapedHtml = scraped.html;
        scrapedMarkdown = scraped.markdown;
        sourceUrl = url;
        sourcePlatform = url.includes("grab.com") ? "grab" : "foodpanda";
        branchVerified = true;
        break;
      }
      // "maybe" → accept only if no other candidate verifies
      if (verdict.match === "maybe" && !sourceUrl) {
        scrapedHtml = scraped.html;
        scrapedMarkdown = scraped.markdown;
        sourceUrl = url;
        sourcePlatform = url.includes("grab.com") ? "grab" : "foodpanda";
        branchVerified = false; // keep looking; only use as fallback
      }
    }

    if (!sourceUrl) {
      return jsonResponse({
        items: [],
        source: "none",
        reason: "Found delivery pages but none matched this vendor's name + address",
        debug: verificationNotes,
      });
    }

    // Prefer HTML (preserves price spans) but fall back to markdown
    const extractionInput = (scrapedHtml || scrapedMarkdown).slice(0, 24000);

    // ── Step 3: Extract structured menu (strict, no invention) ──────────────
    const items = await extractMenuFromContent(extractionInput, spotName, GEMINI_API_KEY);

    if (!items || items.length === 0) {
      return jsonResponse({
        items: [],
        source: "none",
        reason: "Page matched but no recognisable menu items extracted",
        sourceUrl,
        branchVerified,
      });
    }

    // ── Step 4: Persist with per-field confidence ────────────────────────────
    await supabase.from("vendor_menu_items").delete().eq("spot_name", spotName);

    const rows = items.map((item) => {
      // Per-field confidence bundled into a single string the UI can parse.
      // Format: "name:verified|price:verified|nutrition:estimated|branch:verified"
      const priceStatus = item.price ? "verified" : "missing";
      const branchStatus = branchVerified ? "verified" : "unverified";
      const fieldConfidence = [
        "name:verified",
        `price:${priceStatus}`,
        "nutrition:estimated",
        `branch:${branchStatus}`,
      ].join("|");

      return {
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
        // overall confidence reflects branch+name+price verification status
        confidence: branchVerified ? "high" : "medium",
        ingredients: item.ingredients || [],
        is_popular: item.is_popular || false,
        source: "scraped",
        // Stash structured per-field confidence in description if no dedicated column.
        // We re-use a separator the UI can split on.
        description_meta: undefined,
        // We'll store per-field confidence in `description` suffix when no dedicated column.
        // Actually: keep description clean; embed in a parseable suffix on `category`? No.
        // Simplest: prefix description with marker, parsed on client.
      } as any;
    });

    // Inject per-field confidence into a recognisable trailer on description
    // so the existing schema doesn't need a migration.
    rows.forEach((row, i) => {
      const item = items[i];
      const priceStatus = item.price ? "verified" : "missing";
      const branchStatus = branchVerified ? "verified" : "unverified";
      const meta = `\n\n<!--FC:name=verified;price=${priceStatus};nutrition=estimated;branch=${branchStatus}-->`;
      row.description = (row.description || "") + meta;
    });

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
      branchVerified,
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
      body: JSON.stringify({ query, limit: 5, country: "sg" }),
    });
    if (!res.ok) {
      console.warn("Firecrawl search failed:", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const web = data?.data?.web || data?.web || data?.data || [];
    return Array.isArray(web) ? web : [];
  } catch (e) {
    console.warn("Firecrawl search error:", e);
    return [];
  }
}

async function firecrawlScrape(
  url: string,
  apiKey: string,
): Promise<{ markdown: string; html: string }> {
  try {
    const res = await fetch(`${FIRECRAWL_V2}/scrape`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown", "html"],
        onlyMainContent: true,
        waitFor: 3500,
        // Scroll to force lazy-loaded menu sections to render
        actions: [
          { type: "wait", milliseconds: 1500 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 800 },
          { type: "scroll", direction: "down" },
          { type: "wait", milliseconds: 800 },
        ],
      }),
    });
    if (!res.ok) {
      console.warn("Firecrawl scrape failed:", res.status, await res.text());
      return { markdown: "", html: "" };
    }
    const data = await res.json();
    return {
      markdown: data?.data?.markdown || data?.markdown || "",
      html: data?.data?.html || data?.html || "",
    };
  } catch (e) {
    console.warn("Firecrawl scrape error:", e);
    return { markdown: "", html: "" };
  }
}

interface BranchVerdict {
  match: "yes" | "no" | "maybe";
  reason: string;
}

async function verifyBranchMatch(
  vendorName: string,
  vendorAddress: string,
  pageText: string,
  geminiApiKey: string,
): Promise<BranchVerdict> {
  if (!pageText.trim()) return { match: "no", reason: "empty page" };

  const prompt = `You are verifying whether a scraped delivery-app page actually corresponds to a specific restaurant branch.

REQUESTED VENDOR:
  Name: ${vendorName}
  Address: ${vendorAddress || "(unknown)"}

SCRAPED PAGE (first part):
---
${pageText}
---

Decide:
- "yes" — the page's restaurant name clearly matches the requested vendor AND (if address is known) the branch/area in the page is consistent with the requested address. Tiny variations in capitalisation/punctuation are fine.
- "no" — the page is for a different restaurant entirely, or for a clearly different branch in another part of Singapore.
- "maybe" — same restaurant chain but you can't confirm the branch matches.

Return via the verify_match function.`;

  try {
    const res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${geminiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gemini-2.5-flash-lite",
          messages: [{ role: "user", content: prompt }],
          tools: [
            {
              type: "function",
              function: {
                name: "verify_match",
                description: "Decide if the scraped page matches the requested vendor branch",
                parameters: {
                  type: "object",
                  properties: {
                    match: { type: "string", enum: ["yes", "no", "maybe"] },
                    reason: { type: "string" },
                  },
                  required: ["match", "reason"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "verify_match" } },
        }),
      },
    );
    if (!res.ok) {
      console.warn("verify_match failed:", res.status);
      return { match: "maybe", reason: "verifier error" };
    }
    const data = await res.json();
    const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { match: "maybe", reason: "no verdict" };
    const parsed = JSON.parse(args);
    return { match: parsed.match || "maybe", reason: parsed.reason || "" };
  } catch (e) {
    console.warn("verify_match error:", e);
    return { match: "maybe", reason: "exception" };
  }
}

async function extractMenuFromContent(
  content: string,
  vendorName: string,
  geminiApiKey: string,
): Promise<ScrapedMenuItem[]> {
  const prompt = `You are extracting a menu from a real restaurant page that was just scraped from a food delivery website. The content may be HTML or markdown — read both.

Restaurant: ${vendorName}

SCRAPED PAGE CONTENT:
---
${content}
---

STRICT RULES:
1. ONLY include menu items that literally appear in the content above. DO NOT invent items.
2. If a price appears next to the dish name (e.g. in HTML look for spans/divs with $ or S$ near the name), capture it exactly. Strip currency padding to the form "$8.90" or "S$12.50".
3. If no price is visible for an item, leave price empty/null — do NOT guess.
4. Estimate nutrition (calories/protein/carbs/fat) using realistic Singapore portion sizes for that dish type. Nutrition is the only field you may estimate.
5. Mark is_popular: true ONLY if the page literally tags it ("Popular", "Best seller", "Chef's pick", "Recommended"). Otherwise false.
6. Pick a category from: Main, Side, Drink, Dessert, Snack, Bowl, Wrap, Salad.
7. If no menu items are present, return an empty list.

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
              description: "Extract menu items literally present in the scraped page content. Do not invent.",
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
                          enum: ["Main", "Side", "Drink", "Dessert", "Snack", "Bowl", "Wrap", "Salad"],
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
