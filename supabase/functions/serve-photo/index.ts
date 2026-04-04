import { corsHeaders } from '@supabase/supabase-js/cors'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const spotName = url.searchParams.get("spot");

    if (!spotName) {
      return new Response(JSON.stringify({ error: "Missing spot parameter" }), {
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

    if (error || !data?.photo_url) {
      return new Response(JSON.stringify({ error: "Photo not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // photo_url now stores the resolved Google CDN URL (no API key)
    return new Response(JSON.stringify({ photoUrl: data.photo_url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
