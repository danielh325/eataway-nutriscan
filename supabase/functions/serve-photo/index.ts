import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type RequestBody = {
  spotName?: string;
  address?: string;
  categories?: string[];
};

const GOOGLE_PHOTO_URL_RE = /maps\.googleapis\.com\/maps\/api\/place\/photo/i;

function isUsablePhotoUrl(url?: string | null): url is string {
  return Boolean(url && !GOOGLE_PHOTO_URL_RE.test(url) && !/[?&]key=/i.test(url));
}

function buildQueries(spotName: string, address?: string, categories: string[] = []) {
  const isHawkerOrFoodCourt = categories.some((c) => ["Hawker", "Food Court"].includes(c));
  const parenMatch = spotName.match(/^(.+?)\s*\((.+)\)$/);
  const brandName = parenMatch ? parenMatch[1].trim() : spotName;
  const locationName = parenMatch ? parenMatch[2].trim() : null;
  const queries: string[] = [];

  if (isHawkerOrFoodCourt) {
    if (parenMatch) {
      queries.push(`${brandName} ${locationName} Singapore`);
      queries.push(`${brandName} food court Singapore`);
    } else {
      queries.push(`${spotName} hawker centre Singapore`);
      queries.push(`${spotName} Singapore`);
    }
  } else {
    if (locationName) queries.push(`${brandName} ${locationName} Singapore`);
    if (address) queries.push(`${spotName} ${address}`);
    queries.push(`${brandName} restaurant Singapore`);
    queries.push(`${brandName} food Singapore`);
    queries.push(`${brandName} Singapore`);
  }

  return { queries, brandName };
}

async function resolvePhotoUrl(photoRef: string, apiKey: string, maxWidth = 800): Promise<string | null> {
  try {
    const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoRef}&key=${apiKey}`;
    const res = await fetch(googleUrl, { redirect: "follow" });
    if (res.ok || res.status === 302) {
      return res.url;
    }
    return null;
  } catch {
    return null;
  }
}

type PlacePhoto = {
  photo_reference: string;
  width: number;
  height: number;
  html_attributions?: string[];
};

function scorePhoto(photo: PlacePhoto): number {
  const { width, height, html_attributions = [] } = photo;
  if (!width || !height) return -100;

  const attrText = html_attributions.join(" ").toLowerCase();
  if (attrText.includes("street view") || attrText.includes("streetview") || attrText.includes("maps")) return -100;

  const aspectRatio = width / height;
  let score = 0;

  if (aspectRatio >= 1.2 && aspectRatio <= 1.9) score += 50;
  else if (aspectRatio >= 0.85 && aspectRatio < 1.2) score += 20;
  else if (aspectRatio > 1.9 && aspectRatio <= 2.5) score += 10;
  else if (aspectRatio < 0.6 || aspectRatio > 3) score -= 60;

  const minDim = Math.min(width, height);
  if (minDim >= 2000) score += 30;
  else if (minDim >= 1200) score += 20;
  else if (minDim >= 800) score += 10;
  else if (minDim < 400) score -= 20;

  if (width >= 3000 && height >= 2000) score += 15;
  return score;
}

async function fetchBestPhotoForPlace(placeId: string, apiKey: string): Promise<string | null> {
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${apiKey}`;
    const res = await fetch(detailsUrl);
    const data = await res.json();
    const photos: PlacePhoto[] = data.result?.photos || [];
    if (!photos.length) return null;

    const best = photos
      .map((photo) => ({ photo, score: scorePhoto(photo) }))
      .filter((entry) => entry.score > -50)
      .sort((a, b) => b.score - a.score)[0];

    if (!best) return null;
    return resolvePhotoUrl(best.photo.photo_reference, apiKey);
  } catch (error) {
    console.error("Place details fetch error:", error);
    return null;
  }
}

async function fetchFreshPhotoUrl(spotName: string, address: string | undefined, categories: string[], apiKey: string): Promise<string | null> {
  const { queries, brandName } = buildQueries(spotName, address, categories);
  const blockedTypes = ["beauty_salon", "spa", "hair_care"];

  for (const searchQuery of queries) {
    const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
    const textRes = await fetch(textSearchUrl);
    const textData = await textRes.json();

    if (textData.status !== "OK" || !textData.results?.length) continue;

    for (const candidate of textData.results.slice(0, 3)) {
      const matchedName = candidate.name || "";
      const types: string[] = candidate.types || [];
      if (types.some((type) => blockedTypes.includes(type))) continue;
      if (!candidate.place_id) continue;

      const brandWords = brandName.toLowerCase().split(/\s+/).filter((word: string) => word.length > 2);
      const matchedLower = matchedName.toLowerCase();
      const matchedWords = matchedLower.split(/\s+/).filter((word: string) => word.length > 2);
      const hasOverlap = brandWords.some((word: string) => matchedLower.includes(word)) || matchedWords.some((word: string) => brandName.toLowerCase().includes(word));
      if (!hasOverlap) continue;

      const photoUrl = await fetchBestPhotoForPlace(candidate.place_id, apiKey);
      if (photoUrl) return photoUrl;
    }
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as RequestBody;
    const spotName = body.spotName?.trim();
    const address = body.address?.trim();
    const categories = Array.isArray(body.categories) ? body.categories.filter((value): value is string => typeof value === "string") : [];

    if (!spotName) {
      return new Response(JSON.stringify({ error: "Missing spotName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("place_photos")
      .select("photo_url")
      .eq("spot_name", spotName)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: "Photo lookup failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isUsablePhotoUrl(data?.photo_url)) {
      return new Response(JSON.stringify({ photoUrl: data.photo_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GOOGLE_PLACES_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ photoUrl: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const freshUrl = await fetchFreshPhotoUrl(spotName, address, categories, apiKey);

    if (freshUrl) {
      await supabase
        .from("place_photos")
        .upsert({ spot_name: spotName, photo_url: freshUrl }, { onConflict: "spot_name" });
    }

    return new Response(JSON.stringify({ photoUrl: freshUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
