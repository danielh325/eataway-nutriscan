import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

type UsePlacesPhotoOptions = {
  address?: string;
  categories?: string[];
};

const GOOGLE_PHOTO_URL_RE = /maps\.googleapis\.com\/maps\/api\/place\/photo/i;

// Global cache so we only query DB once per session
let dbCache: Map<string, string> | null = null;
let dbFetchPromise: Promise<void> | null = null;
const runtimePhotoCache = new Map<string, string>();
const inflightPhotoFetches = new Map<string, Promise<string | null>>();

function isUsablePhotoUrl(url?: string | null): url is string {
  return Boolean(url && !GOOGLE_PHOTO_URL_RE.test(url) && !/[?&]key=/i.test(url));
}

async function loadDbCache() {
  if (dbCache) return;

  const { data } = await supabase
    .from("place_photos" as any)
    .select("spot_name, photo_url");

  dbCache = new Map();
  if (data) {
    for (const row of data as any[]) {
      if (isUsablePhotoUrl(row.photo_url)) {
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

async function refreshPhotoFromBackend(storeName: string, options: UsePlacesPhotoOptions): Promise<string | null> {
  const requestKey = JSON.stringify([storeName, options.address ?? "", (options.categories ?? []).join("|")]);
  if (inflightPhotoFetches.has(requestKey)) {
    return inflightPhotoFetches.get(requestKey)!;
  }

  const request = supabase.functions
    .invoke("serve-photo", {
      body: {
        spotName: storeName,
        address: options.address,
        categories: options.categories ?? [],
      },
    })
    .then(({ data, error }) => {
      if (error) throw error;
      const freshUrl = (data as { photoUrl?: string | null } | null)?.photoUrl;
      if (!isUsablePhotoUrl(freshUrl)) return null;

      runtimePhotoCache.set(storeName, freshUrl);
      if (!dbCache) dbCache = new Map();
      dbCache.set(storeName, freshUrl);
      return freshUrl;
    })
    .catch((error) => {
      console.warn(`[photo] failed to refresh ${storeName}`, error);
      return null;
    })
    .finally(() => {
      inflightPhotoFetches.delete(requestKey);
    });

  inflightPhotoFetches.set(requestKey, request);
  return request;
}

export function invalidatePlacesPhotoCache() {
  dbCache = null;
  dbFetchPromise = null;
  runtimePhotoCache.clear();
  inflightPhotoFetches.clear();
}

/** Load the DB cache and return the map (for non-hook usage like map markers) */
export async function getPlacesPhotoCache(): Promise<Map<string, string>> {
  await ensureDbLoaded();
  return new Map([...(dbCache ?? new Map()), ...runtimePhotoCache]);
}

export function usePlacesPhoto(storeName: string, fallbackImage: string, options: UsePlacesPhotoOptions = {}): string {
  const categoriesKey = (options.categories ?? []).join("|");
  const [photoUrl, setPhotoUrl] = useState(() => runtimePhotoCache.get(storeName) ?? fallbackImage);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const runtimeUrl = runtimePhotoCache.get(storeName);
      if (runtimeUrl) {
        setPhotoUrl(runtimeUrl);
        return;
      }

      await ensureDbLoaded();
      if (cancelled) return;

      const cached = dbCache?.get(storeName);
      if (cached) {
        setPhotoUrl(cached);
        return;
      }

      setPhotoUrl(fallbackImage);

      const refreshed = await refreshPhotoFromBackend(storeName, options);
      if (!cancelled && refreshed) {
        setPhotoUrl(refreshed);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [storeName, fallbackImage, options.address, categoriesKey]);

  return photoUrl || fallbackImage;
}
