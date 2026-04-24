import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Utensils, Flame, RefreshCw, Star, ChevronDown, Loader2, Sparkles, Beef, Wheat, Droplet, Check, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DishOrderLinks } from "@/components/DishOrderLinks";

interface FieldConfidence {
  name: "verified" | "estimated" | "missing" | "unverified";
  price: "verified" | "estimated" | "missing" | "unverified";
  nutrition: "verified" | "estimated" | "missing" | "unverified";
  branch: "verified" | "estimated" | "missing" | "unverified";
}

interface MenuItem {
  id: string;
  dish_name: string;
  description: string | null;
  cleanDescription: string;
  fieldConfidence: FieldConfidence;
  price: string | null;
  category: string;
  calories_kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  confidence: string;
  ingredients: string[] | null;
  is_popular: boolean;
  image_url: string | null;
  source?: string | null;
}

// Parse the "<!--FC:name=verified;price=...-->" trailer that the scraper appends.
const FC_REGEX = /<!--FC:([^>]+)-->/;
function parseFieldConfidence(description: string | null): {
  cleanDescription: string;
  fieldConfidence: FieldConfidence;
} {
  const fallback: FieldConfidence = {
    name: "unverified",
    price: "unverified",
    nutrition: "estimated",
    branch: "unverified",
  };
  if (!description) {
    return { cleanDescription: "", fieldConfidence: fallback };
  }
  const m = description.match(FC_REGEX);
  if (!m) {
    return { cleanDescription: description.trim(), fieldConfidence: fallback };
  }
  const fc = { ...fallback };
  for (const part of m[1].split(";")) {
    const [k, v] = part.split("=");
    if (k && v && k in fc) {
      (fc as any)[k.trim()] = v.trim();
    }
  }
  const clean = description.replace(FC_REGEX, "").trim();
  return { cleanDescription: clean, fieldConfidence: fc };
}

interface VendorMenuProps {
  spotName: string;
  address?: string;
  menuHighlights?: string[];
}

const CATEGORY_ORDER = ["Main", "Bowl", "Salad", "Wrap", "Side", "Snack", "Drink", "Dessert"];

export function VendorMenu({ spotName, address, menuHighlights }: VendorMenuProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emptyReason, setEmptyReason] = useState<string | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>("All");
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const isScraped = items.length > 0 && items.some((i) => i.source === "scraped");

  const loadFromDB = useCallback(async (): Promise<MenuItem[]> => {
    const { data } = await supabase
      .from("vendor_menu_items")
      .select("*")
      .eq("spot_name", spotName);
    if (data && data.length > 0) {
      const mapped = data.map((item: any) => ({
        ...item,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      }));
      setItems(mapped);
      return mapped;
    }
    return [];
  }, [spotName]);

  // Real menu fetch — scrape Grab/Foodpanda. No AI invention.
  const discoverMenu = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setEmptyReason(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("discover-vendor-menu", {
        body: {
          spotName,
          address,
          menuHighlights,
          forceRefresh,
          quality: "high",
          allowAiFallback: false,
        },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      const menuItems = (data?.items || []).map((item: any) => ({
        ...item,
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
      }));
      setItems(menuItems);
      setSourceUrl(data?.sourceUrl || null);
      if (menuItems.length === 0) {
        setEmptyReason(data?.reason || "Menu not available on delivery platforms");
      }
    } catch (e: any) {
      console.error("Menu fetch error:", e);
      setError(e?.message || "Failed to load menu");
    } finally {
      setLoading(false);
    }
  }, [spotName, address, menuHighlights]);

  useEffect(() => {
    setLoading(true);
    loadFromDB().then((found) => {
      if (found.length === 0) {
        discoverMenu(false);
      } else {
        setLoading(false);
      }
    });
  }, [loadFromDB, discoverMenu]);

  const categories = ["All", ...CATEGORY_ORDER.filter((cat) => items.some((i) => i.category === cat))];
  const filtered = activeCategory === "All" ? items : items.filter((i) => i.category === activeCategory);
  const popular = items.filter((i) => i.is_popular);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/40 bg-white/40 backdrop-blur-xl p-8">
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl" />
            <Loader2 className="relative h-8 w-8 animate-spin text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Fetching real menu…</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Searching Grab & Foodpanda for {spotName}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={() => discoverMenu(true)} className="rounded-xl gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Try Again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card p-6 text-center space-y-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Utensils className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">Menu unavailable</p>
          <p className="text-xs text-muted-foreground">
            {emptyReason || "We couldn't find a verified menu for this vendor on Grab or Foodpanda."}
          </p>
          <p className="text-[11px] text-muted-foreground/80 italic pt-1">
            We don't show AI-guessed menus — only real items we can verify.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => discoverMenu(true)} className="rounded-xl gap-2">
          <RefreshCw className="h-3.5 w-3.5" /> Retry scrape
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Glass header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/40 bg-white/50 backdrop-blur-xl p-4 shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.15)]">
        <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-foreground text-sm leading-none">
                {isScraped ? "Verified Menu" : "Menu"}
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                {items.length} items ·{" "}
                {isScraped ? (
                  <span className="text-primary font-medium">Scraped from delivery app</span>
                ) : (
                  <span>Cached</span>
                )}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => discoverMenu(true)}
            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground rounded-lg gap-1 bg-white/40 backdrop-blur"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      {/* Popular picks */}
      {popular.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            <p className="text-xs font-bold text-foreground uppercase tracking-wider">Popular Picks</p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-1 px-1">
            {popular.map((item) => (
              <button
                key={item.id}
                onClick={() => setExpandedItem(expandedItem === item.id ? null : item.id)}
                className="shrink-0 w-[170px] rounded-xl border border-white/50 bg-white/60 backdrop-blur-md p-3 text-left hover:border-primary/40 hover:bg-white/80 transition-all shadow-sm"
              >
                <div className="flex items-start justify-between mb-1.5">
                  <p className="text-xs font-bold text-foreground line-clamp-2 leading-tight flex-1">
                    {item.dish_name}
                  </p>
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0 ml-1" />
                </div>
                {item.price && (
                  <p className="text-sm font-extrabold text-primary mb-1.5">{item.price}</p>
                )}
                <div className="flex items-center gap-1 px-1.5 py-1 rounded-md bg-orange-50 dark:bg-orange-950/30 w-fit">
                  <Flame className="h-3 w-3 text-orange-500" />
                  <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400">
                    {item.calories_kcal} kcal
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sticky category tabs */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-2 bg-background/80 backdrop-blur-lg border-b border-border/30">
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {categories.map((cat) => {
            const isActive = activeCategory === cat;
            const count = cat === "All" ? items.length : items.filter((i) => i.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : "bg-white/60 backdrop-blur border border-border/40 text-muted-foreground hover:text-foreground hover:bg-white"
                }`}
              >
                {cat} <span className={isActive ? "opacity-80" : "opacity-60"}>· {count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu items — clean delivery-app rows */}
      <div className="space-y-2">
        {filtered.map((item) => {
          const isExpanded = expandedItem === item.id;
          return (
            <div
              key={item.id}
              className={`rounded-2xl border bg-card overflow-hidden transition-all ${
                isExpanded
                  ? "border-primary/40 shadow-md shadow-primary/5"
                  : "border-border/40 hover:border-primary/20"
              }`}
            >
              <button
                onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                className="w-full text-left p-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <h4 className="text-sm font-bold text-foreground truncate">{item.dish_name}</h4>
                      {item.is_popular && (
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                      )}
                    </div>
                    {item.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mb-2">
                        {item.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      {item.price && (
                        <span className="text-sm font-extrabold text-primary">{item.price}</span>
                      )}
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/30">
                        <Flame className="h-3 w-3 text-orange-500" />
                        <span className="text-[11px] font-bold text-orange-700 dark:text-orange-400">
                          {item.calories_kcal} kcal
                        </span>
                      </div>
                      <Badge
                        variant="outline"
                        className={`text-[9px] px-1.5 py-0 h-4 font-semibold ${
                          item.confidence === "high"
                            ? "border-green-500/40 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400"
                            : item.confidence === "medium"
                            ? "border-amber-500/40 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400"
                            : "border-red-500/40 bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                        }`}
                      >
                        {item.confidence}
                      </Badge>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="px-3.5 pb-3.5 pt-1 space-y-3 animate-fade-in border-t border-border/30">
                  {/* Macro tiles */}
                  <div className="grid grid-cols-4 gap-2 mt-3">
                    <MacroTile
                      icon={Flame}
                      value={item.calories_kcal}
                      unit=""
                      label="kcal"
                      tint="orange"
                    />
                    <MacroTile
                      icon={Beef}
                      value={item.protein_g}
                      unit="g"
                      label="protein"
                      tint="blue"
                    />
                    <MacroTile
                      icon={Wheat}
                      value={item.carbs_g}
                      unit="g"
                      label="carbs"
                      tint="amber"
                    />
                    <MacroTile
                      icon={Droplet}
                      value={item.fat_g}
                      unit="g"
                      label="fat"
                      tint="rose"
                    />
                  </div>

                  {/* Macro distribution bar */}
                  {(() => {
                    const total = item.protein_g * 4 + item.carbs_g * 4 + item.fat_g * 9;
                    if (total === 0) return null;
                    const proteinPct = ((item.protein_g * 4) / total) * 100;
                    const carbsPct = ((item.carbs_g * 4) / total) * 100;
                    const fatPct = ((item.fat_g * 9) / total) * 100;
                    return (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[10px] font-medium text-muted-foreground">
                          <span>Macro split</span>
                          <span className="flex gap-2.5">
                            <span className="text-blue-600">P {Math.round(proteinPct)}%</span>
                            <span className="text-amber-600">C {Math.round(carbsPct)}%</span>
                            <span className="text-rose-600">F {Math.round(fatPct)}%</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full overflow-hidden flex bg-secondary">
                          <div className="bg-blue-500 h-full" style={{ width: `${proteinPct}%` }} />
                          <div className="bg-amber-500 h-full" style={{ width: `${carbsPct}%` }} />
                          <div className="bg-rose-500 h-full" style={{ width: `${fatPct}%` }} />
                        </div>
                      </div>
                    );
                  })()}

                  {/* Ingredients */}
                  {item.ingredients && item.ingredients.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                        Ingredients
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {item.ingredients.slice(0, 8).map((ing, j) => (
                          <span
                            key={j}
                            className="text-[10px] px-2 py-0.5 bg-secondary/70 backdrop-blur rounded-full text-muted-foreground"
                          >
                            {ing}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Per-dish order links */}
                  <DishOrderLinks spotName={spotName} dishName={item.dish_name} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MacroTile({
  icon: Icon,
  value,
  unit,
  label,
  tint,
}: {
  icon: any;
  value: number;
  unit: string;
  label: string;
  tint: "orange" | "blue" | "amber" | "rose";
}) {
  const tintMap = {
    orange: "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400",
    blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
    rose: "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400",
  };
  return (
    <div className={`text-center p-2 rounded-xl ${tintMap[tint]}`}>
      <Icon className="h-3 w-3 mx-auto mb-1 opacity-80" />
      <p className="text-sm font-extrabold leading-none">
        {value}
        <span className="text-[10px] font-bold opacity-80">{unit}</span>
      </p>
      <p className="text-[9px] font-medium opacity-75 mt-1 uppercase tracking-wider">{label}</p>
    </div>
  );
}
