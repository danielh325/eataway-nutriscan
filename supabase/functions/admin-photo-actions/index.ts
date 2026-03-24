import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DEFAULT_ADMIN_PASSWORD = "eataway2025";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, adminPassword, spotName, photoUrl, reviewed, hidden } = body ?? {};

    const configuredPassword = Deno.env.get("ADMIN_PASSWORD") ?? DEFAULT_ADMIN_PASSWORD;
    if (typeof adminPassword !== "string" || adminPassword !== configuredPassword) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (typeof spotName !== "string" || !spotName.trim()) {
      return new Response(JSON.stringify({ error: "Missing spotName" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsertPhoto") {
      const { error } = await supabase
        .from("place_photos")
        .upsert({ spot_name: spotName, photo_url: typeof photoUrl === "string" ? photoUrl : null }, { onConflict: "spot_name" });

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deletePhoto") {
      const { error } = await supabase
        .from("place_photos")
        .delete()
        .eq("spot_name", spotName);

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "upsertStatus") {
      const { error } = await supabase
        .from("admin_spot_status")
        .upsert(
          {
            spot_name: spotName,
            reviewed: typeof reviewed === "boolean" ? reviewed : false,
            hidden: typeof hidden === "boolean" ? hidden : false,
          },
          { onConflict: "spot_name" },
        );

      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});