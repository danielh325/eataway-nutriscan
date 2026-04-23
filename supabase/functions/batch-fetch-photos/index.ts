import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

async function isAuthenticatedAdmin(authHeader: string): Promise<boolean> {
  try {
    const anonClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    const userId = claimsData?.claims?.sub;

    if (claimsError || !userId) return false;

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();

    return Boolean(roleData);
  } catch {
    return false;
  }
}

/**
 * Resolve a Google Places Photo API URL to its final CDN URL (no API key exposed).
 */
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

/**
 * Score a Google Places photo for "best food/storefront shot" likelihood.
 * Higher score = more likely to be a real food/storefront photo, not a map/menu/streetview.
 */
function scorePhoto(photo: PlacePhoto): number {
  const { width, height, html_attributions = [] } = photo;
  if (!width || !height) return -100;

  const attrText = html_attributions.join(' ').toLowerCase();

  // Hard reject: streetview / map snapshots
  if (attrText.includes('street view') || attrText.includes('streetview')) return -100;

  const aspectRatio = width / height;
  let score = 0;

  // Aspect ratio scoring (food/storefront photos are landscape, ~1.3-1.8)
  if (aspectRatio >= 1.2 && aspectRatio <= 1.9) {
    score += 50; // ideal landscape
  } else if (aspectRatio >= 0.85 && aspectRatio < 1.2) {
    score += 20; // square-ish (often Instagram-style food shots)
  } else if (aspectRatio > 1.9 && aspectRatio <= 2.5) {
    score += 10; // very wide (panoramic exterior - acceptable)
  } else if (aspectRatio < 0.6) {
    score -= 60; // tall portrait → usually menu screenshot or vertical map
  } else if (aspectRatio > 3) {
    score -= 60; // ultra-wide → usually a map strip
  }

  // Resolution scoring (higher res = more likely a real photo, not a generated map)
  const minDim = Math.min(width, height);
  if (minDim >= 2000) score += 30;
  else if (minDim >= 1200) score += 20;
  else if (minDim >= 800) score += 10;
  else if (minDim < 400) score -= 20;

  // Mega photos boost (DSLR / professional shots)
  if (width >= 3000 && height >= 2000) score += 15;

  return score;
}

/**
 * Fetch full place details (gets up to 10 photos with metadata) and pick the best one.
 */
async function fetchBestPhotoForPlace(placeId: string, apiKey: string): Promise<{ photoRef: string; score: number } | null> {
  try {
    const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=photos&key=${apiKey}`;
    const res = await fetch(detailsUrl);
    const data = await res.json();
    const photos: PlacePhoto[] = data.result?.photos || [];
    if (!photos.length) return null;

    // Score each, pick best
    const scored = photos
      .map((p) => ({ photo: p, score: scorePhoto(p) }))
      .filter((s) => s.score > -50) // remove hard-rejects
      .sort((a, b) => b.score - a.score);

    if (!scored.length) return null;
    const best = scored[0];
    return { photoRef: best.photo.photo_reference, score: best.score };
  } catch (err) {
    console.error('Place details fetch error:', err);
    return null;
  }
}

async function fetchPlacePhoto(spotInfo: { name: string; address?: string; categories?: string[] }, apiKey: string): Promise<string | null> {
  try {
    const isHawkerOrFoodCourt = spotInfo.categories?.some(c => ['Hawker', 'Food Court'].includes(c));

    const parenMatch = spotInfo.name.match(/^(.+?)\s*\((.+)\)$/);
    const brandName = parenMatch ? parenMatch[1].trim() : spotInfo.name;
    const locationName = parenMatch ? parenMatch[2].trim() : null;

    const queries: string[] = [];
    
    if (isHawkerOrFoodCourt) {
      if (parenMatch) {
        queries.push(`${brandName} ${locationName} Singapore`);
        queries.push(`${brandName} food court Singapore`);
      } else {
        queries.push(`${spotInfo.name} hawker centre Singapore`);
        queries.push(`${spotInfo.name} Singapore`);
      }
    } else {
      if (locationName) {
        queries.push(`${brandName} ${locationName} Singapore`);
      }
      if (spotInfo.address) {
        queries.push(`${spotInfo.name} ${spotInfo.address}`);
      }
      queries.push(`${brandName} restaurant Singapore`);
      queries.push(`${brandName} food Singapore`);
      queries.push(`${brandName} Singapore`);
    }

    const blockedTypes = ['beauty_salon', 'spa', 'hair_care'];

    for (const searchQuery of queries) {
      const textSearchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
      const textRes = await fetch(textSearchUrl);
      const textData = await textRes.json();

      if (textData.status !== 'OK' || !textData.results?.length) {
        continue;
      }

      for (const candidate of textData.results.slice(0, 3)) {
        const matchedName = candidate.name || '';
        const types: string[] = candidate.types || [];

        if (types.some((t: string) => blockedTypes.includes(t))) continue;
        if (!candidate.place_id) continue;

        const brandWords = brandName.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        const matchedLower = matchedName.toLowerCase();
        const matchedWords = matchedLower.split(/\s+/).filter((w: string) => w.length > 2);
        
        const hasOverlap = brandWords.some((w: string) => matchedLower.includes(w)) ||
                           matchedWords.some((w: string) => brandName.toLowerCase().includes(w));

        if (!hasOverlap) continue;

        // 🎯 Smart photo picking: get all photos, score, pick best
        const best = await fetchBestPhotoForPlace(candidate.place_id, apiKey);
        if (!best) {
          console.log(`⚠️ "${spotInfo.name}" → "${matchedName}" matched but no good photos`);
          continue;
        }

        console.log(`✅ "${spotInfo.name}" → "${matchedName}" via "${searchQuery}" (best score: ${best.score})`);
        return await resolvePhotoUrl(best.photoRef, apiKey);
      }
    }

    // Last-resort: any food place
    const lastResortQuery = `${brandName} Singapore`;
    const lastRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(lastResortQuery)}&key=${apiKey}`);
    const lastData = await lastRes.json();
    
    if (lastData.status === 'OK' && lastData.results?.length) {
      for (const candidate of lastData.results.slice(0, 5)) {
        const types: string[] = candidate.types || [];
        if (types.some((t: string) => blockedTypes.includes(t))) continue;
        if (!candidate.place_id) continue;
        
        const foodTypes = ['restaurant', 'food', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'bar'];
        const isFoodPlace = types.some((t: string) => foodTypes.includes(t));
        if (!isFoodPlace) continue;

        const best = await fetchBestPhotoForPlace(candidate.place_id, apiKey);
        if (!best) continue;

        console.log(`✅ Last-resort "${spotInfo.name}" → "${candidate.name}" (score: ${best.score})`);
        return await resolvePhotoUrl(best.photoRef, apiKey);
      }
    }

    console.log(`❌ No photo found for "${spotInfo.name}"`);
    return null;
  } catch (err) {
    console.error(`Error fetching photo for "${spotInfo.name}":`, err);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { spotNames, spotInfos, clearAll, refresh } = body;

    // Auth: require JWT + admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ') || !(await isAuthenticatedAdmin(authHeader))) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    if (clearAll) {
      const { error } = await supabase.from('place_photos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      console.log('Cleared all photos', error ? `Error: ${error.message}` : 'OK');
      return new Response(JSON.stringify({ cleared: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const spots = spotInfos || spotNames?.map((n: string) => ({ name: n }));
    if (!spots || !Array.isArray(spots)) {
      return new Response(JSON.stringify({ error: 'Missing spotNames or spotInfos array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('GOOGLE_PLACES_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GOOGLE_PLACES_API_KEY not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // When refresh=true, fetch ALL spots (overwrite existing). Otherwise skip cached ones.
    let toFetch = spots;
    let alreadyCachedCount = 0;
    if (!refresh) {
      const allNames = spots.map((s: any) => s.name);
      const { data: existing } = await supabase
        .from('place_photos')
        .select('spot_name, photo_url')
        .in('spot_name', allNames);

      const existingNames = new Set(
        (existing || [])
          .filter((row: any) => Boolean(row.photo_url))
          .map((row: any) => row.spot_name)
      );
      alreadyCachedCount = existingNames.size;
      toFetch = spots.filter((s: any) => !existingNames.has(s.name));
    }

    console.log(`Batch fetch (refresh=${Boolean(refresh)}): ${toFetch.length} to fetch (${alreadyCachedCount} already cached)`);

    const results: { name: string; url: string | null }[] = [];
    for (let i = 0; i < toFetch.length; i += 5) {
      const batch = toFetch.slice(i, i + 5);
      const batchResults = await Promise.all(
        batch.map(async (spotInfo: any) => {
          const url = await fetchPlacePhoto(spotInfo, apiKey);
          return { name: spotInfo.name, url };
        })
      );
      results.push(...batchResults);
      
      if (i + 5 < toFetch.length) {
        await new Promise(r => setTimeout(r, 200));
      }
    }

    if (results.length > 0) {
      const rows = results
        .filter(r => r.url) // only upsert successful fetches (preserve old cache on failure)
        .map(r => ({
          spot_name: r.name,
          photo_url: r.url,
        }));

      if (rows.length > 0) {
        const { error: insertError } = await supabase
          .from('place_photos')
          .upsert(rows, { onConflict: 'spot_name' });

        if (insertError) {
          console.error('Insert error:', insertError);
        }
      }
    }

    return new Response(JSON.stringify({ 
      fetched: results.filter(r => r.url).length,
      failed: results.filter(r => !r.url).length,
      alreadyCached: alreadyCachedCount,
      total: spots.length,
      refreshed: Boolean(refresh),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error:', error.message);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
