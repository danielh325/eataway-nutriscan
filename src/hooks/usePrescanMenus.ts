import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FoodSpot } from "@/data/types";

/**
 * Background pre-scan: kicks off menu discovery for vendors that don't have
 * cached menu items yet. Runs idle (after page settles), throttled to avoid
 * hitting AI rate limits, and skips vendors already cached.
 *
 * - Limits to the first N spots (closest in viewport order)
 * - Spaces requests by `delayMs` to avoid 429 from Gemini
 * - Re-runs at `refreshIntervalMs` to keep data warm while user is on the page
 *   (but NOT while they're viewing a vendor — that triggers its own fetch)
 */
export function usePrescanMenus(
  spots: FoodSpot[],
  options: {
    enabled?: boolean;
    maxConcurrent?: number;
    delayMs?: number;
    limit?: number;
    refreshIntervalMs?: number;
  } = {}
) {
  const {
    enabled = true,
    delayMs = 4000,
    limit = 10,
    refreshIntervalMs = 30 * 60 * 1000, // 30 min
  } = options;

  // Track which spots we've already attempted in this session
  const attemptedRef = useRef<Set<string>>(new Set());
  const runningRef = useRef(false);

  useEffect(() => {
    if (!enabled || spots.length === 0) return;

    let cancelled = false;

    const runPrescan = async () => {
      if (runningRef.current) return;
      runningRef.current = true;

      try {
        const candidates = spots
          .filter((s) => !attemptedRef.current.has(s.name))
          .slice(0, limit);

        if (candidates.length === 0) {
          runningRef.current = false;
          return;
        }

        // Check which ones already have cached menu items in DB
        const names = candidates.map((s) => s.name);
        const { data: existing } = await supabase
          .from("vendor_menu_items")
          .select("spot_name")
          .in("spot_name", names);

        const cachedSet = new Set((existing || []).map((r) => r.spot_name));
        const toScan = candidates.filter((s) => !cachedSet.has(s.name));

        // Mark all candidates as attempted (cached ones are "done")
        candidates.forEach((s) => attemptedRef.current.add(s.name));

        if (toScan.length === 0) {
          runningRef.current = false;
          return;
        }

        console.log(`[prescan] Background scanning ${toScan.length} vendors`);

        // Sequential with delay — avoids overwhelming the AI gateway
        for (const spot of toScan) {
          if (cancelled) break;
          try {
            await supabase.functions.invoke("discover-vendor-menu", {
              body: {
                spotName: spot.name,
                address: spot.address,
                menuHighlights: spot.menuHighlights,
                forceRefresh: false,
              },
            });
            console.log(`[prescan] ✓ ${spot.name}`);
          } catch (e) {
            console.warn(`[prescan] ✗ ${spot.name}`, e);
          }
          if (!cancelled) {
            await new Promise((r) => setTimeout(r, delayMs));
          }
        }
      } catch (e) {
        console.warn("[prescan] error:", e);
      } finally {
        runningRef.current = false;
      }
    };

    // Defer to idle so we don't compete with map / image loads
    const w = typeof window !== "undefined" ? window : undefined;
    const idleHandle =
      w && "requestIdleCallback" in w
        ? (w as any).requestIdleCallback(runPrescan, { timeout: 3000 })
        : (w?.setTimeout(runPrescan, 2500) ?? 0);

    const intervalId = w?.setInterval(runPrescan, refreshIntervalMs) ?? 0;

    return () => {
      cancelled = true;
      if (w && "cancelIdleCallback" in w) {
        (w as any).cancelIdleCallback(idleHandle);
      } else if (w) {
        w.clearTimeout(idleHandle as number);
      }
      if (w) w.clearInterval(intervalId);
    };
  }, [spots, enabled, delayMs, limit, refreshIntervalMs]);
}
