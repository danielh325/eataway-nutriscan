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
 * Resolve a Google Places Photo API URL to its final CDN URL (no API key).
 * Google redirects to lh3.googleusercontent.com — we store that instead.
 */
async function resolvePhotoUrl(photoRef: string, apiKey: string, maxWidth = 800): Promise<string | null> {
  try {
    const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=${maxWidth}&photoreference=${photoRef}&key=${apiKey}`;
    const res = await fetch(googleUrl, { redirect: "follow" });
    if (res.ok || res.status === 302) {
      // After following redirects, res.url is the final CDN URL
      return res.url;
    }
    return null;
  } catch {
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
        if (!candidate.photos?.length) continue;

        const brandWords = brandName.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2);
        const matchedLower = matchedName.toLowerCase();
        const matchedWords = matchedLower.split(/\s+/).filter((w: string) => w.length > 2);
        
        const hasOverlap = brandWords.some((w: string) => matchedLower.includes(w)) ||
                           matchedWords.some((w: string) => brandName.toLowerCase().includes(w));

        if (!hasOverlap) continue;

        const photoRef = candidate.photos[0].photo_reference;
        console.log(`✅ Matched "${spotInfo.name}" -> "${matchedName}" via "${searchQuery}"`);
        // Resolve to final CDN URL (no API key exposed)
        return await resolvePhotoUrl(photoRef, apiKey);
      }
    }

    const lastResortQuery = `${brandName} Singapore`;
    const lastRes = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(lastResortQuery)}&key=${apiKey}`);
    const lastData = await lastRes.json();
    
    if (lastData.status === 'OK' && lastData.results?.length) {
      for (const candidate of lastData.results.slice(0, 5)) {
        const types: string[] = candidate.types || [];
        if (types.some((t: string) => blockedTypes.includes(t))) continue;
        if (!candidate.photos?.length) continue;
        
        const foodTypes = ['restaurant', 'food', 'cafe', 'bakery', 'meal_takeaway', 'meal_delivery', 'bar'];
        const isFoodPlace = types.some((t: string) => foodTypes.includes(t));
        if (isFoodPlace) {
          const photoRef = candidate.photos[0].photo_reference;
          console.log(`✅ Last-resort match "${spotInfo.name}" -> "${candidate.name}" (food type)`);
          return await resolvePhotoUrl(photoRef, apiKey);
        }
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
    const { spotNames, spotInfos, clearAll } = body;

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
    const toFetch = spots.filter((s: any) => !existingNames.has(s.name));

    console.log(`Batch fetch: ${toFetch.length} new spots to fetch (${existingNames.size} already cached)`);

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
      const rows = results.map(r => ({
        spot_name: r.name,
        photo_url: r.url,
      }));

      const { error: insertError } = await supabase
        .from('place_photos')
        .upsert(rows, { onConflict: 'spot_name' });

      if (insertError) {
        console.error('Insert error:', insertError);
      }
    }

    return new Response(JSON.stringify({ 
      fetched: results.length, 
      alreadyCached: existingNames.size,
      total: spots.length 
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
