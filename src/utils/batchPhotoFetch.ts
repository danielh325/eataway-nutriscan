import { supabase } from "@/integrations/supabase/client";
import { foodSpots } from "@/data/foodSpots";

// Call this once to populate the DB with all Google Places photos
export async function triggerBatchPhotoFetch() {
  const spotInfos = foodSpots.map(s => ({
    name: s.name,
    address: s.address,
    categories: s.categories,
  }));
  
  // Split into chunks of 50 to avoid timeout
  const chunkSize = 50;
  let totalFetched = 0;
  let totalCached = 0;

  for (let i = 0; i < spotInfos.length; i += chunkSize) {
    const chunk = spotInfos.slice(i, i + chunkSize);
    console.log(`Fetching photos batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(spotInfos.length / chunkSize)}...`);
    
    try {
      const { data, error } = await supabase.functions.invoke("batch-fetch-photos", {
        body: { spotInfos: chunk },
      });

      if (error) {
        console.error("Batch fetch error:", error);
        continue;
      }

      totalFetched += data?.fetched || 0;
      totalCached += data?.alreadyCached || 0;
      console.log(`Batch result: ${data?.fetched} new, ${data?.alreadyCached} cached`);
    } catch (err) {
      console.error("Batch fetch failed:", err);
    }
  }

  console.log(`✅ Photo fetch complete! ${totalFetched} new photos fetched, ${totalCached} already cached.`);
  return { totalFetched, totalCached };
}
