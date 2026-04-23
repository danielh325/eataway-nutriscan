import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FoodSpot } from "@/data/types";

/**
 * Two-tier background pre-scan for vendor menus:
 *
 *  Tier 1 — FAST burst (first paint):
 *    The top `fastCount` visible vendors get a quick lite-model scan immediately.
 *    Goal: every vendor the user is likely to tap first has a menu instantly.
 *
 *  Tier 2 — QUALITY scan (background, throttled):
 *    Remaining vendors are scanned with the full pipeline (Places + flash model).
 *
 *  Tier 3 — REFINE pass (idle):
 *    Periodically picks one fast-scanned vendor and re-runs it in quality mode,
 *    upgrading "auto-fast" cache rows to "auto" — but skips the vendor the user
 *    is currently viewing (passed via `currentlyViewing`) so we don't fight their fetch.
 */
export function usePrescanMenus(
  spots: FoodSpot[],
  options: {
    enabled?: boolean;
    fastCount?: number;
    qualityDelayMs?: number;
    fastDelayMs?: number;
    qualityLimit?: number;
    refineIntervalMs?: number;
    currentlyViewing?: string | null;
  } = {}
) {
  const {
    enabled = true,
    fastCount = 3,
    fastDelayMs = 600,
    qualityDelayMs = 4000,
    qualityLimit = 10,
    refineIntervalMs = 45 * 1000,
    currentlyViewing = null,
  } = options;

  const attemptedFastRef = useRef<Set<string>>(new Set());
  const attemptedQualityRef = useRef<Set<string>>(new Set());
  const refinedRef = useRef<Set<string>>(new Set());
  const burstRunningRef = useRef(false);
  const viewingRef = useRef<string | null>(currentlyViewing);
  viewingRef.current = currentlyViewing;

  useEffect(() => {
    if (!enabled || spots.length === 0) return;

    let cancelled = false;

    const callDiscover = async (spot: FoodSpot, quality: "fast" | "high") => {
      try {
        await supabase.functions.invoke("discover-vendor-menu", {
          body: {
            spotName: spot.name,
            address: spot.address,
            menuHighlights: spot.menuHighlights,
            forceRefresh: false,
            quality,
          },
        });
        console.log(`[prescan:${quality}] ✓ ${spot.name}`);
      } catch (e) {
        console.warn(`[prescan:${quality}] ✗ ${spot.name}`, e);
      }
    };

    const runBurst = async () => {
      if (burstRunningRef.current) return;
      burstRunningRef.current = true;

      try {
        // ── TIER 1 — FAST burst on the first few vendors ────────────────────
        const fastCandidates = spots
          .slice(0, fastCount)
          .filter((s) => !attemptedFastRef.current.has(s.name));

        if (fastCandidates.length > 0) {
          // Skip those that already have any cache row
          const names = fastCandidates.map((s) => s.name);
          const { data: existing } = await supabase
            .from("vendor_menu_items")
            .select("spot_name")
            .in("spot_name", names);
          const cached = new Set((existing || []).map((r) => r.spot_name));
          const toFastScan = fastCandidates.filter((s) => !cached.has(s.name));
          fastCandidates.forEach((s) => attemptedFastRef.current.add(s.name));

          // Fire fast scans in parallel with tiny stagger — these are cheap
          for (const spot of toFastScan) {
            if (cancelled) break;
            callDiscover(spot, "fast"); // no await — parallelize
            await new Promise((r) => setTimeout(r, fastDelayMs));
          }
        }

        // ── TIER 2 — QUALITY scan for the rest, sequential & throttled ──────
        const qualityCandidates = spots
          .slice(0, qualityLimit)
          .filter((s) => !attemptedQualityRef.current.has(s.name));

        if (qualityCandidates.length > 0) {
          const names = qualityCandidates.map((s) => s.name);
          const { data: existing } = await supabase
            .from("vendor_menu_items")
            .select("spot_name, source")
            .in("spot_name", names);
          // A vendor is "done" for quality only if it has non-fast rows
          const qualityDone = new Set(
            (existing || [])
              .filter((r: any) => r.source !== "auto-fast")
              .map((r: any) => r.spot_name)
          );
          const toQualityScan = qualityCandidates.filter((s) => !qualityDone.has(s.name));
          qualityCandidates.forEach((s) => attemptedQualityRef.current.add(s.name));

          for (const spot of toQualityScan) {
            if (cancelled) break;
            // Don't quality-scan the vendor user is actively viewing — its detail view fetches its own data
            if (viewingRef.current === spot.name) continue;
            await callDiscover(spot, "high");
            if (!cancelled) await new Promise((r) => setTimeout(r, qualityDelayMs));
          }
        }
      } catch (e) {
        console.warn("[prescan] burst error:", e);
      } finally {
        burstRunningRef.current = false;
      }
    };

    // ── TIER 3 — REFINE: upgrade one fast-scanned vendor every interval ────
    const runRefine = async () => {
      try {
        // Find vendors that only have fast-quality cache and aren't being viewed
        const { data } = await supabase
          .from("vendor_menu_items")
          .select("spot_name, source")
          .eq("source", "auto-fast")
          .limit(50);
        const fastOnly = Array.from(
          new Set((data || []).map((r: any) => r.spot_name))
        ).filter(
          (name) => name !== viewingRef.current && !refinedRef.current.has(name)
        );
        if (fastOnly.length === 0) return;

        const target = spots.find((s) => s.name === fastOnly[0]);
        if (!target) return;

        refinedRef.current.add(target.name);
        console.log(`[prescan:refine] upgrading ${target.name}`);
        await callDiscover(target, "high");
      } catch (e) {
        console.warn("[prescan:refine] error:", e);
      }
    };

    const w = typeof window !== "undefined" ? window : undefined;
    // Burst right after first paint settles
    const idleHandle =
      w && "requestIdleCallback" in w
        ? (w as any).requestIdleCallback(runBurst, { timeout: 1500 })
        : (w?.setTimeout(runBurst, 1000) ?? 0);

    // Background refine loop
    const intervalId = w?.setInterval(runRefine, refineIntervalMs) ?? 0;

    return () => {
      cancelled = true;
      if (w && "cancelIdleCallback" in w) {
        (w as any).cancelIdleCallback(idleHandle);
      } else if (w) {
        w.clearTimeout(idleHandle as number);
      }
      if (w) w.clearInterval(intervalId);
    };
  }, [spots, enabled, fastCount, fastDelayMs, qualityDelayMs, qualityLimit, refineIntervalMs]);
}
