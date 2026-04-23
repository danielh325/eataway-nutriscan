import { supabase } from "@/integrations/supabase/client";
import { foodSpots } from "@/data/foodSpots";

/**
 * Trigger a batch fetch of Google Places photos for all vendors.
 * @param refresh If true, re-pick photos for ALL vendors (overwriting existing cache)
 *                using the smart photo scorer. Use this to upgrade old/bad photos.
 */
export async function triggerBatchPhotoFetch(refresh = false) {
  const spotInfos = foodSpots.map(s => ({
    name: s.name,
    address: s.address,
    categories: s.categories,
  }));
  
  // Split into chunks of 30 to avoid timeout (smart picker needs an extra Place Details call per spot)
  const chunkSize = 30;
  let totalFetched = 0;
  let totalFailed = 0;
  let totalCached = 0;

  for (let i = 0; i < spotInfos.length; i += chunkSize) {
    const chunk = spotInfos.slice(i, i + chunkSize);
    console.log(`Fetching photos batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(spotInfos.length / chunkSize)}${refresh ? " (REFRESH)" : ""}...`);
    
    try {
      const { data, error } = await supabase.functions.invoke("batch-fetch-photos", {
        body: { spotInfos: chunk, refresh },
      });

      if (error) {
        const message = error.message || "Batch fetch failed";
        if (/unauthorized|forbidden|admin/i.test(message)) {
          throw new Error("Admin authorization failed. Please log in again.");
        }
        console.error("Batch fetch error:", error);
        continue;
      }

      if ((data as any)?.error) {
        throw new Error((data as any).error);
      }

      totalFetched += data?.fetched || 0;
      totalFailed += data?.failed || 0;
      totalCached += data?.alreadyCached || 0;
      console.log(`Batch result: ${data?.fetched} new, ${data?.failed} failed, ${data?.alreadyCached} cached`);
    } catch (err) {
      console.error("Batch fetch failed:", err);
    }
  }

  console.log(`✅ Photo fetch complete! ${totalFetched} fetched, ${totalFailed} failed, ${totalCached} already cached.`);
  return { totalFetched, totalFailed, totalCached };
}
