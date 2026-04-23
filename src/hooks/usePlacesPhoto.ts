import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Global cache so we only query DB once per session
let dbCache: Map<string, string> | null = null;
let dbFetchPromise: Promise<void> | null = null;

async function loadDbCache() {
  if (dbCache) return;

  const { data } = await supabase
    .from('place_photos' as any)
    .select('spot_name, photo_url');

  dbCache = new Map();
  if (data) {
    for (const row of data as any[]) {
      if (row.photo_url) {
        dbCache.set(row.spot_name, row.photo_url);
      }
    }
  }
}

function ensureDbLoaded(): Promise<void> {
  if (!dbFetchPromise) {
    dbFetchPromise = loadDbCache();
  }
  return dbFetchPromise;
}

export function invalidatePlacesPhotoCache() {
  dbCache = null;
  dbFetchPromise = null;
}

/** Load the DB cache and return the map (for non-hook usage like map markers) */
export async function getPlacesPhotoCache(): Promise<Map<string, string>> {
  await ensureDbLoaded();
  return dbCache ?? new Map();
}

export function usePlacesPhoto(storeName: string, fallbackImage: string): string {
  // Initialise with fallback so first paint is never empty
  const [photoUrl, setPhotoUrl] = useState(fallbackImage);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      await ensureDbLoaded();
      if (cancelled) return;

      const cached = dbCache?.get(storeName);
      if (cached) {
        setPhotoUrl(cached);
      } else {
        // Keep showing the fallback when no DB photo exists
        setPhotoUrl(fallbackImage);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [storeName, fallbackImage]);

  return photoUrl || fallbackImage;
}
